import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Comment } from "../types";
import { applyCommentEdits, editCommentOptimistically } from "./comment-edits";

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const key = ["comments", "issue"];
const original = { id: "comment", issue_id: "issue", body: "Original", updated_at: "2026-10-03T10:00:00Z" } as Comment;
let client: QueryClient;
beforeEach(() => { client = new QueryClient(); client.setQueryData(key, [original]); });
afterEach(() => client.clear());
const rows = () => client.getQueryData<Comment[]>(key)!;

describe("optimistic comment edits", () => {
  it("shows the submitted body immediately, sends once and replaces it with the canonical response", async () => {
    const request = deferred<Comment>(), send = vi.fn(() => request.promise);
    const result = editCommentOptimistically(client, "issue", "comment", "Draft", send);
    expect(rows()[0]).toMatchObject({ body: "Draft", optimisticEdit: true });
    expect(editCommentOptimistically(client, "issue", "comment", "Draft", send)).toBe(result);
    await expect(editCommentOptimistically(client, "issue", "comment", "Different", send)).rejects.toThrow("already being saved");
    request.resolve({ ...original, body: "Canonical", updated_at: "2026-10-03T10:01:00Z" });
    await result;
    expect(send).toHaveBeenCalledTimes(1);
    expect(rows()[0]).toMatchObject({ body: "Canonical", optimisticEdit: false });
  });

  it("protects pre-acknowledgement reads, accepts newer echoes and never resurrects deleted rows", async () => {
    const request = deferred<Comment>(), startedAt = Date.now() - 1;
    const result = editCommentOptimistically(client, "issue", "comment", "Draft", () => request.promise);
    expect(applyCommentEdits(client, "issue", [original], startedAt)[0].body).toBe("Draft");
    request.resolve({ ...original, body: "Saved", updated_at: "2026-10-03T10:01:00Z" }); await result;
    expect(applyCommentEdits(client, "issue", [original], startedAt)[0].body).toBe("Saved");
    const newer = { ...original, body: "Newer remote edit", updated_at: "2026-10-03T10:02:00Z" };
    expect(applyCommentEdits(client, "issue", [newer], startedAt)).toEqual([newer]);
    expect(applyCommentEdits(client, "issue", [], startedAt)).toEqual([]);
    expect(applyCommentEdits(client, "other", [original], startedAt)).toEqual([original]);
    expect(applyCommentEdits(new QueryClient(), "issue", [original], startedAt)).toEqual([original]);
  });

  it("rolls back the failed body alone without replaying an ambiguous write", async () => {
    const request = deferred<Comment>(), send = vi.fn(() => request.promise);
    const result = editCommentOptimistically(client, "issue", "comment", "Draft", send);
    const remote = { ...original, id: "remote", body: "Concurrent comment" };
    client.setQueryData(key, [...rows(), remote]);
    const rejected = expect(result).rejects.toThrow("Acknowledgement lost");
    request.reject(new Error("Acknowledgement lost")); await rejected;
    expect(rows()).toEqual([{ ...original, optimisticEdit: false }, remote]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  });

  it("leaves a newer cache edit untouched on failure", async () => {
    const request = deferred<Comment>();
    const result = editCommentOptimistically(client, "issue", "comment", "Draft", () => request.promise);
    const remote = { ...original, body: "New authoritative body" };
    client.setQueryData(key, [remote]);
    const rejected = expect(result).rejects.toThrow("Failed"); request.reject(new Error("Failed")); await rejected;
    expect(rows()).toEqual([remote]);
  });

  it("forgets edits when the cache owner is cleared while acknowledgement is pending", async () => {
    const request = deferred<Comment>(), startedAt = Date.now() - 1;
    const result = editCommentOptimistically(client, "issue", "comment", "Draft", () => request.promise);
    client.clear(); client.setQueryData(key, [original]);
    expect(applyCommentEdits(client, "issue", [original], startedAt)).toEqual([original]);
    request.resolve({ ...original, body: "Old owner's acknowledgement" }); await result;
    expect(rows()).toEqual([original]);
  });
});
