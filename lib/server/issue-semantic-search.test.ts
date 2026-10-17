import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Semantic issue search (MIN-718) against mocked boundaries: what reaches the
 * embedding provider, which index version is read, and what comes back.
 */

const h = vi.hoisted(() => ({
  meta: {} as Record<string, unknown>,
  flag: null as string | null,
  budget: true,
  runtime: { provider: "openrouter", model: "openai/text-embedding-3-small" } as { provider: string; model: string } | null,
  vectors: [] as { issue_id: string; project_id: string; index_version: string; embedding: number[] }[],
  deleted: new Set<string>(),
  requestEmbeddings: vi.fn(),
  listProjectEmbeddings: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/app-config", () => ({
  getAppConfigValues: async () => (h.flag ? { smart_fill_relations_enabled: h.flag } : {}),
}));
vi.mock("@/lib/server/usage", () => ({ hasUsageBudget: async () => h.budget }));
vi.mock("@/lib/server/ai-runtime", () => ({ resolveAiRuntime: async () => h.runtime }));
vi.mock("@/lib/server/embeddings", () => ({
  cosineSimilarity: (a: number[], b: number[]) => {
    if (a.length !== b.length) return null;
    let dot = 0, aa = 0, bb = 0;
    for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; aa += a[i] ** 2; bb += b[i] ** 2; }
    return aa && bb ? dot / Math.sqrt(aa * bb) : null;
  },
  requestEmbeddings: h.requestEmbeddings,
}));
vi.mock("@/lib/server/issue-embedding-store", () => ({ listProjectEmbeddings: h.listProjectEmbeddings }));
vi.mock("@/lib/server/issue-store", () => ({
  issueStore: () => {
    let ids: string[] = [];
    const q = {
      select: () => q,
      in(column: string, values: string[]) { if (column === "id") ids = values; return q; },
      is: () => q,
      then(resolve: (value: unknown) => unknown) {
        return Promise.resolve({ data: ids.filter((id) => !h.deleted.has(id)).map((id) => ({ id })), error: null })
          .then(resolve);
      },
    };
    return q;
  },
}));
vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({
    auth: { admin: { getUserById: async () => ({ data: { user: { user_metadata: h.meta } }, error: null }) } },
  }),
}));

import { clearSemanticQueryCache, searchIssuesSemantically } from "./issue-semantic-search";

const VERSION = "openrouter:openai/text-embedding-3-small:3";
const search = (query = "single sign-on for enterprise customers", projectIds = ["p1"]) =>
  searchIssuesSemantically({ userId: "u1", query, projectIds });

beforeEach(() => {
  clearSemanticQueryCache();
  h.meta = {};
  h.flag = null;
  h.budget = true;
  h.runtime = { provider: "openrouter", model: "openai/text-embedding-3-small" };
  h.deleted = new Set();
  h.vectors = [
    { issue_id: "sso", project_id: "p1", index_version: VERSION, embedding: [1, 0, 0] },
    { issue_id: "billing", project_id: "p1", index_version: VERSION, embedding: [0, 1, 0] },
    { issue_id: "old-space", project_id: "p1", index_version: "openai:text-embedding-3-large:3", embedding: [1, 0, 0] },
  ];
  h.requestEmbeddings.mockReset().mockImplementation(async () => ({
    vectors: [[0.9, 0.1, 0]], provider: h.runtime!.provider, model: h.runtime!.model, keyMode: "platform",
  }));
  h.listProjectEmbeddings.mockReset().mockImplementation(async (_s: unknown, projectId: string, version: string) =>
    h.vectors.filter((row) => row.project_id === projectId && row.index_version === version));
});

describe("searchIssuesSemantically", () => {
  it("ranks issues of the query's own index version only, and bills the searching user", async () => {
    const result = await search();
    expect(result).toEqual({ status: "ok", hits: [{ id: "sso", project_id: "p1", score: expect.any(Number) }] });
    expect(h.listProjectEmbeddings).toHaveBeenCalledWith(expect.anything(), "p1", VERSION, expect.any(Number));
    expect(h.requestEmbeddings.mock.calls[0][1]).toMatchObject({
      modelKey: "issue_embedding_model", feature: "issue_search", billedUserId: "u1",
      record: { billTo: { userId: "u1" } },
    });
  });

  it("never sends identifiers or short lookups to the provider", async () => {
    for (const query of ["MIN-42", "42", "sso"]) {
      expect(await search(query)).toEqual({ status: "skipped_query", hits: [] });
    }
    expect(h.requestEmbeddings).not.toHaveBeenCalled();
  });

  it("reuses a cached query vector, and embeds again after a model change", async () => {
    await search();
    await search("  Single sign-on   for ENTERPRISE customers ");
    expect(h.requestEmbeddings).toHaveBeenCalledTimes(1);
    h.runtime = { provider: "openrouter", model: "google/gemini-embedding-001" };
    const after = await search();
    expect(h.requestEmbeddings).toHaveBeenCalledTimes(2);
    // The new space has no vectors yet: nothing is compared across versions.
    expect(after.hits).toEqual([]);
  });

  it("keeps the cache per user", async () => {
    await search();
    await searchIssuesSemantically({ userId: "u2", query: "single sign-on for enterprise customers", projectIds: ["p1"] });
    expect(h.requestEmbeddings).toHaveBeenCalledTimes(2);
  });

  it("drops trashed issues", async () => {
    h.deleted.add("sso");
    expect((await search()).hits).toEqual([]);
  });

  it.each([
    ["disabled", () => { h.flag = "false"; }],
    ["opted_out", () => { h.meta = { issue_indexing: false }; }],
    ["budget_exhausted", () => { h.budget = false; }],
    ["unavailable", () => { h.runtime = null; }],
  ] as const)("answers %s without hits and without a query embedding", async (status, setup) => {
    setup();
    expect(await search()).toEqual({ status, hits: [] });
    expect(h.requestEmbeddings).not.toHaveBeenCalled();
  });

  it("stops at its deadline", async () => {
    h.requestEmbeddings.mockImplementation(() => new Promise(() => {}));
    const result = await searchIssuesSemantically({
      userId: "u1", query: "single sign-on for enterprise customers", projectIds: ["p1"], deadlineMs: 20,
    });
    expect(result).toEqual({ status: "timeout", hits: [] });
  });
});
