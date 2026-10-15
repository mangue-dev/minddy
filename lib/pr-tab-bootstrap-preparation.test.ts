import { QueryClient, QueryObserver, type FetchQueryOptions } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPrTabPreparation } from "./pr-tab-preparation";
import { createProjectBootstrapPair, ProjectBootstrapLimitError } from "./project-bootstrap-api";
import { navigationPreparationHasRead, subscribeNavigationPreparation } from "./navigation-preparation-priority";

const source = vi.hoisted(() => ({ queries: [] as FetchQueryOptions<unknown>[], routes: new Map<string, FetchQueryOptions<unknown>[]>() }));
vi.mock("./prefetch-tab-destination", () => ({
  appTabPreparationQueries: (_client: unknown, href: string) => source.routes.get(href) ?? (href.startsWith("/projects/") ? source.queries : []),
  appTabSelectionSources: () => [],
  appTabPendingIssueSelection: () => null,
  prefetchPullRequestDetail: vi.fn(),
}));
vi.mock("./project-bootstrap-api", () => ({ createProjectBootstrapPair: vi.fn(), ProjectBootstrapLimitError: class extends Error {} }));
vi.mock("./app-tab-surfaces", () => ({ prepareAppTabSurface: vi.fn() }));
vi.mock("./page-navigation-preparation", () => ({ createPageNavigationPreparation: () => ({ prioritize: vi.fn(), visit: vi.fn(), dispose: vi.fn() }) }));
vi.mock("./use-pages-query", () => ({ preparePageNavigation: vi.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  void promise.catch(() => {});
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
  const join = <T,>(operation: ReturnType<typeof deferred<T>>, signal?: AbortSignal) => {
    if (signal?.aborted) operation.reject(signal.reason);
    else signal?.addEventListener("abort", () => operation.reject(signal.reason), { once: true });
    return operation.promise;
  };
  const transport = {
    members: vi.fn(({ signal }: { signal?: AbortSignal }) => join(members, signal)),
    objectives: vi.fn(({ signal }: { signal?: AbortSignal }) => join(objectives, signal)),
    finishAdmission: vi.fn((): boolean => transport.members.mock.calls.length === 1 && transport.objectives.mock.calls.length === 1),
    dispose: vi.fn(() => { const error = new DOMException("Disposed", "AbortError"); members.reject(error); objectives.reject(error); }),
  };
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

afterEach(() => { vi.clearAllMocks(); source.queries = []; source.routes.clear(); });

describe("admitted project bootstrap preparation", () => {
  it("retains both ordinary query owners and lets the smaller frame settle independently", async () => {
    const prepared = setup();
    try {
      prepared.flush();
      expect(createProjectBootstrapPair).toHaveBeenCalledWith(prepared.client, "project");
      expect(prepared.client.isFetching()).toBe(2);
      expect(prepared.transport.members).toHaveBeenCalledWith({ signal: expect.any(AbortSignal) });
      expect(prepared.transport.objectives).toHaveBeenCalledWith({ signal: expect.any(AbortSignal) });
      expect(prepared.client.getQueryCache().find({ queryKey: ["members", "project"], exact: true })?.options.queryFn).toBe(prepared.ordinaryMembers);
      expect(prepared.client.getQueryCache().find({ queryKey: ["objectives", "project"], exact: true })?.options.queryFn).toBe(prepared.ordinaryObjectives);
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

  it("admits three query owners on two transports and holds the shared slot until both frames settle", async () => {
    const prepared = setup();
    const issues = deferred<[]>();
    source.queries.unshift({ queryKey: ["issues", "project"], queryFn: () => issues.promise });
    const relations = vi.fn(async () => []);
    source.queries.push({ queryKey: ["issue-relations", "project"], queryFn: relations });
    prepared.preparation.visit("/home", ["/home", "/projects/project"]);
    try {
      prepared.flush();
      expect(prepared.client.isFetching()).toBe(3);
      expect(createProjectBootstrapPair).toHaveBeenCalledOnce();
      expect(prepared.transport.members).toHaveBeenCalledOnce();
      expect(prepared.transport.objectives).toHaveBeenCalledOnce();
      expect(relations).not.toHaveBeenCalled();
      prepared.objectives.resolve([]);
      await vi.waitFor(() => expect(prepared.client.getQueryData(["objectives", "project"])).toEqual([]));
      prepared.flush();
      expect(relations).not.toHaveBeenCalled();
      expect(prepared.client.isFetching()).toBe(2);
      expect(prepared.transport.dispose).not.toHaveBeenCalled();
      prepared.members.resolve({ members: [] });
      await vi.waitFor(() => expect(prepared.transport.dispose).toHaveBeenCalledOnce());
      prepared.flush();
      await vi.waitFor(() => expect(relations).toHaveBeenCalledOnce());
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

  it("does not create a second pair while a shared transport still owns its slot", async () => {
    const prepared = setup();
    const otherMembers = deferred<{ members: [] }>();
    const otherObjectives = vi.fn(async () => []);
    source.queries.push({ queryKey: ["members", "other"], queryFn: () => otherMembers.promise },
      { queryKey: ["objectives", "other"], queryFn: otherObjectives });
    prepared.preparation.visit("/home", ["/home", "/projects/project"]);
    try {
      prepared.flush();
      expect(prepared.client.isFetching()).toBe(3);
      expect(createProjectBootstrapPair).toHaveBeenCalledOnce();
      expect(otherObjectives).not.toHaveBeenCalled();
      otherMembers.resolve({ members: [] });
      await vi.waitFor(() => expect(prepared.client.getQueryData(["members", "other"])).toEqual({ members: [] }));
      prepared.flush();
      await vi.waitFor(() => expect(otherObjectives).toHaveBeenCalledOnce());
      expect(createProjectBootstrapPair).toHaveBeenCalledOnce();
      prepared.members.resolve({ members: [] }); prepared.objectives.resolve([]);
      await vi.waitFor(() => expect(prepared.client.isFetching()).toBe(0));
    } finally { prepared.preparation.dispose(); prepared.client.clear(); }
  });

  it("protects the exact selected owner while foreground navigation cancels its sibling", async () => {
    const prepared = setup();
    try {
      prepared.flush();
      const memberSignal = prepared.transport.members.mock.calls[0][0].signal;
      const objectiveSignal = prepared.transport.objectives.mock.calls[0][0].signal;
      source.routes.set("/projects/selected", [source.queries[0]]);
      prepared.preparation.visit("/projects/selected", ["/projects/selected", "/projects/project"]);
      expect(memberSignal?.aborted).toBe(false);
      expect(objectiveSignal?.aborted).toBe(true);
      prepared.members.resolve({ members: [] });
      await vi.waitFor(() => expect(prepared.client.isFetching()).toBe(0));
      expect(prepared.client.getQueryData(["members", "project"])).toEqual({ members: [] });
      expect(prepared.client.getQueryData(["objectives", "project"])).toBeUndefined();
    } finally { prepared.preparation.dispose(); prepared.client.clear(); }
  });

  it("retires an atomic pair interrupted by a first-fetch listener before its sibling joins", async () => {
    const prepared = setup();
    let interrupted = false;
    const stop = prepared.client.getQueryCache().subscribe((event) => {
      if (interrupted || event.type !== "updated" || event.action.type !== "fetch" || event.query.queryKey[0] !== "members") return;
      interrupted = true;
      prepared.preparation.visit("/away", ["/away"]);
    });
    try {
      prepared.flush();
      await vi.waitFor(() => expect(prepared.client.isFetching()).toBe(0));
      expect(prepared.transport.objectives).not.toHaveBeenCalled();
      expect(prepared.transport.dispose).toHaveBeenCalledOnce();
      expect(prepared.client.getQueryData(["members", "project"])).toBeUndefined();
      expect(prepared.client.getQueryCache().find({ queryKey: ["members", "project"], exact: true })?.options.queryFn).toBe(prepared.ordinaryMembers);
      expect(prepared.ordinaryMembers).toHaveBeenCalledOnce();
      // A later ordinary epoch cannot inherit an orphan pair or disposed fn.
      await prepared.client.fetchQuery({ queryKey: ["members", "project"], queryFn: prepared.ordinaryMembers });
      expect(prepared.ordinaryMembers).toHaveBeenCalledTimes(2);
      expect(prepared.client.getQueryData(["members", "project"])).toEqual({ members: [] });
    } finally { stop(); prepared.preparation.dispose(); prepared.client.clear(); }
  });

  it("abandons the unjoined cohort when a synchronous listener warms the sibling", async () => {
    const prepared = setup();
    let warmed = false;
    const stop = prepared.client.getQueryCache().subscribe((event) => {
      if (warmed || event.type !== "updated" || event.action.type !== "fetch" || event.query.queryKey[0] !== "members") return;
      warmed = true;
      prepared.client.setQueryData(["objectives", "project"], ["newer-cached-objective"]);
    });
    // Cached warm data must actually skip the second query function.
    prepared.client.setDefaultOptions({ queries: { retry: false, gcTime: Infinity, staleTime: 300_000 } });
    try {
      prepared.flush();
      await vi.waitFor(() => expect(prepared.client.isFetching()).toBe(0));
      expect(prepared.transport.members).toHaveBeenCalledOnce();
      expect(prepared.transport.objectives).not.toHaveBeenCalled();
      expect(prepared.transport.finishAdmission).toHaveReturnedWith(false);
      expect(prepared.transport.dispose).toHaveBeenCalledOnce();
      expect(prepared.client.getQueryData(["objectives", "project"])).toEqual(["newer-cached-objective"]);
      expect(prepared.client.getQueryData(["members", "project"])).toBeUndefined();
    } finally { stop(); prepared.preparation.dispose(); prepared.client.clear(); }
  });

  it("releases an atomic cohort interrupted by priority notification before any query dispatch", async () => {
    const prepared = setup();
    let interrupted = false;
    const stop = subscribeNavigationPreparation(prepared.client, () => {
      if (interrupted || !vi.mocked(createProjectBootstrapPair).mock.calls.length) return;
      interrupted = true;
      prepared.preparation.visit("/away", ["/away"]);
    });
    try {
      prepared.flush();
      expect(prepared.transport.members).not.toHaveBeenCalled();
      expect(prepared.transport.objectives).not.toHaveBeenCalled();
      expect(prepared.transport.dispose).toHaveBeenCalledOnce();
      expect(prepared.client.isFetching()).toBe(0);
      expect(navigationPreparationHasRead(prepared.client)).toBe(false);
      source.queries = [source.queries[0]];
      prepared.preparation.visit("/home", ["/home", "/projects/project"]);
      prepared.flush();
      await vi.waitFor(() => expect(prepared.client.getQueryData(["members", "project"])).toEqual({ members: [] }));
      expect(prepared.ordinaryMembers).toHaveBeenCalledOnce();
    } finally { stop(); prepared.preparation.dispose(); prepared.client.clear(); }
  });

  it("restores the ordinary canceled reader for an invalidation epoch while the other frame remains owned", async () => {
    const prepared = setup();
    try {
      prepared.flush();
      await prepared.client.invalidateQueries({ queryKey: ["objectives", "project"], exact: true, refetchType: "none" });
      await prepared.client.cancelQueries({ queryKey: ["objectives", "project"], exact: true });
      await vi.waitFor(() => expect(prepared.client.getQueryCache().find({ queryKey: ["objectives", "project"], exact: true })?.options.queryFn).toBe(prepared.ordinaryObjectives));
      prepared.flush();
      await vi.waitFor(() => expect(prepared.ordinaryObjectives).toHaveBeenCalledOnce());
      expect(prepared.transport.objectives).toHaveBeenCalledOnce();
      expect(prepared.transport.dispose).not.toHaveBeenCalled();
      prepared.members.resolve({ members: [] });
      await vi.waitFor(() => expect(prepared.transport.dispose).toHaveBeenCalledOnce());
      expect(prepared.client.getQueryData(["objectives", "project"])).toEqual([]);
    } finally { prepared.preparation.dispose(); prepared.client.clear(); }
  });

  it("serializes complete ordinary readers after a parser size limit within the shared physical slot", async () => {
    const prepared = setup();
    const issues = deferred<[]>(), completeMembers = deferred<{ members: [] }>();
    prepared.ordinaryMembers.mockImplementation(() => completeMembers.promise);
    source.queries.unshift({ queryKey: ["issues", "project"], queryFn: () => issues.promise });
    prepared.preparation.visit("/home", ["/home", "/projects/project"]);
    try {
      prepared.flush();
      expect(prepared.client.isFetching()).toBe(3);
      const error = new ProjectBootstrapLimitError("Frame exceeds bounded transport size");
      prepared.members.reject(error); prepared.objectives.reject(error);
      await vi.waitFor(() => expect(prepared.ordinaryMembers).toHaveBeenCalledOnce());
      expect(prepared.ordinaryObjectives).not.toHaveBeenCalled();
      expect(prepared.client.getQueryCache().find({ queryKey: ["members", "project"], exact: true })?.options.queryFn).toBe(prepared.ordinaryMembers);
      completeMembers.resolve({ members: [] });
      await vi.waitFor(() => expect(prepared.ordinaryObjectives).toHaveBeenCalledOnce());
      issues.resolve([]);
      await vi.waitFor(() => expect(prepared.client.isFetching()).toBe(0));
      expect(prepared.client.getQueryData(["members", "project"])).toEqual({ members: [] });
      expect(prepared.client.getQueryData(["objectives", "project"])).toEqual([]);
    } finally { prepared.preparation.dispose(); prepared.client.clear(); }
  });

  it("rejects a late size fallback across inactive invalidation without canceling the healthy sibling", async () => {
    const prepared = setup();
    const completeMembers = deferred<{ members: [] }>();
    prepared.ordinaryMembers.mockImplementation(() => completeMembers.promise);
    try {
      prepared.flush();
      const healthySignal = prepared.transport.objectives.mock.calls[0][0].signal;
      prepared.objectives.resolve([]);
      await vi.waitFor(() => expect(prepared.client.getQueryData(["objectives", "project"])).toEqual([]));
      prepared.members.reject(new ProjectBootstrapLimitError("Frame exceeds bounded transport size"));
      await vi.waitFor(() => expect(prepared.ordinaryMembers).toHaveBeenCalledOnce());
      await prepared.client.invalidateQueries({ queryKey: ["members", "project"], exact: true, refetchType: "none" });
      completeMembers.resolve({ members: [] });
      await vi.waitFor(() => expect(prepared.client.isFetching()).toBe(0));
      expect(prepared.client.getQueryData(["members", "project"])).toBeUndefined();
      expect(prepared.client.getQueryState(["members", "project"])?.isInvalidated).toBe(true);
      expect(prepared.client.getQueryState(["members", "project"])?.error).toMatchObject({ name: "AbortError" });
      expect(prepared.client.getQueryState(["objectives", "project"])?.status).toBe("success");
      expect(prepared.client.getQueryData(["objectives", "project"])).toEqual([]);
      expect(healthySignal?.aborted).toBe(false);
    } finally { prepared.preparation.dispose(); prepared.client.clear(); }
  });

  it("restores the ordinary inactive cached reader synchronously before invalidate-all refetch", async () => {
    const prepared = setup();
    let observer: QueryObserver | undefined, stopObserver: (() => void) | undefined;
    try {
      prepared.flush();
      expect(prepared.transport.objectives).toHaveBeenCalledOnce();
      expect(prepared.client.getQueryCache().find({ queryKey: ["objectives", "project"], exact: true })?.options.queryFn).toBe(prepared.ordinaryObjectives);
      // A cache update while the cold stream is pending makes the inactive
      // query eligible for refetch cancellation without reusing its one-shot fn.
      prepared.client.setQueryData(["objectives", "project"], ["newly-cached-objective"]);
      const healthySignal = prepared.transport.members.mock.calls[0][0].signal;
      observer = new QueryObserver<unknown>(prepared.client, { queryKey: ["members", "project"], queryFn: prepared.ordinaryMembers, enabled: false });
      stopObserver = observer.subscribe(() => {});
      await prepared.client.invalidateQueries({ queryKey: ["objectives", "project"], exact: true, refetchType: "all" });
      expect(prepared.ordinaryObjectives).toHaveBeenCalledOnce();
      expect(prepared.transport.objectives).toHaveBeenCalledOnce();
      expect(prepared.client.getQueryData(["objectives", "project"])).toEqual([]);
      expect(healthySignal?.aborted).toBe(false);
      expect(prepared.transport.dispose).not.toHaveBeenCalled();
      expect(prepared.client.getQueryState(["members", "project"])?.fetchStatus).toBe("fetching");
      prepared.members.resolve({ members: [] });
      await vi.waitFor(() => expect(prepared.client.isFetching()).toBe(0));
    } finally { stopObserver?.(); observer?.destroy(); prepared.preparation.dispose(); prepared.client.clear(); }
  });

  it("rechecks admission after a first-fetch listener retains an observed read and starts foreground work", async () => {
    const prepared = setup();
    const issues = deferred<[]>(), foreground = deferred<Record<string, never>>();
    const issueReader = () => issues.promise;
    source.queries.unshift({ queryKey: ["issues", "project"], queryFn: issueReader });
    prepared.client.setQueryData(["issues", "project"], []);
    await prepared.client.invalidateQueries({ queryKey: ["issues", "project"], exact: true, refetchType: "none" });
    prepared.preparation.visit("/home", ["/home", "/projects/project"]);
    let observer: QueryObserver | undefined, stopObserver: (() => void) | undefined, foregroundRead: Promise<unknown> | undefined;
    let entered = false;
    const stop = prepared.client.getQueryCache().subscribe((event) => {
      if (entered || event.type !== "updated" || event.action.type !== "fetch" || event.query.queryKey[0] !== "issues") return;
      entered = true;
      observer = new QueryObserver<unknown>(prepared.client, { queryKey: ["issues", "project"], queryFn: issueReader, refetchOnMount: false });
      stopObserver = observer.subscribe(() => {});
      foregroundRead = prepared.client.fetchQuery({ queryKey: ["foreground"], queryFn: () => foreground.promise });
    });
    try {
      prepared.flush();
      expect(entered).toBe(true);
      expect(prepared.client.isFetching()).toBe(2);
      expect(createProjectBootstrapPair).not.toHaveBeenCalled();
      expect(prepared.transport.members).not.toHaveBeenCalled();
      expect(prepared.transport.objectives).not.toHaveBeenCalled();
      expect(prepared.ordinaryMembers).not.toHaveBeenCalled();
      expect(prepared.client.getQueryState(["issues", "project"])?.fetchStatus).toBe("fetching");
      issues.resolve([]); foreground.resolve({});
      await foregroundRead;
      await vi.waitFor(() => expect(prepared.client.isFetching()).toBe(0));
    } finally {
      stop(); stopObserver?.(); observer?.destroy();
      issues.resolve([]); foreground.resolve({}); await foregroundRead?.catch(() => {});
      prepared.preparation.dispose(); prepared.client.clear();
    }
  });

  it("keeps denial and malformed-stream errors explicit without ordinary fallback", async () => {
    const prepared = setup();
    try {
      prepared.flush();
      const denied = new Error("Forbidden"), malformed = new Error("Invalid project bootstrap frame");
      prepared.members.reject(denied); prepared.objectives.reject(malformed);
      await vi.waitFor(() => expect(prepared.client.isFetching()).toBe(0));
      expect(prepared.client.getQueryState(["members", "project"])?.error).toBe(denied);
      expect(prepared.client.getQueryState(["objectives", "project"])?.error).toBe(malformed);
      expect(prepared.ordinaryMembers).not.toHaveBeenCalled();
      expect(prepared.ordinaryObjectives).not.toHaveBeenCalled();
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

  it("keeps preinvalidated cached keys on ordinary readers through retirement and refetch", async () => {
    const prepared = setup();
    // Query.invalidate emits no new event while isInvalidated remains true.
    // These existing generations deliberately do not enter a shared cohort.
    prepared.client.setQueryData(["members", "project"], { members: [] });
    prepared.client.setQueryData(["objectives", "project"], []);
    await prepared.client.invalidateQueries({ queryKey: ["members", "project"], exact: true, refetchType: "none" });
    await prepared.client.invalidateQueries({ queryKey: ["objectives", "project"], exact: true, refetchType: "none" });
    prepared.flush();
    await vi.waitFor(() => expect(prepared.client.isFetching()).toBe(0));
    expect(createProjectBootstrapPair).not.toHaveBeenCalled();
    expect(prepared.ordinaryMembers).toHaveBeenCalledOnce();
    expect(prepared.ordinaryObjectives).toHaveBeenCalledOnce();
    prepared.preparation.dispose();
    try {
      await prepared.client.refetchQueries({ queryKey: ["members", "project"], exact: true });
      await prepared.client.refetchQueries({ queryKey: ["objectives", "project"], exact: true });
      expect(prepared.ordinaryMembers).toHaveBeenCalledTimes(2);
      expect(prepared.ordinaryObjectives).toHaveBeenCalledTimes(2);
      expect(prepared.transport.members).not.toHaveBeenCalled();
      expect(prepared.transport.objectives).not.toHaveBeenCalled();
    } finally { prepared.client.clear(); }
  });

  it("keeps an invalidated empty key on the ordinary reader rather than sharing an unseen generation", async () => {
    const prepared = setup();
    prepared.client.getQueryCache().build(prepared.client, { queryKey: ["members", "project"], queryFn: prepared.ordinaryMembers });
    await prepared.client.invalidateQueries({ queryKey: ["members", "project"], exact: true, refetchType: "none" });
    try {
      prepared.flush();
      await vi.waitFor(() => expect(prepared.client.isFetching()).toBe(0));
      expect(createProjectBootstrapPair).not.toHaveBeenCalled();
      expect(prepared.ordinaryMembers).toHaveBeenCalledOnce();
      expect(prepared.ordinaryObjectives).toHaveBeenCalledOnce();
      expect(prepared.client.getQueryState(["members", "project"])?.isInvalidated).toBe(false);
    } finally { prepared.preparation.dispose(); prepared.client.clear(); }
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
