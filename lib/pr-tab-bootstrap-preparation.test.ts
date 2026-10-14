import { QueryClient, QueryObserver, type FetchQueryOptions } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPrTabPreparation } from "./pr-tab-preparation";
import { createProjectBootstrapPair } from "./project-bootstrap-api";

const source = vi.hoisted(() => ({ queries: [] as FetchQueryOptions<unknown>[] }));
vi.mock("./prefetch-tab-destination", () => ({
  appTabPreparationQueries: (_client: unknown, href: string) => href.startsWith("/projects/") ? source.queries : [],
  appTabSelectionSource: () => null,
  appTabPendingIssueSelection: () => null,
  prefetchPullRequestDetail: vi.fn(),
}));
vi.mock("./project-bootstrap-api", () => ({ createProjectBootstrapPair: vi.fn() }));
vi.mock("./app-tab-surfaces", () => ({ prepareAppTabSurface: vi.fn() }));
vi.mock("./page-navigation-preparation", () => ({ createPageNavigationPreparation: () => ({ prioritize: vi.fn(), visit: vi.fn(), dispose: vi.fn() }) }));
vi.mock("./use-pages-query", () => ({ preparePageNavigation: vi.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const tasks = new Set<() => void>();
  const preparation = createPrTabPreparation(client, (task) => {
    tasks.add(task); return () => { tasks.delete(task); };
  });
  const members = deferred<{ members: [] }>();
  const objectives = deferred<[]>();
  const transport = { members: vi.fn(() => members.promise), objectives: vi.fn(() => objectives.promise), dispose: vi.fn() };
  vi.mocked(createProjectBootstrapPair).mockReturnValue(transport as unknown as ReturnType<typeof createProjectBootstrapPair>);
  const ordinaryMembers = vi.fn(async () => ({ members: [] }));
  const ordinaryObjectives = vi.fn(async () => []);
  source.queries = [
    { queryKey: ["members", "project"], queryFn: ordinaryMembers },
    { queryKey: ["objectives", "project"], queryFn: ordinaryObjectives },
  ];
  const flush = () => { for (const task of Array.from(tasks)) { tasks.delete(task); task(); } };
  preparation.visit("/home", ["/home", "/projects/project"]);
  return { client, preparation, transport, members, objectives, ordinaryMembers, ordinaryObjectives, flush };
}

afterEach(() => { vi.clearAllMocks(); source.queries = []; });

describe("admitted project bootstrap preparation", () => {
  it("retains both ordinary query owners and lets the smaller frame settle independently", async () => {
    const prepared = setup();
    try {
      prepared.flush();
      expect(createProjectBootstrapPair).toHaveBeenCalledWith(prepared.client, "project");
      expect(prepared.client.isFetching()).toBe(2);
      expect(prepared.transport.members).toHaveBeenCalledWith({ signal: expect.any(AbortSignal) });
      expect(prepared.transport.objectives).toHaveBeenCalledWith({ signal: expect.any(AbortSignal) });
      expect(prepared.ordinaryMembers).not.toHaveBeenCalled();
      expect(prepared.ordinaryObjectives).not.toHaveBeenCalled();
      prepared.objectives.resolve([]);
      await vi.waitFor(() => expect(prepared.client.getQueryData(["objectives", "project"])).toEqual([]));
      expect(prepared.client.getQueryData(["members", "project"])).toBeUndefined();
      expect(prepared.transport.dispose).not.toHaveBeenCalled();
      prepared.members.resolve({ members: [] });
      await vi.waitFor(() => expect(prepared.transport.dispose).toHaveBeenCalledOnce());
      expect(prepared.client.isFetching()).toBe(0);
    } finally { prepared.preparation.dispose(); prepared.client.clear(); }
  });

  it("does not postpone ordinary reads to wait for an occupied slot", async () => {
    const prepared = setup();
    const issues = deferred<[]>();
    source.queries.unshift({ queryKey: ["issues", "project"], queryFn: () => issues.promise });
    prepared.preparation.visit("/home", ["/home", "/projects/project"]);
    try {
      prepared.flush();
      expect(prepared.client.isFetching()).toBe(2);
      expect(prepared.ordinaryMembers).toHaveBeenCalledOnce();
      expect(createProjectBootstrapPair).not.toHaveBeenCalled();
      await vi.waitFor(() => expect(prepared.client.getQueryData(["members", "project"])).toEqual({ members: [] }));
      prepared.flush();
      await vi.waitFor(() => expect(prepared.ordinaryObjectives).toHaveBeenCalledOnce());
      expect(createProjectBootstrapPair).not.toHaveBeenCalled();
      issues.resolve([]);
      await vi.waitFor(() => expect(prepared.client.isFetching()).toBe(0));
    } finally { prepared.preparation.dispose(); prepared.client.clear(); }
  });

  it("keeps an intervening eligible read in its original admission order", async () => {
    const prepared = setup();
    const categories = deferred<[]>();
    const ordinaryCategories = vi.fn(() => categories.promise);
    source.queries.splice(1, 0, { queryKey: ["categories", "project"], queryFn: ordinaryCategories });
    prepared.preparation.visit("/home", ["/home", "/projects/project"]);
    try {
      prepared.flush();
      expect(prepared.ordinaryMembers).toHaveBeenCalledOnce();
      expect(ordinaryCategories).toHaveBeenCalledOnce();
      expect(createProjectBootstrapPair).not.toHaveBeenCalled();
      categories.resolve([]);
      await vi.waitFor(() => expect(prepared.client.isFetching()).toBe(0));
      prepared.flush();
      await vi.waitFor(() => expect(prepared.ordinaryObjectives).toHaveBeenCalledOnce());
    } finally { prepared.preparation.dispose(); prepared.client.clear(); }
  });

  it("does not share readers from different project scopes", async () => {
    const prepared = setup();
    source.queries[1] = { queryKey: ["objectives", "other"], queryFn: prepared.ordinaryObjectives };
    prepared.preparation.visit("/home", ["/home", "/projects/project"]);
    try {
      prepared.flush();
      await vi.waitFor(() => expect(prepared.client.isFetching()).toBe(0));
      expect(createProjectBootstrapPair).not.toHaveBeenCalled();
      expect(prepared.ordinaryMembers).toHaveBeenCalledOnce();
      expect(prepared.ordinaryObjectives).toHaveBeenCalledOnce();
    } finally { prepared.preparation.dispose(); prepared.client.clear(); }
  });

  it("retires an active shared transport when the preparation lifetime ends", async () => {
    const prepared = setup();
    prepared.flush();
    prepared.preparation.dispose();
    expect(prepared.transport.dispose).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(prepared.client.isFetching()).toBe(0));
    prepared.client.clear();
  });

  it("restores ordinary inactive refetch readers after a completed one-shot pair", async () => {
    const prepared = setup();
    try {
      prepared.flush();
      prepared.members.resolve({ members: [] }); prepared.objectives.resolve([]);
      await vi.waitFor(() => expect(prepared.transport.dispose).toHaveBeenCalledOnce());
      await prepared.client.refetchQueries({ queryKey: ["members", "project"], exact: true });
      await prepared.client.refetchQueries({ queryKey: ["objectives", "project"], exact: true });
      expect(prepared.ordinaryMembers).toHaveBeenCalledOnce();
      expect(prepared.ordinaryObjectives).toHaveBeenCalledOnce();
      expect(prepared.transport.members).toHaveBeenCalledOnce();
      expect(prepared.transport.objectives).toHaveBeenCalledOnce();
    } finally { prepared.preparation.dispose(); prepared.client.clear(); }
  });

  it("restores an old client's ordinary readers when its preparation owner retires", async () => {
    const prepared = setup();
    // Inactive refetch intentionally skips canceled initial reads that have
    // never settled. Use real invalidated cache entries eligible for refetch.
    prepared.client.setQueryData(["members", "project"], { members: [] });
    prepared.client.setQueryData(["objectives", "project"], []);
    await prepared.client.invalidateQueries({ queryKey: ["members", "project"], exact: true, refetchType: "none" });
    await prepared.client.invalidateQueries({ queryKey: ["objectives", "project"], exact: true, refetchType: "none" });
    prepared.flush();
    expect(prepared.transport.members).toHaveBeenCalledOnce();
    expect(prepared.transport.objectives).toHaveBeenCalledOnce();
    prepared.preparation.dispose();
    await vi.waitFor(() => expect(prepared.client.isFetching()).toBe(0));
    try {
      await prepared.client.refetchQueries({ queryKey: ["members", "project"], exact: true });
      await prepared.client.refetchQueries({ queryKey: ["objectives", "project"], exact: true });
      expect(prepared.ordinaryMembers).toHaveBeenCalledOnce();
      expect(prepared.ordinaryObjectives).toHaveBeenCalledOnce();
      expect(prepared.transport.members).toHaveBeenCalledOnce();
      expect(prepared.transport.objectives).toHaveBeenCalledOnce();
    } finally { prepared.client.clear(); }
  });

  it("preserves a foreground observer's newer reader when the pair settles", async () => {
    const prepared = setup();
    const foreground = vi.fn(async () => ({ members: [], source: "foreground" }));
    try {
      prepared.flush();
      const observer = new QueryObserver(prepared.client, { queryKey: ["members", "project"], queryFn: foreground });
      prepared.members.resolve({ members: [] }); prepared.objectives.resolve([]);
      await vi.waitFor(() => expect(prepared.transport.dispose).toHaveBeenCalledOnce());
      expect(prepared.client.getQueryCache().find({ queryKey: ["members", "project"], exact: true })?.options.queryFn).toBe(foreground);
      await prepared.client.refetchQueries({ queryKey: ["members", "project"], exact: true });
      expect(foreground).toHaveBeenCalledOnce();
      expect(prepared.ordinaryMembers).not.toHaveBeenCalled();
      observer.destroy();
    } finally { prepared.preparation.dispose(); prepared.client.clear(); }
  });

  it("restores the ordinary reader before a synchronous success listener refetches it", async () => {
    const prepared = setup();
    let refetch: Promise<void> | undefined;
    const stop = prepared.client.getQueryCache().subscribe((event) => {
      if (event.type !== "updated" || event.action.type !== "success" || event.action.manual ||
          event.query.queryKey[0] !== "objectives" || refetch) return;
      // Mark reentry before Query.fetch can notify its own cache listeners.
      refetch = Promise.resolve();
      refetch = prepared.client.refetchQueries({ queryKey: ["objectives", "project"], exact: true });
    });
    try {
      prepared.flush();
      prepared.objectives.resolve([]);
      await vi.waitFor(() => expect(prepared.ordinaryObjectives).toHaveBeenCalledOnce());
      await refetch;
      expect(prepared.transport.objectives).toHaveBeenCalledOnce();
      expect(prepared.transport.dispose).not.toHaveBeenCalled();
      prepared.members.resolve({ members: [] });
      await vi.waitFor(() => expect(prepared.transport.dispose).toHaveBeenCalledOnce());
    } finally { stop(); prepared.preparation.dispose(); prepared.client.clear(); }
  });
});
