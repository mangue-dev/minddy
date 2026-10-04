import { beforeEach, expect, it, vi } from "vitest";

const query = vi.hoisted(() => ({
  result: null as { data: unknown; error: unknown } | null,
  rows: new Map<string, { id: string; body: string; edited_by: string | null; created_at: string }>(),
  insert: vi.fn(),
}));
vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({ from: () => {
  let ascending = true;
  const chain = {
    select: () => chain, eq: () => chain,
    order: (_column: string, options: { ascending: boolean }) => { ascending = options.ascending; return chain; },
    limit: async (limit: number) => query.result ?? { data: [...query.rows.values()]
      .sort((a, b) => (ascending ? 1 : -1) * a.created_at.localeCompare(b.created_at)).slice(0, limit), error: null },
    insert: query.insert,
  };
  return chain;
} }) }));
vi.mock("@/lib/server/git/repository-name-content", () => ({ repositoryStorageName: async (_provider: string, name: string) => name }));
vi.mock("./pr-comment-edit-content", () => ({
  decodePrCommentEdit: async (_id: string, body: string) => body,
  shouldEncryptPrCommentEdit: async () => false,
}));
import { listPrCommentEdits, recordPrCommentEditQuiet } from "./pr-comment-edits";
const input = { provider: "github" as const, repoFullName: "acme/app", prNumber: 1, commentId: 0 };

beforeEach(() => {
  query.result = null;
  query.rows.clear();
  query.insert.mockReset().mockImplementation(async (row) => {
    if (query.rows.has(row.id)) return { error: { code: "23505" } };
    query.rows.set(row.id, row);
    return { error: null };
  });
});

it("reports a failed history read instead of claiming no snapshots exist", async () => {
  query.result = { data: null, error: { code: "XX000" } };
  await expect(listPrCommentEdits(input)).rejects.toThrow("Unable to load previous comment versions");
});

it("preserves a genuinely empty history", async () => {
  expect(await listPrCommentEdits(input)).toEqual([]);
});

it("orders delayed edits by forge event time and deduplicates old and new replays", async () => {
  const older = { ...input, body: "Original", editedBy: "author", occurredAt: "2026-10-04T11:00:00Z" };
  const newer = { ...input, body: "Second version", editedBy: "author", occurredAt: "2026-10-04T12:00:00Z" };
  await recordPrCommentEditQuiet(newer);
  await recordPrCommentEditQuiet(older);
  await recordPrCommentEditQuiet(newer);
  await recordPrCommentEditQuiet(older);
  expect(await listPrCommentEdits(input)).toEqual([
    { body: "Original", edited_by: "author", created_at: "2026-10-04T11:00:00.000Z" },
    { body: "Second version", edited_by: "author", created_at: "2026-10-04T12:00:00.000Z" },
  ]);
});

it("deduplicates concurrent API and webhook echoes with equivalent timestamps", async () => {
  const snapshot = { ...input, body: "Original", editedBy: "author", occurredAt: "2026-10-04T11:00:00Z" };
  await Promise.all([
    recordPrCommentEditQuiet(snapshot),
    recordPrCommentEditQuiet({ ...snapshot, editedBy: "bot", occurredAt: "2026-10-04T13:00:00+02:00" }),
  ]);
  expect(query.rows.size).toBe(1);
  expect(query.insert.mock.calls[0][0].id).toBe(query.insert.mock.calls[1][0].id);
});

it("preserves returning to a previous body and distinct edits at the same timestamp", async () => {
  const snapshot = { ...input, body: "Original", editedBy: "author", occurredAt: "2026-10-04T11:00:00Z" };
  await recordPrCommentEditQuiet(snapshot);
  await recordPrCommentEditQuiet({ ...snapshot, body: "Second version" });
  await recordPrCommentEditQuiet({ ...snapshot, occurredAt: "2026-10-04T12:00:00Z" });
  expect(query.rows.size).toBe(3);
});

it.each([undefined, null, "invalid"])("does not append an undated snapshot (%s) in arrival order", async (occurredAt) => {
  await recordPrCommentEditQuiet({ ...input, body: "Original", editedBy: null, occurredAt });
  expect(query.insert).not.toHaveBeenCalled();
});

it("does not fail an already successful edit when snapshot storage fails", async () => {
  query.insert.mockRejectedValue(new Error("Unavailable"));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await expect(recordPrCommentEditQuiet({ ...input, body: "Original", editedBy: null,
      occurredAt: "2026-10-04T11:00:00Z" })).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith("[pr-comment-edits] snapshot_failed");
  } finally { log.mockRestore(); }
});
