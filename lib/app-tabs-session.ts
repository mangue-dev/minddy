import { createHomeTab, moveAppTabBefore, reconcileAppTabs, selectTabAfterClose, sortAppTabs, type AppTab, type AppTabPatch } from "./app-tabs";
import { normalizeAppTabLocation } from "./app-tab-location";
import { AppTabRequestError } from "./app-tabs-api";

/** Whether `url` reopens the remembered destination's page while carrying no
 *  selection of its own: same path, and every URL param or anchor already
 *  present in the remembered href. */
function reopensRemembered(url: string, remembered: string): boolean {
  const parts = (href: string) => {
    const [body = "", ...hash] = href.split("#");
    const [path = "", query = ""] = body.split("?");
    return { path, params: new URLSearchParams(query), hash: hash.join("#") };
  };
  const from = parts(url);
  const to = parts(remembered);
  if (from.path !== to.path) return false;
  if (from.hash && from.hash !== to.hash) return false;
  for (const [key, value] of from.params) {
    if (to.params.get(key) !== value) return false;
  }
  return true;
}

export interface AppTabsTransport {
  create: (ensure: boolean, id: string) => Promise<AppTab>;
  patch: (tab: AppTab, patch: AppTabPatch) => Promise<AppTab>;
  close: (tab: AppTab) => Promise<void>;
  move: (tab: AppTab, beforeId: string | null) => Promise<AppTab[]>;
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
  private writes: Promise<unknown> = Promise.resolve();
  private creating = new Set<string>();
  private closing = new Map<string, AppTab>();
  private locations = new Map<string, string>();
  private order: { id: string; beforeId: string | null }[] = [];
  private orderBase: Map<string, number> | null = null;
  private closed = new Set<string>();
  private disposed = false;
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
    this.locations.delete(id);
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
    if (patch.tabs) for (const move of this.order) patch.tabs = moveAppTabBefore(patch.tabs, move.id, move.beforeId);
    if (patch.tabs) patch.tabs = sortAppTabs(patch.tabs);
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
    if (this.closing.has(tab.id)) {
      const previous = this.closing.get(tab.id)!;
      if (tab.revision >= previous.revision) this.closing.set(tab.id, tab);
      return;
    }
    const previous = this.snapshot.tabs.find((row) => row.id === tab.id);
    if (previous && previous.revision > tab.revision) return;
    const href = this.locations.get(tab.id);
    this.emit({ tabs: sortAppTabs([...this.snapshot.tabs.filter((row) => row.id !== tab.id), href ? { ...tab, href } : tab]) });
  }
  private report(error: unknown) {
    if (error instanceof AppTabRequestError && error.tab) this.merge(error.tab);
    this.emit({ error: error instanceof AppTabRequestError ? error.code : "database" });
  }
  /** Network latency must not hold the window's navigation queue. */
  private persist(action: () => Promise<void>): Promise<void> {
    const next = this.writes.then(async () => {
      if (this.disposed) return;
      try { await action(); } catch (error) { this.report(error); }
    });
    this.writes = next;
    return next;
  }
  private run(action: () => Promise<void>): Promise<void> {
    const next = this.queue.then(async () => {
      if (this.disposed) return;
      this.emit({ busy: true, error: null });
      try { await action(); }
      catch (error) {
        this.report(error);
      } finally { this.emit({ busy: false }); }
    });
    this.queue = next;
    return next;
  }
  private active() { return this.snapshot.tabs.find((tab) => tab.id === this.snapshot.activeId); }

  /** Remote edits update rows without changing this window's route. */
  receive(rows: AppTab[]) {
    if (this.orderBase) this.orderBase = new Map(rows.map((row) => [row.id, row.position]));
    for (const tab of reconcileAppTabs(rows, this.owner)) {
      if (this.closing.has(tab.id)) this.merge(tab);
    }
    const incoming = reconcileAppTabs(rows, this.owner).filter((tab) => !this.closed.has(tab.id) && !this.closing.has(tab.id));
    for (const tab of this.snapshot.tabs) {
      if (this.creating.has(tab.id) && !incoming.some((row) => row.id === tab.id)) incoming.push(tab);
    }
    const active = this.active();
    const missing = active && !incoming.some((tab) => tab.id === active.id);
    const currentById = new Map(this.snapshot.tabs.map((tab) => [tab.id, tab]));
    const tabs = incoming.map((tab) => {
      const current = currentById.get(tab.id);
      const canonical = current && current.revision > tab.revision ? current : tab;
      const href = this.locations.get(tab.id);
      return href ? { ...canonical, href } : canonical;
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
      const normalized = normalizeAppTabLocation(href) ?? "/home";
      const explicit = href !== "/home";
      // The load destination claims the row that CONVENTIONALLY ALREADY shows it:
      // a live reload (the URL still points at the tab the previous session left
      // open) restores that tab, a typed or shared deep link reuses a tab that
      // already displays it, and only otherwise the first row. Defaulting to
      // `tabs[0]` unconditionally is what ground the first tab's location under
      // the load URL — the home tab turned into a replica of the current page.
      const restoredHref = restored ? normalizeAppTabLocation(restored.href) : null;
      const restoredTab = restored ? this.snapshot.tabs.find((tab) => tab.id === restored.id) : null;
      // Several surfaces keep their selection out of the address and publish
      // the href that reconstructs them instead (/pull-requests hides `?pr=`,
      // /agents removes `?run=`). A reload of such a page lands on a URL that
      // is a prefix of the remembered destination: when the remembered tab
      // opens the same page and the URL brings no selection of its own, the
      // load restores that tab — it is not a deep link free to claim another
      // row and grind its location under the load URL.
      const reloaded = Boolean(restoredTab && restoredHref && reopensRemembered(normalized, restoredHref));
      const chosen =
        (restoredTab && (!explicit || restoredHref === normalized || reloaded)
          ? restoredTab
          : explicit
            ? this.snapshot.tabs.find((tab) => tab.href === normalized) ?? this.snapshot.tabs[0]
            : null)
        ?? this.snapshot.tabs[0];
      if (!chosen || this.disposed) return;
      const destination = explicit
        ? reloaded
          ? restoredHref ?? normalized
          : normalized
        : restoredTab && restoredTab.id === chosen.id
          ? restoredHref ?? chosen.href
          : chosen.href;
      this.emit({ activeId: chosen.id });
      this.activeHref = destination;
      this.observedHref = destination;
      this.remember(chosen.id, destination);
      if (destination !== href && (!explicit || reloaded)) { this.setTarget(destination); this.navigate(destination); }
      else if (destination !== chosen.href) { this.locations.set(chosen.id, destination); await this.flushLocation(); }
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
    this.locations.set(this.snapshot.activeId, next);
    const tab = this.active();
    if (tab) this.merge(tab);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flushLocation(), 250);
  }

  private async createOnServer(id: string) {
    if (!this.creating.has(id)) return;
    const tab = await this.transport.create(false, id);
    this.creating.delete(id);
    this.merge(tab);
  }
  private flushLocation() {
    clearTimeout(this.timer);
    const ids = [...this.locations.keys()];
    return this.persist(async () => {
      for (const id of ids) {
        if (this.closing.has(id) || this.closed.has(id)) continue;
        const href = this.locations.get(id);
        if (!href) continue;
        await this.createOnServer(id);
        const tab = this.snapshot.tabs.find((row) => row.id === id);
        if (!tab) continue;
        const saved = await this.transport.patch(tab, { href });
        if (this.locations.get(id) === href) this.locations.delete(id);
        this.merge(saved);
      }
    });
  }
  private select(tab: AppTab) {
    if (this.disposed) return;
    const previous = this.snapshot.activeId;
    if (this.snapshot.recovering && previous && previous !== tab.id) {
      this.forget(previous);
      this.emit({ tabs: this.snapshot.tabs.filter((row) => row.id !== previous) });
    }
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
    if (!this.snapshot.recovering) void this.flushLocation();
    const tab = this.snapshot.tabs.find((row) => row.id === id);
    if (tab) this.select(tab);
  });
  create = (href: string = "/home") => {
    if (this.disposed) return Promise.resolve();
    const destination = normalizeAppTabLocation(href) ?? "/home";
    const position = this.snapshot.tabs.reduce((maximum, row) => Math.max(maximum, row.position), -1) + 1;
    const tab = { ...createHomeTab(this.owner, crypto.randomUUID(), position), href: destination };
    this.creating.add(tab.id);
    if (destination !== "/home") this.locations.set(tab.id, destination);
    this.merge(tab);
    void this.persist(() => this.createOnServer(tab.id));
    if (destination !== "/home") void this.flushLocation();
    return this.run(async () => {
      if (!(await this.saveEditors())) return;
      if (!this.snapshot.recovering) void this.flushLocation();
      this.select(tab);
    });
  };
  goHome = () => this.run(async () => {
    if (!(await this.saveEditors())) return;
    const tab = this.active();
    if (!tab) return;
    if (this.snapshot.recovering) return;
    this.locations.set(tab.id, "/home");
    void this.flushLocation();
    this.select({ ...tab, href: "/home" });
  });
  update = (id: string, patch: AppTabPatch) => {
    this.emit({ error: null });
    return this.persist(async () => {
      await this.createOnServer(id);
      const tab = this.snapshot.tabs.find((row) => row.id === id);
      if (tab) this.merge(await this.transport.patch(tab, patch));
    });
  };
  move = (id: string, beforeId: string | null) => this.run(async () => {
    const previous = this.snapshot.tabs;
    const tab = previous.find((row) => row.id === id);
    if (!tab || id === beforeId || (beforeId && !previous.some((row) => row.id === beforeId && row.pinned === tab.pinned))) return;
    const move = { id, beforeId };
    this.orderBase ??= new Map(previous.map((row) => [row.id, row.position]));
    this.order.push(move);
    this.emit({ tabs: [...previous] });
    void this.persist(async () => {
      try {
        await this.createOnServer(id);
        if (beforeId) await this.createOnServer(beforeId);
        const current = this.snapshot.tabs.find((row) => row.id === id);
        if (!current) return;
        const rows = await this.transport.move(current, beforeId);
        this.order = this.order.filter((item) => item !== move);
        this.receive(rows);
      } catch (error) {
        this.order = this.order.filter((item) => item !== move);
        const positions = this.orderBase ?? new Map(previous.map((row) => [row.id, row.position]));
        this.emit({ tabs: this.snapshot.tabs.map((row) => positions.has(row.id) ? { ...row, position: positions.get(row.id)! } : row) });
        throw error;
      } finally {
        this.order = this.order.filter((item) => item !== move);
        if (!this.order.length) this.orderBase = null;
      }
    });
  });
  close = (id: string) => this.run(async () => {
    if (this.snapshot.tabs.length <= 1) return;
    if (id === this.snapshot.activeId) {
      if (!(await this.saveEditors())) return;
    }
    const tab = this.snapshot.tabs.find((row) => row.id === id);
    if (!tab) return;
    const nextId = selectTabAfterClose(this.snapshot.tabs, id, this.snapshot.activeId ?? id);
    this.closing.set(id, tab);
    this.emit({ tabs: this.snapshot.tabs.filter((row) => row.id !== id) });
    if (id === this.snapshot.activeId) {
      const next = this.snapshot.tabs.find((row) => row.id === nextId);
      if (next) this.select(next);
    }
    void this.persist(async () => {
      try {
        await this.createOnServer(id);
        await this.transport.close(this.closing.get(id) ?? tab);
        this.closing.delete(id);
        this.locations.delete(id);
        this.forget(id);
      } catch (error) {
        if (error instanceof AppTabRequestError && error.code === "not_found") {
          this.closing.delete(id); this.locations.delete(id); this.forget(id);
          return;
        }
        const restored = error instanceof AppTabRequestError && error.tab ? error.tab : this.closing.get(id) ?? tab;
        this.closing.delete(id);
        this.merge(restored);
        throw error;
      }
    });
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
    return this.snapshot.recovering ? this.recoverRemoteClose() : this.run(async () => {
      await this.persist(async () => { for (const id of this.creating) await this.createOnServer(id); });
      await this.flushLocation();
    });
  };
  dispose() { this.disposed = true; this.onDispose(); clearTimeout(this.timer); clearTimeout(this.targetTimer); this.guards.clear(); this.listeners.clear(); this.localState.clear(); }
}
