import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

const h = vi.hoisted(() => ({ protected: false, rows: [] as Record<string, unknown>[],
  root: "", rpcCalls: [] as string[], generation: 0,
  consistent: true, documents: vi.fn(),
  decode: vi.fn(async (row: Record<string, unknown>) => row),
  project: vi.fn(async (value: unknown) => String(value ?? "")) }));
vi.mock("@/lib/server/page-content", () => ({
  shouldProtectPages: async () => h.protected,
  decodePageProjection: h.decode,
}));
vi.mock("@/lib/server/pages-projection", () => ({
  pageBodyToMarkdownServer: h.project,
}));
const { runPageSearch, parsePageSearchQuery } = await import("./pages-search");

function client(allowed: Set<string>) {
  const from = (_table: string) => {
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    let start = 0;
    let end = 1000;
    const request = {
      select: () => request,
      gt: (key: string, value: number) => { filters.push((r) => Number(r[key]) > value); return request; },
      is: (key: string, value: null) => { filters.push((r) => r[key] === value); return request; },
      eq: (key: string, value: string) => { filters.push((r) => r[key] === value); return request; },
      in: (key: string, values: string[]) => { h.documents(values);
        filters.push(r => values.includes(String(r[key]))); return request; },
      order: () => request,
      limit: (value: number) => { end = value; return request; },
      range: (from: number, to: number) => { start = from; end = to + 1; return request; },
      then: (resolve: (result: unknown) => void) => resolve({ data: h.rows.filter((r) =>
        allowed.has(String(r.project_id)) && filters.every((filter) => filter(r)))
        .slice(start, end), error: null }),
    };
    return request;
  };
  return { from, rpc: async (name: string, input: { p_project_id?: string | null;
    p_offset?: number; p_limit?: number }) => {
    h.rpcCalls.push(name);
    return { data: name === "page_search_cipher_fingerprints" ? h.rows.filter(row =>
      allowed.has(String(row.project_id)) && row.deleted_at === null &&
      (!input.p_project_id || row.project_id === input.p_project_id))
      .slice(input.p_offset ?? 0, (input.p_offset ?? 0) + (input.p_limit ?? 200))
      .map(row => ({ id: row.id, project_id: row.project_id, parent_id: row.parent_id,
        updated_at: row.updated_at, encryption_version: row.encryption_version,
        protected_fields_clear: h.consistent,
        cipher_digest: typeof row.encrypted_content === "string"
          ? createHash("sha256").update(row.encrypted_content).digest("hex") : null })) : [], error: null };
  } };
}

beforeEach(() => {
  h.protected = false;
  h.root = process.env.MINDDY_DATA_ROOT_KEY ?? "";
  process.env.MINDDY_DATA_ROOT_KEY = "test-root";
  h.rpcCalls = [];
  h.consistent = true;
  h.documents.mockClear();
  h.generation++;
  h.decode.mockReset();
  h.decode.mockImplementation(async row => ({ ...h.rows.find(value => value.id === row.id), ...row }));
  h.project.mockClear();
  h.rows = [
    { id: "a", project_id: "allowed", parent_id: null, title: "alpha",
      content: "first phrase here", icon: null, encrypted_content: "sealed",
      encryption_version: 1, deleted_at: null, updated_at: "2026-01-03T00:00:00Z" },
    { id: "b", project_id: "allowed", parent_id: null, title: "beta",
      content: "second phrase here", icon: null, encrypted_content: null,
      encryption_version: 0, deleted_at: null, updated_at: "2026-01-02T00:00:00Z" },
    { id: "c", project_id: "hidden", parent_id: null, title: "alpha",
      content: "first phrase here", icon: null, encrypted_content: "sealed",
      encryption_version: 1, deleted_at: null, updated_at: "2026-01-04T00:00:00Z" },
  ];
  for (const row of h.rows) {
    if (row.encrypted_content) row.encrypted_content = `sealed-${h.generation}`;
  }
});
afterEach(() => { if (h.root) process.env.MINDDY_DATA_ROOT_KEY = h.root;
  else delete process.env.MINDDY_DATA_ROOT_KEY; });

describe("mixed encrypted page search", () => {
  it("rechecks access and decryption when Markdown is cached and invalidates edited ciphertext", async () => {
    h.protected = true;
    h.rows = [h.rows[0]];
    const allowed = new Set(["allowed"]);
    const source = client(allowed);
    const query = () => runPageSearch(source as never, { query: "alpha OR edited" });
    await query();
    await query();
    expect(h.decode).toHaveBeenCalledTimes(2);
    expect(h.project).toHaveBeenCalledTimes(1);
    expect(h.documents).toHaveBeenCalledTimes(1);
    allowed.clear();
    expect(await query()).toEqual({ ok: true, hits: [] });
    expect(h.decode).toHaveBeenCalledTimes(2);
    allowed.add("allowed");
    h.rows[0] = { ...h.rows[0], content: "edited body", encrypted_content: "edited-cipher" };
    expect(await query()).toMatchObject({ ok: true, hits: [{ excerpt: "edited body" }] });
    expect(h.project).toHaveBeenCalledTimes(2);
  });

  it("rechecks plaintext consistency and authenticated decryption after ciphertext cache hits", async () => {
    h.protected = true;
    h.rows = [h.rows[0]];
    const source = client(new Set(["allowed"]));
    const query = () => runPageSearch(source as never, { query: "alpha" });
    await query();
    h.consistent = false;
    expect(await query()).toEqual({ ok: false });
    h.consistent = true;
    h.decode.mockRejectedValueOnce(new Error("Cipher authentication failed"));
    await expect(query()).rejects.toThrow("Cipher authentication failed");
    expect(h.documents).toHaveBeenCalledTimes(1);
  });

  it("refreshes parent and edit metadata without refetching unchanged ciphertext", async () => {
    h.protected = true;
    h.rows = [h.rows[0]];
    const source = client(new Set(["allowed"]));
    await runPageSearch(source as never, { query: "alpha" });
    h.rows[0].parent_id = "new-parent";
    h.rows[0].updated_at = "2026-02-01T00:00:00Z";
    expect(await runPageSearch(source as never, { query: "alpha" })).toMatchObject({
      ok: true, hits: [{ parent_id: "new-parent", updated_at: "2026-02-01T00:00:00Z" }],
    });
    expect(h.documents).toHaveBeenCalledTimes(1);
  });

  it("uses the authorized application reader while writers are paused", async () => {
    const result = await runPageSearch(client(new Set(["allowed"])) as never,
      { query: "alpha OR beta", limit: 1 });
    expect(result).toMatchObject({ ok: true, hits: [{ id: "a" }] });
    expect(h.rpcCalls).toEqual(["page_search_cipher_fingerprints"]);
  });

  it("preserves OR, exclusions, phrases, limits and project permissions", async () => {
    const source = client(new Set(["allowed"]));
    const query = async (text: string) => {
      const result = await runPageSearch(source as never,
        { query: text, projectId: "allowed", limit: 50 });
      if (!result.ok) throw new Error("Page search failed");
      return result.hits.map((hit) => hit.id);
    };
    expect(await query("alpha OR beta")).toEqual(["a", "b"]);
    expect(await query("alpha or beta")).toEqual(["a", "b"]);
    expect(await query("alpha -first")).toEqual([]);
    expect(await query("alpha - first")).toEqual([]);
    expect(await query('"first phrase"')).toEqual(["a"]);
    expect(await query('"phrase first"')).toEqual([]);
    expect(parsePageSearchQuery("alpha OR beta")).toHaveLength(2);
  });

  it("ranks, clamps limits, and preserves RLS across paused and resumed writers", async () => {
    for (let index = 0; index < 55; index++) {
      h.rows.push({ id: `row-${index}`, project_id: "allowed", parent_id: null,
        title: "alpha", content: "ordinary body", icon: null,
        encrypted_content: null, encryption_version: 0, deleted_at: null,
        updated_at: "2025-01-01T00:00:00Z" });
    }
    const source = client(new Set(["allowed"]));
    for (const active of [false, true]) {
      h.protected = active;
      const first = await runPageSearch(source as never, { query: "alpha", limit: 20 });
      const maximum = await runPageSearch(source as never, { query: "alpha", limit: 100 });
      if (!first.ok || !maximum.ok) throw new Error("Page search failed");
      expect(first.hits).toHaveLength(20);
      expect(first.hits[0].id).toBe("a");
      expect(maximum.hits).toHaveLength(50);
      expect(maximum.hits.every((hit) => hit.project_id === "allowed")).toBe(true);
    }
  });

  it("ranks exact title lexemes ahead of body matches and ignores substrings", async () => {
    h.rows = [
      { ...h.rows[0], id: "body", title: "alphabet", content: "alpha",
        updated_at: "2026-01-04T00:00:00Z" },
      { ...h.rows[1], id: "title", title: "alpha", content: "ordinary text",
        updated_at: "2026-01-02T00:00:00Z" },
    ];
    const result = await runPageSearch(client(new Set(["allowed"])) as never,
      { query: "alpha", limit: 20 });
    if (!result.ok) throw new Error("Page search failed");
    expect(result.hits.map((hit) => hit.id)).toEqual(["title", "body"]);
    expect(result.hits[0].rank).toBeGreaterThan(result.hits[1].rank);
  });

  it("keeps repeated old body hits ahead of one newer hit at limit one", async () => {
    h.rows = [
      { ...h.rows[0], id: "old-many", title: "", content: "alpha alpha alpha",
        updated_at: "2025-01-01T00:00:00Z" },
      { ...h.rows[1], id: "new-one", title: "", content: "alpha",
        updated_at: "2026-01-01T00:00:00Z" },
      { ...h.rows[2], id: "hidden", title: "", content: "alpha alpha alpha alpha",
        updated_at: "2027-01-01T00:00:00Z" },
    ];
    const result = await runPageSearch(client(new Set(["allowed"])) as never,
      { query: "alpha", limit: 1 });
    if (!result.ok) throw new Error("Page search failed");
    expect(result.hits.map((hit) => hit.id)).toEqual(["old-many"]);
    expect(result.hits[0].rank).toBeCloseTo(1.2);
  });

  it("selects the SQL-compatible later excerpt for a dense AND passage", async () => {
    h.rows = [{ ...h.rows[0], title: "", content: ["alpha",
      ...Array.from({ length: 27 }, (_, index) => `early${index + 1}`),
      "alpha", "beta", ...Array.from({ length: 12 }, (_, index) =>
        `late${index + 1}`)].join(" ") }];
    const result = await runPageSearch(client(new Set(["allowed"])) as never,
      { query: "alpha beta", limit: 1 });
    if (!result.ok) throw new Error("Page search failed");
    expect(result.hits[0].excerpt).toBe([
      ...Array.from({ length: 10 }, (_, index) => `early${index + 18}`),
      "alpha", "beta", ...Array.from({ length: 10 }, (_, index) =>
        `late${index + 1}`)].join(" "));
  });

  it("fails closed when a visible protected row has no root key", async () => {
    delete process.env.MINDDY_DATA_ROOT_KEY;
    const result = await runPageSearch(client(new Set(["allowed"])) as never,
      { query: "alpha" });
    expect(result).toEqual({ ok: false });
    expect(h.rpcCalls).toEqual([]);
  });
});
