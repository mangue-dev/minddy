import { describe, expect, it, vi } from "vitest";
import { AppTabsSession, type AppTabsTransport } from "./app-tabs-session";
import { createHomeTab, moveAppTabBefore, type AppTab } from "./app-tabs";
import { AppTabRequestError } from "./app-tabs-api";

function setup(initial: AppTab[] = [createHomeTab("owner"), createHomeTab("owner", undefined, 1)]) {
  let rows = [...initial];
  const transport: AppTabsTransport = {
    create: vi.fn(async (ensure, id) => {
      if (ensure && rows.length) return rows[0];
      const tab = createHomeTab("owner", id, rows.length); rows.push(tab); return tab;
    }),
    patch: vi.fn(async (tab, patch) => {
      const current = rows.find((row) => row.id === tab.id);
      if (!current) throw new AppTabRequestError("not_found");
      if (current.revision !== tab.revision) throw new AppTabRequestError("conflict", current);
      const next = { ...current, ...patch, revision: current.revision + 1 };
      rows = rows.map((row) => row.id === tab.id ? next : row); return next;
    }),
    close: vi.fn(async (tab) => { rows = rows.filter((row) => row.id !== tab.id); }),
    move: vi.fn(async (tab, beforeId) => { rows = moveAppTabBefore(rows, tab.id, beforeId); return rows; }),
  };
  const session = new AppTabsSession("owner", transport);
  const navigate = vi.fn(); session.navigate = navigate; session.receive(rows);
  return { session, transport, navigate, rows: () => rows, replace: (next: AppTab[]) => { rows = next; session.receive(rows); } };
}

describe("application tab sessions", () => {
  it("opens new tabs immediately while outgoing synchronization is slow", async () => {
    const { session, transport, rows, navigate } = setup(); await session.initialize("/home");
    const original = rows()[0];
    let finish!: (tab: AppTab) => void;
    vi.mocked(transport.patch).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    session.observe("/all", null);
    await session.create();
    const first = session.getSnapshot().activeId!;
    expect(first).not.toBe(original.id);
    expect(session.getSnapshot().busy).toBe(false);
    expect(navigate).toHaveBeenLastCalledWith("/home");
    await session.create();
    expect(session.getSnapshot().tabs).toHaveLength(4);
    session.receive(rows());
    expect(session.getSnapshot().tabs).toHaveLength(4);
    expect(session.getSnapshot().recovering).toBe(false);
    finish({ ...original, href: "/all", revision: 2 });
    await session.retry();
    expect(transport.create).toHaveBeenCalledTimes(2); session.dispose();
  });
  it("renders a new tab before a slow departure guard permits activation", async () => {
    const { session } = setup(); await session.initialize("/home");
    const active = session.getSnapshot().activeId;
    let finish!: (saved: boolean) => void;
    session.registerDeparture(() => new Promise((resolve) => { finish = resolve; }));
    const creation = session.create();
    expect(session.getSnapshot().tabs).toHaveLength(3);
    expect(session.getSnapshot().activeId).toBe(active);
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    finish(true);
    await creation;
    expect(session.getSnapshot().activeId).not.toBe(active);
    session.dispose();
  });
  it("creates, activates, and persists a selected destination", async () => {
    const { session, transport, navigate } = setup(); await session.initialize("/home");
    await session.create("/routines?routine=routine-1");
    const created = session.getSnapshot().tabs.find((tab) => tab.id === session.getSnapshot().activeId);
    expect(created?.href).toBe("/routines?routine=routine-1");
    expect(navigate).toHaveBeenLastCalledWith("/routines?routine=routine-1");
    await session.retry();
    expect(transport.patch).toHaveBeenCalledWith(
      expect.objectContaining({ id: created?.id }),
      { href: "/routines?routine=routine-1" },
    );
    session.dispose();
  });
  it("removes a closed tab immediately and ignores stale refetches until confirmation", async () => {
    const { session, transport, rows, navigate } = setup(); await session.initialize("/home");
    const id = session.getSnapshot().activeId!;
    let finish!: () => void;
    vi.mocked(transport.close).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await session.close(id);
    expect(session.getSnapshot().tabs).toHaveLength(1);
    expect(session.getSnapshot().activeId).not.toBe(id);
    expect(navigate).toHaveBeenCalledWith("/home");
    session.receive(rows());
    expect(session.getSnapshot().tabs).toHaveLength(1);
    await session.close(session.getSnapshot().activeId!);
    expect(transport.close).toHaveBeenCalledTimes(1);
    finish(); await session.retry(); session.dispose();
  });
  it("restores a failed close without discarding local state or stealing navigation", async () => {
    const { session, transport, navigate } = setup(); await session.initialize("/home");
    const id = session.getSnapshot().activeId!;
    session.setLocalState(`${id}:view`, "unsaved-filters");
    let fail!: (error: Error) => void;
    vi.mocked(transport.close).mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
    await session.close(id);
    const active = session.getSnapshot().activeId;
    fail(new AppTabRequestError("last_tab"));
    await vi.waitFor(() => expect(session.getSnapshot().error).toBe("last_tab"));
    expect(session.getSnapshot().tabs).toHaveLength(2);
    expect(session.getSnapshot().activeId).toBe(active);
    expect(session.getLocalState(`${id}:view`)).toBe("unsaved-filters");
    expect(navigate).toHaveBeenCalledTimes(1); session.dispose();
  });
  it("retries an uncertain creation using the same ID without losing its destination", async () => {
    const { session, transport } = setup(); await session.initialize("/home");
    vi.mocked(transport.create).mockRejectedValueOnce(new Error("Offline"));
    await session.create();
    const id = session.getSnapshot().activeId!;
    await vi.waitFor(() => expect(session.getSnapshot().error).toBe("database"));
    session.observe("/home", null); session.observe("/all", null);
    await session.retry();
    expect(transport.create).toHaveBeenNthCalledWith(1, false, id);
    expect(transport.create).toHaveBeenNthCalledWith(2, false, id);
    expect(session.getSnapshot().tabs.find((tab) => tab.id === id)?.href).toBe("/all");
    session.dispose();
  });
  it("moves optimistically and rolls back a failed reorder", async () => {
    const { session, transport, rows } = setup(); await session.initialize("/home");
    const [a, b] = rows();
    let fail!: (error: Error) => void;
    vi.mocked(transport.move).mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
    await session.move(b.id, a.id);
    expect(session.getSnapshot().tabs.map((tab) => tab.id)).toEqual([b.id, a.id]);
    session.receive(rows());
    expect(session.getSnapshot().tabs.map((tab) => tab.id)).toEqual([b.id, a.id]);
    fail(new Error("Offline"));
    await vi.waitFor(() => expect(session.getSnapshot().error).toBe("database"));
    expect(session.getSnapshot().tabs.map((tab) => tab.id)).toEqual([a.id, b.id]); session.dispose();
  });
  it("keeps a slow pin request from blocking creation or optimistic closure", async () => {
    const { session, transport, rows } = setup(); await session.initialize("/home");
    const original = rows()[0];
    let finish!: (tab: AppTab) => void;
    vi.mocked(transport.patch).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const pin = session.update(original.id, { pinned: true });
    await session.create();
    const created = session.getSnapshot().activeId!;
    await session.close(created);
    expect(session.getSnapshot().tabs).toHaveLength(2);
    finish({ ...original, pinned: true, revision: 2 });
    await pin; await session.retry();
    expect(transport.close).toHaveBeenCalledWith(expect.objectContaining({ id: created, revision: 1 }));
    expect(session.getSnapshot().tabs).toHaveLength(2); session.dispose();
  });
  it("restores canonical order after two queued reorders both fail", async () => {
    const { session, transport, rows } = setup(); await session.initialize("/home");
    const [a, b] = rows();
    let fail!: (error: Error) => void;
    vi.mocked(transport.move).mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; })).mockRejectedValueOnce(new Error("Offline"));
    await session.move(b.id, a.id);
    await session.move(a.id, b.id);
    fail(new Error("Offline")); await session.retry();
    expect(session.getSnapshot().tabs.map((tab) => tab.id)).toEqual([a.id, b.id]); session.dispose();
  });
  it("can retry failed initial creation even when the empty list has not changed", async () => {
    const { session, transport } = setup([]);
    vi.mocked(transport.create).mockRejectedValueOnce(new Error("Offline"));
    await session.initialize("/home");
    expect(session.getSnapshot().activeId).toBeNull();
    await session.retry();
    expect(session.getSnapshot().tabs).toHaveLength(1);
    expect(session.getSnapshot().activeId).not.toBeNull(); session.dispose();
  });
  it("synchronizes two clients without changing the other client's active route", async () => {
    const first = setup();
    const second = new AppTabsSession("owner", first.transport);
    second.receive(first.rows()); const navigate = vi.fn(); second.navigate = navigate;
    await first.session.initialize("/home"); await second.initialize("/home");
    first.session.observe("/routines?routine=a", null); await first.session.retry();
    second.receive(first.rows());
    expect(second.getActiveHref()).toBe("/home");
    expect(navigate).not.toHaveBeenCalled();
    const other = first.rows().find((tab) => tab.id !== first.session.getSnapshot().activeId)!;
    await first.session.activate(other.id);
    expect(second.getSnapshot().activeId).not.toBe(first.session.getSnapshot().activeId);
    first.session.dispose(); second.dispose();
  });
  it("opens the synchronized destination when a fresh window has no local selection", async () => {
    const a = { ...createHomeTab("owner"), href: "/routines?routine=a" };
    const { session, navigate, transport } = setup([a]);
    await session.initialize("/home");
    expect(navigate).toHaveBeenCalledWith(a.href);
    expect(transport.patch).not.toHaveBeenCalled(); session.dispose();
  });
  it("leaves a notification URL intact while persisting only repeatable selection", async () => {
    const { session, navigate } = setup();
    await session.initialize("/all?issue=notification-issue&view=a");
    expect(navigate).not.toHaveBeenCalled();
    expect(session.getActiveHref()).toBe("/all?view=a"); session.dispose();
  });
  it("prioritizes an explicit deep link over window restoration", async () => {
    const { session, rows, navigate } = setup();
    await session.initialize("/routines?routine=a", { id: rows()[1].id, href: "/all" });
    expect(navigate).not.toHaveBeenCalled();
    expect(session.getSnapshot().tabs.find((row) => row.id === session.getSnapshot().activeId)?.href).toBe("/routines?routine=a");
    session.dispose();
  });
  it("restores on reload without overwriting another tab's location", async () => {
    // The load-time race: a reload lands on the URL the previous session left
    // open (an active tab, not the first row); the first row must keep its own
    // href instead of being overwritten with that URL.
    const first = { ...createHomeTab("owner"), href: "/home" };
    const second = { ...createHomeTab("owner", undefined, 1), href: "/all?view=x" };
    const { session, transport, navigate, rows } = setup([first, second]);
    await session.initialize("/all?view=x", { id: second.id, href: "/all?view=x" });
    expect(session.getSnapshot().activeId).toBe(second.id);
    expect(transport.patch).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(rows().find((row) => row.id === first.id)?.href).toBe("/home");
    session.dispose();
  });
  it("restores a reload of a page whose selection lives outside the address", async () => {
    // /pull-requests keeps the open PR out of the URL and publishes
    // `/pull-requests?pr=` instead, so a reload lands on the bare path. That
    // load restores the remembered tab — it must not be treated as a deep
    // link that claims the first row and grinds its location under it.
    const admin = { ...createHomeTab("owner"), href: "/admin" };
    const pr = { ...createHomeTab("owner", undefined, 1), href: "/pull-requests?pr=x" };
    const { session, transport, navigate, rows } = setup([admin, pr]);
    await session.initialize("/pull-requests", { id: pr.id, href: "/pull-requests?pr=x" });
    expect(session.getSnapshot().activeId).toBe(pr.id);
    expect(navigate).toHaveBeenCalledWith("/pull-requests?pr=x");
    expect(rows().find((row) => row.id === admin.id)?.href).toBe("/admin");
    expect(transport.patch).not.toHaveBeenCalled();
    session.dispose();
  });
  it("keeps a URL that brings its own selection from being swallowed by restoration", async () => {
    const admin = { ...createHomeTab("owner"), href: "/admin" };
    const pr = { ...createHomeTab("owner", undefined, 1), href: "/pull-requests?pr=x" };
    const { session, rows } = setup([admin, pr]);
    await session.initialize("/pull-requests?pr=y", { id: pr.id, href: "/pull-requests?pr=x" });
    expect(session.getSnapshot().activeId).toBe(admin.id);
    expect(rows().find((row) => row.id === admin.id)?.href).toBe("/pull-requests?pr=y");
    session.dispose();
  });
  it("restores every surface whose selection is kept out of the address", async () => {
    // The same prefix rule must hold wherever a page publishes the href that
    // reconstructs it while cleaning its address: the boards consume ?view=,
    // the objectives page drops ?open=, feedback drops ?post=, wiki pages
    // carry ?entry= and an anchor. (Numo conversations have no URL at all
    // any more — the FAB is not a tab surface.)
    const cases: [address: string, remembered: string][] = [
      ["/all", "/all?view=v1"],
      ["/all", "/all?view=cycle"],
      ["/projects/p1", "/projects/p1?view=v2"],
      ["/projects/p1/objectives", "/projects/p1/objectives?open=o1"],
      ["/projects/p1/feedback", "/projects/p1/feedback?post=p1"],
      ["/projects/p1/pages/pg1", "/projects/p1/pages/pg1?entry=e1#a"],
    ];
    for (const [address, remembered] of cases) {
      const admin = { ...createHomeTab("owner"), href: "/admin" };
      const surface = { ...createHomeTab("owner", undefined, 1), href: remembered };
      const { session, transport, navigate, rows } = setup([admin, surface]);
      await session.initialize(address, { id: surface.id, href: remembered });
      expect(session.getSnapshot().activeId, address).toBe(surface.id);
      expect(navigate, address).toHaveBeenCalledWith(remembered);
      expect(rows().find((row) => row.id === admin.id)?.href, address).toBe("/admin");
      expect(transport.patch, address).not.toHaveBeenCalled();
      session.dispose();
    }
  });
  it("restores local activation without changing a different window", async () => {
    const { session, rows, navigate } = setup();
    await session.initialize("/home", { id: rows()[1].id, href: "/all?view=a" });
    expect(session.getSnapshot().activeId).toBe(rows()[1].id);
    expect(navigate).toHaveBeenCalledWith("/all?view=a"); session.dispose();
  });
  it("saves editors and outgoing location before switching, including pinned tabs", async () => {
    const { session, transport, rows, navigate } = setup();
    await session.initialize("/home");
    const first = session.getSnapshot().activeId!;
    await session.update(first, { pinned: true });
    const save = vi.fn(async () => true); session.registerDeparture(save);
    session.observe("/all?view=a", null);
    const second = rows().find((row) => row.id !== first)!;
    await session.activate(second.id);
    expect(save).toHaveBeenCalled();
    expect(transport.patch).toHaveBeenLastCalledWith(expect.objectContaining({ id: first }), { href: "/all?view=a" });
    expect(navigate).toHaveBeenLastCalledWith(second.href);
    expect(rows().find((row) => row.id === first)?.pinned).toBe(true); session.dispose();
  });
  it("retains the active editor on a failed departure", async () => {
    const { session, rows, navigate } = setup(); await session.initialize("/home");
    const first = session.getSnapshot().activeId;
    session.registerDeparture(async () => false);
    await session.activate(rows().find((row) => row.id !== first)!.id);
    expect(session.getSnapshot().activeId).toBe(first);
    expect(session.getSnapshot().error).toBe("save_failed");
    expect(navigate).not.toHaveBeenCalled(); session.dispose();
  });
  it("does not echo a remote destination change or steal navigation", async () => {
    const { session, rows, transport, navigate, replace } = setup(); await session.initialize("/home");
    replace(rows().map((row) => row.id === session.getSnapshot().activeId ? { ...row, href: "/all", revision: 2 } : row));
    session.observe("/home", null);
    await session.retry();
    expect(transport.patch).not.toHaveBeenCalled(); expect(navigate).not.toHaveBeenCalled(); session.dispose();
  });
  it("keeps remotely closed content recoverable until every editor saves", async () => {
    const { session, rows, replace, navigate, transport } = setup(); await session.initialize("/home");
    const id = session.getSnapshot().activeId; let canSave = false;
    session.registerDeparture(async () => canSave);
    replace(rows().filter((row) => row.id !== id));
    await session.retry();
    expect(session.getSnapshot().recovering).toBe(true); expect(navigate).not.toHaveBeenCalled();
    session.observe("/all", null);
    canSave = true; await session.retry();
    expect(session.getSnapshot().recovering).toBe(false);
    expect(session.getSnapshot().activeId).not.toBe(id);
    expect(transport.patch).not.toHaveBeenCalled(); session.dispose();
  });
  it("ignores the old publication while a same-path selection is being restored", async () => {
    const a = { ...createHomeTab("owner", undefined, 0), href: "/all?view=a" };
    const b = { ...createHomeTab("owner", undefined, 1), href: "/all?view=b" };
    const { session, transport } = setup([a, b]); await session.initialize(a.href);
    await session.activate(b.id);
    session.observe(b.href, a.href);
    await session.retry(); expect(transport.patch).not.toHaveBeenCalled();
    session.observe(b.href, b.href);
    session.observe("/all", "/all?view=c"); await session.retry();
    expect(transport.patch).toHaveBeenLastCalledWith(expect.objectContaining({ id: b.id }), { href: "/all?view=c" }); session.dispose();
  });
  it("serializes name and pin updates using the latest revision", async () => {
    const { session, transport } = setup(); await session.initialize("/home");
    const id = session.getSnapshot().activeId!;
    await Promise.all([session.update(id, { custom_name: "Work" }), session.update(id, { pinned: true })]);
    expect(transport.patch).toHaveBeenNthCalledWith(2, expect.objectContaining({ revision: 2 }), { pinned: true }); session.dispose();
  });
  it("does not create a tab on list/network failure or run queued work after disposal", async () => {
    const { session, transport } = setup(); session.dispose(); await session.create();
    expect(transport.create).not.toHaveBeenCalled();
  });
  it("waits for every mounted editor before an active close", async () => {
    const { session, transport } = setup(); await session.initialize("/home");
    let finish!: (saved: boolean) => void;
    const saved = new Promise<boolean>((resolve) => { finish = resolve; });
    const preview = vi.fn(async () => true);
    session.registerDeparture(() => saved); session.registerDeparture(preview);
    const close = session.close(session.getSnapshot().activeId!);
    await Promise.resolve(); expect(transport.close).not.toHaveBeenCalled();
    finish(true); await close;
    expect(preview).toHaveBeenCalledOnce(); expect(transport.close).toHaveBeenCalledOnce(); session.dispose();
  });
  it("does not resurrect a remotely closed editor after manually leaving recovery", async () => {
    const { session, rows, replace } = setup(); await session.initialize("/home");
    const old = session.getSnapshot().activeId!;
    let saved = false; session.registerDeparture(async () => saved);
    replace(rows().filter((row) => row.id !== old)); await session.retry();
    saved = true; await session.activate(rows()[0].id);
    expect(session.getSnapshot().tabs.some((tab) => tab.id === old)).toBe(false); session.dispose();
  });
  it("keeps browser history navigation in the active tab, even after another tab closes", async () => {
    const { session, rows, transport } = setup(); await session.initialize("/home");
    const first = session.getSnapshot().activeId!;
    session.observe("/all?view=a", "/all?view=a");
    const second = rows().find((tab) => tab.id !== first)!;
    await session.activate(second.id); session.observe("/home", null);
    await session.close(first);
    session.observe("/all?view=a", "/all?view=a"); await session.retry();
    expect(session.getSnapshot().activeId).toBe(second.id);
    expect(transport.patch).toHaveBeenLastCalledWith(expect.objectContaining({ id: second.id }), { href: "/all?view=a" });
    expect(session.getSnapshot().tabs).toHaveLength(1); session.dispose();
  });
  it("keeps a conflicting destination pending until retry uses the canonical revision", async () => {
    const { session, transport, rows } = setup(); await session.initialize("/home");
    const canonical = { ...rows()[0], revision: 2 };
    vi.mocked(transport.patch).mockRejectedValueOnce(new AppTabRequestError("conflict", canonical));
    session.observe("/all", null); await session.retry();
    expect(session.getSnapshot().error).toBe("conflict");
    vi.mocked(transport.patch).mockResolvedValueOnce({ ...canonical, href: "/all", revision: 3 });
    await session.retry();
    expect(transport.patch).toHaveBeenLastCalledWith(expect.objectContaining({ revision: 2 }), { href: "/all" });
    expect(session.getSnapshot().error).toBeNull(); session.dispose();
  });
});
