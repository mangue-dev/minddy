import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { mergeComment, publishCommentWrite, removeCommentThread } from "./comment-cache";

const original = {
  id: "comment-1",
  parent_id: null,
  body: "Original",
  updated_at: "2026-09-20T10:00:00.000Z",
  attachments: [{ id: "attachment-1" }],
};

describe("comment mutation cache", () => {
  it("publishes a saved comment before a reconciliation read completes", async () => {
    const queryClient = new QueryClient();
    const key = ["comments", "issue-1"];
    let resolveRead!: (value: typeof original[]) => void;
    queryClient.setQueryData(key, [original]);
    const pendingRead = queryClient.fetchQuery({
      queryKey: key,
      queryFn: () => new Promise<typeof original[]>((resolve) => { resolveRead = resolve; }),
      staleTime: 0,
    }).catch(() => undefined);
    const saved = { ...original, id: "comment-2", body: "Saved reply" };

    await publishCommentWrite<typeof original>(queryClient, key,
      (comments) => mergeComment(comments, saved));
    expect(queryClient.getQueryData(key)).toEqual([original, saved]);
    resolveRead([original]);
    await pendingRead;
    expect(queryClient.getQueryData(key)).toEqual([original, saved]);
    queryClient.clear();
  });

  it("merges overlapping successful writes without replacing the discussion", async () => {
    const queryClient = new QueryClient();
    const key = ["page-comments", "page-1"];
    queryClient.setQueryData(key, [original]);
    const second = { ...original, id: "comment-2" };
    const third = { ...original, id: "comment-3" };
    await Promise.all([
      publishCommentWrite<typeof original>(queryClient, key, (comments) => mergeComment(comments, second)),
      publishCommentWrite<typeof original>(queryClient, key, (comments) => mergeComment(comments, third)),
    ]);
    expect(queryClient.getQueryData(key)).toEqual([original, second, third]);
    queryClient.clear();
  });

  it("keeps attachment hydration when an edit response contains only database fields", () => {
    const saved = { id: original.id, parent_id: null, body: "Edited", updated_at: "2026-09-20T10:01:00.000Z" };
    expect(mergeComment([original], saved, false)).toEqual([{ ...original, ...saved }]);
  });

  it("does not overwrite a newer realtime edit or reinsert a deleted comment", () => {
    const newer = { ...original, body: "Newer", updated_at: "2026-09-20T10:02:00.000Z" };
    const comments = [newer];
    expect(mergeComment(comments, original, false)).toBe(comments);
    expect(mergeComment([], original, false)).toEqual([]);
  });

  it("removes a deleted root and replies while preserving unrelated threads", () => {
    const reply = { ...original, id: "reply", parent_id: original.id };
    const other = { ...original, id: "other" };
    expect(removeCommentThread([original, reply, other], original.id)).toEqual([other]);
    expect(removeCommentThread([original, reply, other], reply.id)).toEqual([original, other]);
  });
});
