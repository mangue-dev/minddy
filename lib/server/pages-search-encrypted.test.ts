import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ protected: false, rows: [] as Record<string, unknown>[],
  root: "", rpcCalls: [] as string[] }));
vi.mock("@/lib/server/page-content", () => ({
  shouldProtectPages: async () => h.protected,
  decodePageProjection: async (row: Record<string, unknown>) => row,
}));
vi.mock("@/lib/server/pages-projection", () => ({
  pageBodyToMarkdownServer: async (value: unknown) => String(value ?? ""),
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
      order: () => request,
      limit: (value: number) => { end = value; return request; },
      range: (from: number, to: number) => { start = from; end = to + 1; return request; },
      then: (resolve: (result: unknown) => void) => resolve({ data: h.rows.filter((r) =>
        allowed.has(String(r.project_id)) && filters.every((filter) => filter(r)))
        .slice(start, end), error: null }),
    };
    return request;
  };
  return { from, rpc: async (name: string) => { h.rpcCalls.push(name);
    return { data: [], error: null }; } };
}

beforeEach(() => {
  h.protected = false;
  h.root = process.env.MINDDY_DATA_ROOT_KEY ?? "";
  process.env.MINDDY_DATA_ROOT_KEY = "test-root";
  h.rpcCalls = [];
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
});
afterEach(() => { if (h.root) process.env.MINDDY_DATA_ROOT_KEY = h.root;
  else delete process.env.MINDDY_DATA_ROOT_KEY; });

describe("mixed encrypted page search", () => {
  it("uses the authorized application reader while writers are paused", async () => {
    const result = await runPageSearch(client(new Set(["allowed"])) as never,
      { query: "alpha OR beta", limit: 1 });
    expect(result).toMatchObject({ ok: true, hits: [{ id: "a" }] });
    expect(h.rpcCalls).toEqual([]);
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

  it("fails closed when a visible protected row has no root key", async () => {
    delete process.env.MINDDY_DATA_ROOT_KEY;
    const result = await runPageSearch(client(new Set(["allowed"])) as never,
      { query: "alpha" });
    expect(result).toEqual({ ok: false });
    expect(h.rpcCalls).toEqual([]);
  });
});
