import { reconcileAppTabs, selectTabAfterClose, sortAppTabs, type AppTab, type AppTabPatch } from "./app-tabs";
import { normalizeAppTabLocation } from "./app-tab-location";
import { AppTabRequestError } from "./app-tabs-api";

export interface AppTabsTransport {
  create: (ensure: boolean, id: string) => Promise<AppTab>;
  patch: (tab: AppTab, patch: AppTabPatch) => Promise<AppTab>;
  close: (tab: AppTab) => Promise<void>;
}
export interface AppTabsSnapshot {
  tabs: AppTab[];
  activeId: string | null;
  busy: boolean;
  error: string | null;
  recovering: boolean;
}

/** One window's activation, departure guards, and ordered account mutations. */
export class AppTabsSession {
  private snapshot: AppTabsSnapshot = { tabs: [], activeId: null, busy: false, error: null, recovering: false };
  private listeners = new Set<() => void>();
  private guards = new Set<() => Promise<boolean>>();
  private queue: Promise<unknown> = Promise.resolve();
  private closed = new Set<string>();
  private disposed = false;
  private pendingHref: string | null = null;
  private observedHref: string | null = null;
  private activeHref: string | null = null;
  private target: string | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private targetTimer: ReturnType<typeof setTimeout> | undefined;
  private localState = new Map<string, unknown>();
  private startup: { href: string; restored?: { id: string; href: string } } | null = null;
  getLocalState<T>(key: string): T | undefined { return this.localState.get(key) as T | undefined; }
  setLocalState(key: string, value: unknown) { if (!this.disposed) this.localState.set(key, value); }
  private forget(id: string) {
    this.closed.add(id);
    for (const key of this.localState.keys()) if (key.startsWith(`${id}:`)) this.localState.delete(key);
  }
  getActiveHref = () => this.activeHref;
  navigate: (href: string) => void = () => {};
  remember: (id: string, href: string) => void = () => {};
  onDispose: () => void = () => {};

  constructor(private owner: string, private transport: AppTabsTransport) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private emit(patch: Partial<AppTabsSnapshot>) {
    if (this.disposed) return;
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  registerDeparture = (guard: () => Promise<boolean>) => {
    this.guards.add(guard);
    return () => { this.guards.delete(guard); };
  };
  private async saveEditors(): Promise<boolean> {
    for (const guard of this.guards) {
      if (!(await guard())) { this.emit({ error: "save_failed" }); return false; }
    }
    return !this.disposed;
  }
  private merge(tab: AppTab) {
    if (this.closed.has(tab.id) || this.disposed) return;
    const previous = this.snapshot.tabs.find((row) => row.id === tab.id);
    if (previous && previous.revision > tab.revision) return;
    this.emit({ tabs: sortAppTabs([...this.snapshot.tabs.filter((row) => row.id !== tab.id), tab]) });
  }
  private run(action: () => Promise<void>): Promise<void> {
    const next = this.queue.then(async () => {
      if (this.disposed) return;
      this.emit({ busy: true, error: null });
      try { await action(); }
      catch (error) {
        if (error instanceof AppTabRequestError && error.tab) this.merge(error.tab);
        this.emit({ error: error instanceof AppTabRequestError ? error.code : "database" });
      } finally { this.emit({ busy: false }); }
    });
    this.queue = next;
    return next;
  }
  private active() { return this.snapshot.tabs.find((tab) => tab.id === this.snapshot.activeId); }

  /** Remote edits update rows without changing this window's route. */
  receive(rows: AppTab[]) {
    const incoming = reconcileAppTabs(rows, this.owner).filter((tab) => !this.closed.has(tab.id));
    const active = this.active();
    const missing = active && !incoming.some((tab) => tab.id === active.id);
    const currentById = new Map(this.snapshot.tabs.map((tab) => [tab.id, tab]));
    const tabs = incoming.map((tab) => {
      const current = currentById.get(tab.id);
      return current && current.revision > tab.revision ? current : tab;
    });
    if (missing) tabs.push(active);
    this.emit({ tabs: sortAppTabs(tabs), recovering: Boolean(missing) });
    if (missing) void this.recoverRemoteClose();
  }

  initialize(href: string, restored?: { id: string; href: string }): Promise<void> {
    if (this.snapshot.activeId) return Promise.resolve();
    this.startup = { href, restored };
    return this.run(async () => {
      if (this.snapshot.activeId) return;
      if (!this.snapshot.tabs.length) this.merge(await this.transport.create(true, crypto.randomUUID()));
      const explicit = href !== "/home";
      const chosen = (!explicit && restored ? this.snapshot.tabs.find((tab) => tab.id === restored.id) : null)
        ?? this.snapshot.tabs[0];
      if (!chosen || this.disposed) return;
      const destination = explicit ? normalizeAppTabLocation(href) ?? "/home"
        : restored?.id === chosen.id ? normalizeAppTabLocation(restored.href) ?? chosen.href : chosen.href;
      this.emit({ activeId: chosen.id });
      this.activeHref = destination;
      this.observedHref = destination;
      this.remember(chosen.id, destination);
      if (!explicit && destination !== href) { this.setTarget(destination); this.navigate(destination); }
      else if (destination !== chosen.href) { this.pendingHref = destination; await this.flushLocation(); }
    });
  }

  /** Called only for a committed route or view change, never for a refetch. */
  observe(href: string, published: string | null) {
    if (!this.snapshot.activeId || this.disposed) return;
    const location = normalizeAppTabLocation(href);
    const view = normalizeAppTabLocation(published);
    if (!location) return;
    if (this.target) {
      // A consumed selection acknowledges restoration by publishing its target.
      // If there is no publication, the URL itself is the acknowledgement.
      const targetUrl = new URL(this.target, "https://minddy.invalid");
      const candidate = new URL(view ?? location, "https://minddy.invalid");
      const matches = candidate.pathname === targetUrl.pathname &&
        [...targetUrl.searchParams].every(([key, value]) => candidate.searchParams.get(key) === value);
      if (!matches || location.split(/[?#]/)[0] !== targetUrl.pathname) return;
      this.activeHref = this.target;
      this.observedHref = this.target;
      this.target = null;
      clearTimeout(this.targetTimer);
    }
    const next = view && view.split(/[?#]/)[0] === location.split(/[?#]/)[0] ? view : location;
    if (next === this.observedHref) return;
    this.observedHref = next;
    this.activeHref = next;
    this.emit({});
    this.remember(this.snapshot.activeId, next);
    if (this.snapshot.recovering) return;
    this.pendingHref = next;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.run(() => this.flushLocation()), 250);
  }

  private async flushLocation() {
    clearTimeout(this.timer);
    const href = this.pendingHref;
    const tab = this.active();
    if (!href || !tab || this.snapshot.recovering) return;
    // Leave the write queued after a conflict/network failure so retry can save it.
    this.merge(await this.transport.patch(tab, { href }));
    if (this.pendingHref === href) this.pendingHref = null;
  }
  private select(tab: AppTab) {
    if (this.disposed) return;
    const previous = this.snapshot.activeId;
    if (this.snapshot.recovering && previous && previous !== tab.id) {
      this.forget(previous);
      this.emit({ tabs: this.snapshot.tabs.filter((row) => row.id !== previous) });
    }
    this.pendingHref = null;
    this.setTarget(tab.href);
    this.activeHref = tab.href;
    this.observedHref = tab.href;
    this.emit({ activeId: tab.id, recovering: false });
    this.remember(tab.id, tab.href);
    this.navigate(tab.href);
  }
  private setTarget(href: string) {
    this.target = href;
    clearTimeout(this.targetTimer);
    this.targetTimer = setTimeout(() => {
      this.target = null;
      this.emit({ error: "destination_unavailable" });
    }, 15_000);
  }
  activate = (id: string) => this.run(async () => {
    if (id === this.snapshot.activeId) return;
    if (!(await this.saveEditors())) return;
    if (!this.snapshot.recovering) await this.flushLocation();
    const tab = this.snapshot.tabs.find((row) => row.id === id);
    if (tab) this.select(tab);
  });
  create = () => this.run(async () => {
    if (!(await this.saveEditors())) return;
    if (!this.snapshot.recovering) await this.flushLocation();
    const tab = await this.transport.create(false, crypto.randomUUID());
    this.merge(tab);
    this.select(tab);
  });
  goHome = () => this.run(async () => {
    if (!(await this.saveEditors())) return;
    const tab = this.active();
    if (!tab) return;
    if (this.snapshot.recovering) return;
    this.pendingHref = "/home";
    await this.flushLocation();
    this.select({ ...tab, href: "/home" });
  });
  update = (id: string, patch: AppTabPatch) => this.run(async () => {
    const tab = this.snapshot.tabs.find((row) => row.id === id);
    if (tab) this.merge(await this.transport.patch(tab, patch));
  });
  close = (id: string) => this.run(async () => {
    if (this.snapshot.tabs.length <= 1) return;
    if (id === this.snapshot.activeId) {
      if (!(await this.saveEditors())) return;
      await this.flushLocation();
    }
    const tab = this.snapshot.tabs.find((row) => row.id === id);
    if (!tab) return;
    const nextId = selectTabAfterClose(this.snapshot.tabs, id, this.snapshot.activeId ?? id);
    await this.transport.close(tab);
    this.forget(id);
    this.emit({ tabs: this.snapshot.tabs.filter((row) => row.id !== id) });
    if (id === this.snapshot.activeId) {
      const next = this.snapshot.tabs.find((row) => row.id === nextId);
      if (next) this.select(next);
    }
  });
  recoverRemoteClose = () => this.run(async () => {
    if (!this.snapshot.recovering || !(await this.saveEditors())) return;
    const oldId = this.snapshot.activeId;
    let next = this.snapshot.tabs.find((row) => row.id !== oldId);
    if (!next) { next = await this.transport.create(true, crypto.randomUUID()); this.merge(next); }
    if (oldId) this.forget(oldId);
    this.emit({ tabs: this.snapshot.tabs.filter((row) => row.id !== oldId) });
    this.select(next);
  });
  retry = () => {
    if (!this.snapshot.activeId && this.startup) return this.initialize(this.startup.href, this.startup.restored);
    return this.snapshot.recovering ? this.recoverRemoteClose() : this.run(() => this.flushLocation());
  };
  dispose() { this.disposed = true; this.onDispose(); clearTimeout(this.timer); clearTimeout(this.targetTimer); this.guards.clear(); this.listeners.clear(); this.localState.clear(); }
}
