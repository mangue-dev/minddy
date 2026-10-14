import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { GET } from "@/app/api/me/board/route";

type Result = { data: unknown[] | null; error: { message: string } | null };
const mocks = vi.hoisted(() => ({ auth: vi.fn(), issues: vi.fn(), members: vi.fn(), cycles: vi.fn(),
  projects: vi.fn(), integrations: vi.fn(), integrationScope: vi.fn(), integrationTables: vi.fn(), categories: vi.fn(), objectives: vi.fn(), relations: vi.fn(), cyclesEnabled: false }));
vi.mock("@/lib/server/api-auth", () => ({ getAuthedUser: mocks.auth }));
vi.mock("@/lib/server/global-board-issues", () => ({ loadGlobalBoardIssues: mocks.issues }));
vi.mock("@/lib/server/project-members", () => ({ buildMembersByProject: mocks.members }));
vi.mock("@/lib/server/category-store", () => ({ categoryStore: () => ({ select: mocks.categories }) }));
vi.mock("@/lib/server/objective-store", () => ({ objectiveStore: () => ({ select: mocks.objectives }) }));
vi.mock("@/lib/server/integration-content", () => ({ decodeIntegrationField: async (_row: unknown, _field: string, value: unknown) => value }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/lib/cycle-prefs", () => ({ resolveCyclePrefs: () => ({ enabled: mocks.cyclesEnabled }) }));
vi.mock("@/lib/server/cycles", () => ({ ensureCycles: mocks.cycles, toCycleInfo: (value: unknown) => value, todayInTz: () => "2026-10-14" }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({ from: (table: string) => {
  mocks.integrationTables(table);
  return query(mocks.integrations, mocks.integrationScope);
} }) }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function query(read: () => unknown, scope?: (column: string, ids: string[]) => void) {
  const value = { select: () => value, is: () => value,
    in: (column: string, ids: string[]) => { scope?.(column, ids); return value; }, order: () => value,
    then: (resolve: (data: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(read()).then(resolve, reject) };
  return value;
}
const empty = (): Result => ({ data: [], error: null });
const project = { id: "authorized-project", owner_id: "owner" };
const request = () => ({ headers: new Headers(), nextUrl: new URL("http://localhost/api/me/board?tz=UTC") }) as NextRequest;
async function settle() { for (let index = 0; index < 12; index++) await Promise.resolve(); }

beforeEach(() => {
  vi.resetAllMocks(); mocks.cyclesEnabled = false;
  mocks.projects.mockResolvedValue({ data: [project], error: null });
  mocks.issues.mockResolvedValue(empty()); mocks.categories.mockResolvedValue(empty());
  mocks.objectives.mockResolvedValue(empty()); mocks.relations.mockResolvedValue(empty());
  mocks.integrations.mockResolvedValue(empty()); mocks.members.mockResolvedValue({ members: {}, projectIds: [project.id] });
  mocks.cycles.mockResolvedValue({ current: null, upcoming: [], past: [] });
  mocks.auth.mockResolvedValue({ ok: true, user: { id: "owner", user_metadata: {} }, supabase: {
    from: (table: string) => query(table === "projects" ? mocks.projects : mocks.relations),
  } });
});

describe("global board authorized dependency overlap", () => {
  it("starts enrichment from authorized projects while the complete issue read is still pending", async () => {
    const projects = deferred<Result>(), issues = deferred<Result>();
    mocks.projects.mockReturnValue(projects.promise); mocks.issues.mockReturnValue(issues.promise);
    let finished = false;
    const response = GET(request()).then((value) => { finished = true; return value; });
    await settle();
    expect(mocks.members).not.toHaveBeenCalled(); expect(mocks.integrations).not.toHaveBeenCalled();
    projects.resolve({ data: [project], error: null }); await settle();
    expect(mocks.members).toHaveBeenCalledTimes(1);
    expect(mocks.members.mock.calls[0][1]).toEqual([project]);
    expect(mocks.integrations).toHaveBeenCalledTimes(1);
    expect(mocks.projects).toHaveBeenCalledTimes(1);
    expect(mocks.integrationTables).toHaveBeenCalledExactlyOnceWith("integrations");
    expect(mocks.integrationScope).toHaveBeenCalledExactlyOnceWith("project_id", [project.id]);
    expect(finished).toBe(false);
    issues.resolve(empty());
    expect((await response).status).toBe(200);
  });

  it("returns the original unauthorized result without starting any resource read", async () => {
    const denied = new Response("Unauthorized", { status: 401 });
    mocks.auth.mockResolvedValue({ ok: false, response: denied });
    expect(await GET(request())).toBe(denied);
    for (const read of [mocks.issues, mocks.projects, mocks.categories, mocks.objectives, mocks.members, mocks.integrations]) expect(read).not.toHaveBeenCalled();
  });

  it("does not start service enrichment from a failed authorized project scope", async () => {
    mocks.projects.mockResolvedValue({ data: [project], error: { message: "Scope unavailable" } });
    const response = await GET(request());
    expect(response.status).toBe(500); expect(await response.json()).toEqual({ error: "databaseError" });
    expect(mocks.members).not.toHaveBeenCalled(); expect(mocks.integrations).not.toHaveBeenCalled();
  });

  it("drains already-started enrichment and never publishes partial success when issues fail", async () => {
    const issues = deferred<Result>(), members = deferred<{ members: object }>();
    mocks.issues.mockReturnValue(issues.promise); mocks.members.mockReturnValue(members.promise);
    let finished = false;
    const response = GET(request()).then((value) => { finished = true; return value; });
    await settle(); expect(mocks.members).toHaveBeenCalledTimes(1);
    issues.resolve({ data: null, error: { message: "Issue page unavailable" } }); await settle();
    expect(finished).toBe(false);
    members.resolve({ members: {} });
    const result = await response;
    expect(result.status).toBe(500); expect(await result.json()).toEqual({ error: "databaseError" });
  });

  it.each([false, true])("drains enrichment after a thrown category decode failure and preserves that exact error (enrichment fails: %s)", async (enrichmentFails) => {
    const categories = deferred<Result>(), members = deferred<{ members: object }>();
    const failure = new Error("Category decode unavailable");
    mocks.categories.mockReturnValue(categories.promise); mocks.members.mockReturnValue(members.promise);
    let finished = false;
    const response = GET(request()).then(
      (value) => { finished = true; return { response: value }; },
      (error: unknown) => { finished = true; return { error }; },
    );
    await settle(); expect(mocks.members).toHaveBeenCalledTimes(1);
    categories.reject(failure); await settle();
    expect(finished).toBe(false);
    if (enrichmentFails) members.reject(new Error("Separate member lookup failure"));
    else members.resolve({ members: {} });
    const result = await response;
    expect(result).toEqual({ error: failure });
    expect("error" in result && result.error).toBe(failure);
  });

  it("catches synchronous reader construction before Promise.all exists and drains the exact enrichment", async () => {
    const projects = deferred<Result>(), members = deferred<{ members: object }>();
    const failure = new Error("Category adapter construction failed");
    mocks.projects.mockReturnValue(projects.promise); mocks.members.mockReturnValue(members.promise);
    mocks.categories.mockImplementation(() => { throw failure; });
    let finished = false;
    const response = GET(request()).then(
      (value) => { finished = true; return { response: value }; },
      (error: unknown) => { finished = true; return { error }; },
    );
    await settle();
    expect(mocks.projects).toHaveBeenCalledTimes(1);
    expect(mocks.members).not.toHaveBeenCalled();
    expect(finished).toBe(false);
    projects.resolve({ data: [project], error: null }); await settle();
    expect(mocks.projects).toHaveBeenCalledTimes(1);
    expect(mocks.members).toHaveBeenCalledTimes(1);
    expect(mocks.integrationScope).toHaveBeenCalledExactlyOnceWith("project_id", [project.id]);
    expect(finished).toBe(false);
    members.resolve({ members: {} });
    const result = await response;
    expect("error" in result && result.error).toBe(failure);
  });

  it("preserves an enrichment-only rejection after successful first-stage reads", async () => {
    const failure = new Error("Member resolution unavailable");
    mocks.members.mockRejectedValue(failure);
    await expect(GET(request())).rejects.toBe(failure);
    expect(mocks.projects).toHaveBeenCalledTimes(1);
    expect(mocks.members).toHaveBeenCalledTimes(1);
    expect(mocks.integrations).toHaveBeenCalledTimes(1);
    expect(mocks.integrationScope).toHaveBeenCalledExactlyOnceWith("project_id", [project.id]);
  });

  it("keeps cycle reconciliation before every board resource read", async () => {
    mocks.cyclesEnabled = true;
    const cycles = deferred<{ current: null; upcoming: never[]; past: never[] }>();
    mocks.cycles.mockReturnValue(cycles.promise);
    const response = GET(request()); await settle();
    expect(mocks.cycles).toHaveBeenCalledTimes(1);
    for (const read of [mocks.projects, mocks.issues, mocks.categories, mocks.objectives, mocks.relations, mocks.members, mocks.integrations]) expect(read).not.toHaveBeenCalled();
    cycles.resolve({ current: null, upcoming: [], past: [] });
    expect((await response).status).toBe(200);
  });
});
