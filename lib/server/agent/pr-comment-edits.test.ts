import { expect, it, vi } from "vitest";
const query = vi.hoisted(() => ({ result: { data: null as unknown, error: null as unknown } }));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({ from: () => {
  const chain = { select: () => chain, eq: () => chain, order: () => chain,
    limit: async () => query.result };
  return chain;
} }) }));
vi.mock("@/lib/server/git/repository-name-content", () => ({ repositoryStorageName: async (_provider: string, name: string) => name }));
vi.mock("./pr-comment-edit-content", () => ({ decodePrCommentEdit: async (_id: string, body: string) => body }));
import { listPrCommentEdits } from "./pr-comment-edits";
const input = { provider: "github" as const, repoFullName: "acme/app", prNumber: 1, commentId: 0 };

it("reports a failed history read instead of claiming no snapshots exist", async () => {
  query.result = { data: null, error: { code: "XX000" } };
  await expect(listPrCommentEdits(input)).rejects.toThrow("Unable to load previous comment versions");
});

it("preserves a genuinely empty history", async () => {
  query.result = { data: [], error: null };
  expect(await listPrCommentEdits(input)).toEqual([]);
});
