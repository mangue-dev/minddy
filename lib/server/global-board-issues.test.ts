import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "./encryption/store";
import { encodeIssue } from "./issue-store";
import { loadGlobalBoardIssues } from "./global-board-issues";
import { mapIssueRow } from "./issue-mapper";

const state = vi.hoisted(() => ({ store: null as EncryptedStore | null, client: null as SupabaseClient | null }));
vi.mock("./encryption/registry", () => ({ getEncryptedStore: () => state.store }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({}) }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("./project-members", () => ({ buildMembersByProject: async () => ({ members: {} }) }));
vi.mock("./cycles", () => ({ ensureCycles: vi.fn(), toCycleInfo: vi.fn(), todayInTz: vi.fn() }));
vi.mock("@/lib/cycle-prefs", () => ({ resolveCyclePrefs: () => ({ enabled: false }) }));
vi.mock("./api-auth", () => {
  const authed = () => ({ ok: true, user: { id: "actor", user_metadata: {} }, supabase: state.client });
  return {
    getAuthedUser: async () => authed(),
    getAuthedUserWithRlsReads: async (_request: unknown,
      readRls: (verified: ReturnType<typeof authed>) => Promise<unknown> | null) =>
      ({ ...authed(), reads: readRls(authed()) }),
  };
});

type Row = Record<string, unknown> & { id: string };
const id = (index: number) => `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
const issue = (index: number): Row => ({ id: id(index), project_id: "allowed", number: index,
  title: `Issue ${index}`, position: index % 7, deleted_at: null,
  issue_categories: [{ category_id: "category" }] });
const sources = (count: number) => Array.from({ length: count }, (_, index) => issue(index + 1));

const MIDPOINT = "80000000-0000-0000-0000-000000000000";
type Call = { table: string; selection: string; count?: string; orders: string[]; limit?: number;
  after?: string; from?: string; before?: string };

function fixture(rows: Row[], { cap = 1000, counts = true, failAt, failRange, batch, count, hold = false }: {
  cap?: number; counts?: boolean; failAt?: number; failRange?: "lower" | "upper";
  batch?: (rows: Row[], call: number, request: Call) => Row[];
  count?: (remaining: number, call: number, request: Call) => number | null | undefined;
  hold?: boolean;
} = {}) {
  const calls: Call[] = [];
  const held: Array<() => void> = [];
  let issueCalls = 0;
  const rangeOf = (call: Call) => call.before === MIDPOINT ? "lower" : call.from === MIDPOINT ? "upper" : undefined;
  const client = { from(table: string) {
    const call: Call = { table, selection: "", orders: [] };
    const query = {
      select(selection: string, options?: { count?: string }) { call.selection = selection; call.count = options?.count; return query; },
      order(column: string) { call.orders.push(column); return query; },
      limit(value: number) { call.limit = value; return query; },
      gt(column: string, value: string) { expect(column).toBe("id"); call.after = value; return query; },
      gte(column: string, value: string) { expect(column).toBe("id"); call.from = value; return query; },
      lt(column: string, value: string) { expect(column).toBe("id"); call.before = value; return query; },
      is() { return query; },
      then(resolve: (result: unknown) => unknown, reject?: (error: unknown) => unknown) {
        calls.push(call);
        if (table !== "issues") return Promise.resolve({ data: [], error: null }).then(resolve, reject);
        const number = ++issueCalls;
        // The authenticated client's RLS excludes deleted and foreign rows before
        // projection/decryption; pagination must keep using this same client.
        const visible = rows.filter((row) => row.project_id === "allowed" && row.deleted_at === null &&
          (!call.after || row.id > call.after) && (!call.from || row.id >= call.from) &&
          (!call.before || row.id < call.before)).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
        const selected = visible.slice(0, Math.min(cap, call.limit ?? Infinity));
        const result = failAt === number || failRange !== undefined && failRange === rangeOf(call)
          ? { data: null, error: { code: "57014", message: "Private SQL" }, status: 500 } : {
            data: batch ? batch(selected, number, call) : selected,
            error: null, count: count ? count(visible.length, number, call) : counts ? visible.length : null,
          };
        if (!hold) return Promise.resolve(result).then(resolve, reject);
        return new Promise((release) => held.push(() => release(result))).then(resolve, reject);
      },
    };
    return query;
  } } as unknown as SupabaseClient;
  return {
    client, calls,
    issueCalls: (range?: "lower" | "upper") => calls.filter((call) => call.table === "issues" &&
      (range === undefined || rangeOf(call) === range)),
    release: () => { for (const answer of held.splice(0)) answer(); },
  };
}

// Monotonic in `index` and spread across both halves of the UUID keyspace.
const spreadId = (index: number) =>
  `${(index * 0x200000).toString(16).padStart(8, "0")}-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
const spreadSources = (count: number) => sources(count).map((row, index) => ({ ...row, id: spreadId(index + 1) }));

async function settle() {
  for (let turn = 0; turn < 10; turn++) await new Promise((done) => setImmediate(done));
}

beforeEach(() => {
  vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "true");
  vi.stubEnv("MINDDY_ISSUE_SOURCE_ENCRYPTION_ENABLED", "true");
  vi.stubEnv("MINDDY_DATA_ROOT_KEY", "1".repeat(64));
  const key = randomBytes(32);
  state.store = new EncryptedStore({ current: async () => ({ version: 1, bytes: Buffer.from(key) }),
    byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(key) }) });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("complete authenticated global board issues", () => {
  it.each([1000, 250])("loads all 1206 rows under a server cap of %i with ordinary projections", async (cap) => {
    const source = sources(1206).reverse();
    const f = fixture(source, { cap });
    const result = await loadGlobalBoardIssues(f.client, "actor");
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1206);
    expect(new Set(result.data!.map((row) => row.id))).toEqual(new Set(source.map((row) => row.id)));
    expect(result.data!.map(mapIssueRow).every((row) => row.category_ids[0] === "category")).toBe(true);
    // Every fixture ID is in the lower half; the upper half answers one empty page.
    expect(f.issueCalls("lower")).toHaveLength(Math.ceil(1206 / cap));
    expect(f.issueCalls("upper")).toHaveLength(1);
    expect(f.issueCalls().every((call) => call.selection === "*,issue_categories(category_id)" &&
      call.count === "exact" && call.limit === 1000 && call.orders.join() === "id")).toBe(true);
    expect(f.issueCalls("lower").map((call) => call.after)).toEqual(Array.from({ length: Math.ceil(1206 / cap) },
      (_, index) => index ? id(index * cap) : undefined));
  });

  it.each([0, 500, 1000, 2000])("finishes an exact-count collection of %i rows without an extra empty request", async (size) => {
    const f = fixture(sources(size));
    const result = await loadGlobalBoardIssues(f.client, "actor");
    expect(result.error).toBeNull(); expect(result.data).toHaveLength(size);
    expect(f.issueCalls("lower")).toHaveLength(Math.max(1, Math.ceil(size / 1000)));
    expect(f.issueCalls("upper")).toHaveLength(1);
  });

  it.each([1, 250, 1000])("does not confuse a short cap of %i with completion when counts are missing", async (cap) => {
    const f = fixture(sources(1206), { cap, counts: false });
    const result = await loadGlobalBoardIssues(f.client, "actor");
    expect(result.error).toBeNull(); expect(result.data).toHaveLength(1206);
    expect(f.issueCalls("lower")).toHaveLength(Math.ceil(1206 / cap) + 1);
  });

  it("restores position and number order with nulls last and deterministic UUID ties", async () => {
    const source = sources(6).map((row, index) => ({ ...row,
      position: [2, 1, 1, null, 1, 1][index], number: [1, 3, 2, 1, 2, null][index] }));
    const result = await loadGlobalBoardIssues(fixture(source.reverse(), { cap: 2 }).client, "actor");
    expect(result.data?.map((row) => row.id)).toEqual([id(3), id(5), id(2), id(6), id(1), id(4)]);
  });

  it("keeps RLS filtering and decodes protected source fields on every batch", async () => {
    const first = await encodeIssue({ ...issue(1), title: "Accepted private title", plan: "Accepted private plan" });
    const second = await encodeIssue({ ...issue(2), title: "Second private title" });
    const foreign = { ...await encodeIssue({ ...issue(3), project_id: "foreign", title: "Forbidden title" }), id: id(3), encrypted_content: "must never decode" };
    const deleted = { ...await encodeIssue({ ...issue(4), title: "Deleted title" }), id: id(4), deleted_at: "2026-10-01", encrypted_content: "must never decode" };
    const f = fixture([foreign, second as Row, deleted, first as Row], { cap: 1 });
    const result = await loadGlobalBoardIssues(f.client, "actor");
    expect(result.error).toBeNull();
    expect(result.data).toEqual([expect.objectContaining({ id: id(1), title: "Accepted private title", plan: "Accepted private plan" }),
      expect.objectContaining({ id: id(2), title: "Second private title" })]);
    expect(JSON.stringify(result.data)).not.toMatch(/encrypted_content|encryption_version|Forbidden title|Deleted title/);
    expect(f.calls.every((call) => call.table === "issues")).toBe(true);
  });

  it("returns no earlier rows when a later database page fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    // Calls 1 and 2 open the lower and upper ranges; call 3 is the lower range's second page.
    const result = await loadGlobalBoardIssues(fixture(sources(1206), { failAt: 3 }).client, "actor");
    expect(result).toEqual({ data: null, error: { message: "Unable to load global board issues" } });
    expect(JSON.stringify(log.mock.calls)).not.toContain("Private SQL");
  });

  it("returns no earlier rows when a later protected body cannot be decoded", async () => {
    const encrypted = await encodeIssue(issue(2));
    const result = await loadGlobalBoardIssues(fixture([issue(1), { ...encrypted, id: id(2), encrypted_content: "Broken protected content" }], { cap: 1 }).client, "actor");
    expect(result.data).toBeNull(); expect(result.error).toEqual({ message: "Unable to load global board issues" });
  });

  it.each([
    { label: "duplicate IDs", batch: (rows: Row[]) => [rows[0], rows[0]] },
    { label: "decreasing IDs", batch: (rows: Row[]) => [...rows].reverse() },
    { label: "invalid UUID", batch: (rows: Row[]) => [{ ...rows[0], id: "invalid" }] },
    { label: "missing order value", batch: (rows: Row[]) => [{ ...rows[0], position: undefined }] },
    { label: "invalid order value", batch: (rows: Row[]) => [{ ...rows[0], number: NaN }] },
  ])("rejects $label without publishing partial rows", async ({ batch }) => {
    const result = await loadGlobalBoardIssues(fixture(sources(2), { batch }).client, "actor");
    expect(result.data).toBeNull(); expect(result.error).not.toBeNull();
  });

  it("rejects an older page repeated after the cursor without looping", async () => {
    const f = fixture(sources(3), { cap: 1, batch: (rows, _call, request) => request.after === id(1) ? [issue(1)] : rows });
    const result = await loadGlobalBoardIssues(f.client, "actor");
    expect(result.data).toBeNull(); expect(f.issueCalls("lower")).toHaveLength(2);
  });

  it.each([-1, 0, 1.5, Infinity])("rejects an inconsistent remaining count %s", async (count) => {
    const result = await loadGlobalBoardIssues(fixture(sources(2), { count: () => count }).client, "actor");
    expect(result.data).toBeNull(); expect(result.error).not.toBeNull();
  });

  it("rejects an empty batch with a positive remaining count", async () => {
    const f = fixture(sources(2), { batch: () => [], count: () => 2 });
    const result = await loadGlobalBoardIssues(f.client, "actor");
    expect(result.data).toBeNull(); expect(f.issueCalls("lower")).toHaveLength(1);
  });

  it("supports an omitted count using the same empty-batch fallback", async () => {
    const f = fixture(sources(2), { cap: 1, count: () => undefined });
    expect((await loadGlobalBoardIssues(f.client, "actor")).data).toHaveLength(2);
    expect(f.issueCalls("lower")).toHaveLength(3);
  });

  it("requests both key ranges before either responds", async () => {
    const source = spreadSources(1206);
    const f = fixture(source, { hold: true });
    let done = false;
    const pending = loadGlobalBoardIssues(f.client, "actor").finally(() => { done = true; });
    await settle();
    expect(f.issueCalls("lower")).toHaveLength(1);
    expect(f.issueCalls("upper")).toHaveLength(1);

    while (!done) { f.release(); await settle(); }
    const result = await pending;
    expect(result.data?.map((row) => row.id)).toHaveLength(1206);
    expect(new Set(result.data!.map((row) => row.id))).toEqual(new Set(source.map((row) => row.id)));
  });

  it.each([1000, 250])("exhausts each key range under a server cap of %i", async (cap) => {
    const source = spreadSources(1206);
    const f = fixture([...source].reverse(), { cap });
    const result = await loadGlobalBoardIssues(f.client, "actor");
    expect(result.error).toBeNull();
    expect(new Set(result.data!.map((row) => row.id))).toEqual(new Set(source.map((row) => row.id)));
    // spreadId(1023) is the last ID below the midpoint.
    expect(f.issueCalls("lower")).toHaveLength(Math.ceil(1023 / cap));
    expect(f.issueCalls("upper")).toHaveLength(Math.ceil(183 / cap));
  });

  it("returns every row at the range boundary exactly once in board order", async () => {
    const rows = [
      { id: "ffffffff-ffff-4fff-bfff-ffffffffffff", position: 0, number: 5 },
      { id: "80000000-0000-4000-8000-000000000001", position: 1, number: 1 },
      { id: MIDPOINT, position: 1, number: 2 },
      { id: "7fffffff-ffff-4fff-bfff-ffffffffffff", position: 1, number: 2 },
      { id: "00000000-0000-0000-0000-000000000000", position: null, number: 3 },
    ].map((row) => ({ ...issue(1), ...row }));
    const result = await loadGlobalBoardIssues(fixture(rows, { cap: 1 }).client, "actor");
    expect(result.data?.map((row) => row.id)).toEqual([
      "ffffffff-ffff-4fff-bfff-ffffffffffff",
      "80000000-0000-4000-8000-000000000001",
      "7fffffff-ffff-4fff-bfff-ffffffffffff",
      MIDPOINT,
      "00000000-0000-0000-0000-000000000000",
    ]);
  });

  it.each([
    { label: "a database failure", options: { failRange: "upper" as const } },
    { label: "a short remaining count", options: { count: (remaining: number, _call: number, request: Call) =>
      request.from === MIDPOINT ? 0 : remaining } },
    { label: "a row outside its range", options: { batch: (rows: Row[], _call: number, request: Call) =>
      request.from === MIDPOINT ? [{ ...rows[0], id: spreadId(1) }] : rows } },
  ])("publishes no rows when one key range reports $label", async ({ options }) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await loadGlobalBoardIssues(fixture(spreadSources(1206), options).client, "actor");
    expect(result).toEqual({ data: null, error: { message: "Unable to load global board issues" } });
  });

  it("returns the complete canonical issue shape from the global route", async () => {
    const f = fixture(sources(1206), { cap: 250 }); state.client = f.client;
    const { GET } = await import("@/app/api/me/board/route");
    const response = await GET(new Request("https://example.test/api/me/board") as never);
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.issues).toHaveLength(1206);
    expect(result.issues[0]).toMatchObject({ category_ids: ["category"] });
    expect(result.issues[0]).not.toHaveProperty("issue_categories");
    expect(f.issueCalls("lower")).toHaveLength(5);
  });

  it("keeps the existing localized route failure instead of a successful partial board", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    state.client = fixture(sources(1206), { failAt: 2 }).client;
    const { GET } = await import("@/app/api/me/board/route");
    const response = await GET(new Request("https://example.test/api/me/board") as never);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "databaseError" });
  });

  it.each([1000, 250])("returns all 1206 canonical issue rows from the resume route under cap %i", async (cap) => {
    const f = fixture(sources(1206), { cap }); state.client = f.client;
    const { GET } = await import("@/app/api/me/issues/route");
    const response = await GET(new Request("https://example.test/api/me/issues") as never);
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toHaveLength(1206);
    expect(new Set(result.map((row: Row) => row.id))).toEqual(new Set(sources(1206).map((row) => row.id)));
    expect(result[0]).toMatchObject({ category_ids: ["category"] });
    expect(result[0]).not.toHaveProperty("issue_categories");
    expect(f.issueCalls("lower")).toHaveLength(Math.ceil(1206 / cap));
  });

  it("returns a localized failure from the resume route when a later batch fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    state.client = fixture(sources(1206), { failAt: 2 }).client;
    const { GET } = await import("@/app/api/me/issues/route");
    const response = await GET(new Request("https://example.test/api/me/issues") as never);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "databaseError" });
  });

  it("does not return earlier resume rows when a later protected issue is corrupt", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const encrypted = await encodeIssue(issue(2));
    state.client = fixture([issue(1), { ...encrypted, id: id(2), encrypted_content: "Broken protected content" }], { cap: 1 }).client;
    const { GET } = await import("@/app/api/me/issues/route");
    const response = await GET(new Request("https://example.test/api/me/issues") as never);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "databaseError" });
  });
});
