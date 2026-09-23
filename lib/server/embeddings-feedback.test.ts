import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EncryptedStore } from "./encryption/store";

const state = vi.hoisted(() => ({
  store: null as EncryptedStore | null,
  rows: [] as Record<string, unknown>[],
}));
vi.mock("./encryption/registry", () => ({ getEncryptedStore: () => state.store }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({ from: () => {
  const filters: Array<(row: Record<string, unknown>) => boolean> = [];
  let start = 0, end = 999;
  const query = {
    select: () => query,
    eq(column: string, value: unknown) { filters.push((row: Record<string, unknown>) => row[column] === value); return query; },
    neq(column: string, value: unknown) { filters.push((row: Record<string, unknown>) => row[column] !== value); return query; },
    is(column: string, value: unknown) { filters.push((row: Record<string, unknown>) => row[column] === value); return query; },
    order: () => query,
    range(from: number, to: number) { start = from; end = to; return query; },
    then(resolve: (value: unknown) => unknown) {
      return Promise.resolve({ data: state.rows.filter((row) => filters.every((filter) => filter(row)))
        .slice(start, end + 1), error: null }).then(resolve);
    },
  };
  return query;
} }) }));

import { encodeFeedbackPost } from "./feedback-post-store";
import { matchFeedbackPosts } from "./embeddings";

beforeEach(() => {
  vi.stubEnv("MINDDY_CONTENT_ENCRYPTION_ENABLED", "true");
  const key = randomBytes(32);
  state.store = new EncryptedStore({ current: async () => ({ version: 1, bytes: Buffer.from(key) }),
    byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(key) }) });
  state.rows = [];
});
afterEach(() => vi.unstubAllEnvs());

it("searches all encrypted feedback pages and filters private rows before decryption", async () => {
  for (let index = 0; index < 202; index++) {
    const best = index === 201;
    const privateRow = index === 200;
    state.rows.push(await encodeFeedbackPost({ id: `post-${String(index).padStart(3, "0")}`,
      project_id: "project-1", title: `Private title ${index}`, body: "Sensitive body",
      submitted_title: `Private title ${index}`, submitted_body: "Sensitive body",
      translated_title: null, translated_body: null, moderation_reason: null,
      embedding: best || privateRow ? "[1,0,0]" : "[0,1,0]",
      is_public: !privateRow, review_state: "published", status: "open",
      vote_count: 0, issue_id: null, merged_into_id: null, deleted_at: null }));
  }
  const results = await matchFeedbackPosts({ projectId: "project-1", embedding: [1, 0, 0],
    publicOnly: true, limit: 1 });
  expect(results).toMatchObject([{ id: "post-201", similarity: 1 }]);
  expect(JSON.stringify(results)).not.toContain("post-200");
});
