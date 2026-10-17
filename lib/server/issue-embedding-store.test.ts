import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "./encryption/store";

/**
 * The issue vector repository (MIN-717): vectors and their content
 * fingerprints never reach Postgres in clear once the project encrypts, a
 * clear row is converted in place under compare-and-swap, and a write removes
 * only the versions it is told are outdated.
 */

const state = vi.hoisted(() => ({
  store: null as EncryptedStore | null,
  scopes: [] as string[],
  calls: [] as { table: string; op: string; payload?: unknown; filters: [string, string, unknown][] }[],
  updatedRows: [{ issue_id: "i1" }] as unknown[],
}));

vi.mock("./encryption/registry", () => ({ getEncryptedStore: () => state.store }));

function client() {
  return {
    from: (table: string) => {
      const call = { table, op: "select", payload: undefined as unknown, filters: [] as [string, string, unknown][] };
      state.calls.push(call);
      const q = {
        select: () => q,
        upsert(payload: unknown) { call.op = "upsert"; call.payload = payload; return Promise.resolve({ error: null }); },
        update(payload: unknown) { call.op = "update"; call.payload = payload; return q; },
        delete() { call.op = "delete"; return q; },
        eq(c: string, v: unknown) { call.filters.push(["eq", c, v]); return q; },
        in(c: string, v: unknown) { call.filters.push(["in", c, v]); return q; },
        async maybeSingle() {
          const projectId = call.filters.find(([, c]) => c === "project_id")?.[2];
          return { data: state.scopes.includes(projectId as string) ? { project_id: projectId } : null, error: null };
        },
        then(resolve: (v: unknown) => unknown) {
          return Promise.resolve({ data: call.op === "update" ? state.updatedRows : [], error: null }).then(resolve);
        },
      };
      return q;
    },
  };
}

vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => client() }));

import {
  decodeIssueEmbedding,
  encodeIssueEmbedding,
  projectEncrypts,
  rewriteStoredEmbedding,
  writeIssueEmbedding,
  type IssueEmbeddingRow,
} from "./issue-embedding-store";

const row: IssueEmbeddingRow = {
  issue_id: "i1",
  project_id: "p1",
  index_version: "openrouter:openai/text-embedding-3-small:3",
  content_version: "v1",
  dimensions: 3,
  embedding: [0.1, 0.2, 0.3],
  content_hash: "a".repeat(64),
};

beforeEach(() => {
  const key = randomBytes(32);
  state.store = new EncryptedStore({ current: async () => ({ version: 1, bytes: Buffer.from(key) }),
    byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(key) }) });
  state.scopes = [];
  state.calls = [];
  state.updatedRows = [{ issue_id: "i1" }];
});
afterEach(() => vi.unstubAllEnvs());

describe("issue embedding repository", () => {
  it("encrypts the vector and the fingerprint together, and decodes them back", async () => {
    vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "true");
    const stored = await encodeIssueEmbedding(row);
    expect(stored.embedding).toBeNull();
    expect(stored.content_hash).toBeNull();
    expect(stored.encrypted_content).not.toBeNull();
    expect(JSON.stringify(stored)).not.toContain("0.2");
    const decoded = await decodeIssueEmbedding(stored);
    expect(decoded.content_hash).toBe(row.content_hash);
    // int8 storage: each coordinate within one quantization step of its value.
    decoded.embedding.forEach((value, i) => expect(Math.abs(value - row.embedding[i])).toBeLessThan(0.3 / 127));
  });

  it("encrypts as soon as the project has an issue encryption scope, root key or not", async () => {
    vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "false");
    vi.stubEnv("MINDDY_DATA_ROOT_KEY", "");
    await expect(projectEncrypts("p1")).resolves.toBe(false);
    state.scopes = ["p1"];
    await expect(projectEncrypts("p1")).resolves.toBe(true);
  });

  it("removes only the versions it is told are outdated, never the one just written", async () => {
    await writeIssueEmbedding(client() as never, row, [row.index_version, "google:gemini-embedding-001:3"]);
    const purge = state.calls.find((call) => call.table === "issue_embeddings" && call.op === "delete");
    expect(purge?.filters).toContainEqual(["in", "index_version", ["google:gemini-embedding-001:3"]]);
    state.calls = [];
    await writeIssueEmbedding(client() as never, row, []);
    expect(state.calls.some((call) => call.op === "delete")).toBe(false);
  });

  it("re-encodes a clear row under compare-and-swap once its project encrypts", async () => {
    vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "true");
    await expect(rewriteStoredEmbedding(client() as never, { ...row, stored_clear: true, stored_encryption_version: 0 }))
      .resolves.toBe(true);
    const update = state.calls.find((call) => call.op === "update")!;
    expect(update.payload).toMatchObject({ embedding: null, content_hash: null });
    expect(update.filters).toEqual(expect.arrayContaining([
      ["eq", "content_version", "v1"], ["eq", "encryption_version", 0],
    ]));
    // A concurrent rewrite won: nothing matched, nothing is claimed.
    state.updatedRows = [];
    await expect(rewriteStoredEmbedding(client() as never, { ...row, stored_clear: true, stored_encryption_version: 0 }))
      .resolves.toBe(false);
  });

  it("leaves rows alone while the project stays in clear", async () => {
    vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "false");
    await expect(rewriteStoredEmbedding(client() as never, { ...row, stored_clear: true, stored_encryption_version: 0 }))
      .resolves.toBe(false);
    expect(state.calls.some((call) => call.op === "update")).toBe(false);
  });

  it("stores the vector compactly, about ten times smaller once encrypted", async () => {
    vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "true");
    const big = { ...row, dimensions: 1536, embedding: Array.from({ length: 1536 }, (_, i) => Math.sin(i) * 0.03) };
    const compact = JSON.stringify(await encodeIssueEmbedding(big)).length;
    const legacyPayload = JSON.stringify(big.embedding).length;
    expect(compact).toBeLessThan(legacyPayload / 5);
    const decoded = await decodeIssueEmbedding(await encodeIssueEmbedding(big));
    expect(decoded.stored_legacy_format).toBeUndefined();
    const maxError = Math.max(...decoded.embedding.map((v, i) => Math.abs(v - big.embedding[i])));
    expect(maxError).toBeLessThanOrEqual(0.03 / 254 + 1e-12);
  });

  it("still reads legacy float arrays, flags them, and rewrites them in place", async () => {
    vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "false");
    const legacy = { ...row, embedding: JSON.stringify(row.embedding), encryption_version: 0, encrypted_content: null };
    const decoded = await decodeIssueEmbedding(legacy);
    expect(decoded).toMatchObject({ embedding: row.embedding, stored_legacy_format: true, stored_encryption_version: 0 });
    await expect(rewriteStoredEmbedding(client() as never, decoded)).resolves.toBe(true);
    const update = state.calls.find((call) => call.op === "update")!;
    expect(update.payload).toMatchObject({ embedding: { f: "i8" } });
    expect(update.filters).toContainEqual(["eq", "encryption_version", 0]);
  });
});
