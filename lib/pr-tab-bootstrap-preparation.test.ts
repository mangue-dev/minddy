import { QueryClient, type FetchQueryOptions } from "@tanstack/react-query";
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
});
