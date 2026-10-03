import type { QueryClient } from "@tanstack/react-query";
import { mergeComment } from "../comment-cache";
import type { Comment } from "../types";

interface Edit {
  issueId: string;
  owner: object | undefined;
  original: Comment;
  body: string;
  settledAt: number | null;
  saved?: Comment;
  result: Promise<void>;
}

const edits = new WeakMap<QueryClient, Set<Edit>>();
const key = (issueId: string) => ["comments", issueId] as const;
function pending(client: QueryClient) {
  let writes = edits.get(client);
  if (!writes) { writes = new Set(); edits.set(client, writes); }
  for (const edit of writes) {
    if (edit.owner !== client.getQueryCache().find({ queryKey: key(edit.issueId), exact: true }) ||
      edit.settledAt !== null && edit.settledAt < Date.now() - 30_000) writes.delete(edit);
  }
  return writes;
}

/** Preserve edits against reads dispatched before acknowledgement, scoped to one cache owner. */
export function applyCommentEdits(client: QueryClient, issueId: string, rows: Comment[], startedAt: number): Comment[] {
  let next = rows;
  for (const edit of pending(client)) {
    if (edit.issueId !== issueId || edit.settledAt !== null && edit.settledAt <= startedAt) continue;
    next = next.map((row) => {
      if (row.id !== edit.original.id) return row;
      if (edit.saved) {
        // An independently newer server write remains authoritative.
        if (Date.parse(row.updated_at) > Date.parse(edit.saved.updated_at)) return row;
        return { ...row, body: edit.saved.body, updated_at: edit.saved.updated_at, optimisticEdit: false };
      }
      return { ...row, body: edit.body, optimisticEdit: true };
    });
  }
  return next;
}

/** Send once. Keep the editor draft in its mounted component until the write settles. */
export function editCommentOptimistically(client: QueryClient, issueId: string, commentId: string, body: string, send: () => Promise<Comment>): Promise<void> {
  const queryKey = key(issueId), writes = pending(client);
  const duplicate = [...writes].find((edit) => edit.issueId === issueId && edit.original.id === commentId && edit.settledAt === null);
  if (duplicate) return duplicate.body === body ? duplicate.result : Promise.reject(new Error("A comment edit is already being saved"));
  const original = client.getQueryData<Comment[]>(queryKey)?.find((row) => row.id === commentId);
  const query = client.getQueryCache().find({ queryKey, exact: true });
  const owned = () => query === client.getQueryCache().find({ queryKey, exact: true });
  if (!original) return send().then(() => { if (owned()) void client.invalidateQueries({ queryKey, exact: true }); });
  void client.cancelQueries({ queryKey, exact: true });
  const edit: Edit = { issueId, owner: query, original, body, settledAt: null, result: Promise.resolve() };
  writes.add(edit);
  client.setQueryData<Comment[]>(queryKey, (rows) => rows?.map((row) => row.id === commentId ? { ...row, body, optimisticEdit: true } : row));
  edit.result = (async () => {
    try {
      const saved = await send();
      if (!owned()) { writes.delete(edit); return; }
      await client.cancelQueries({ queryKey, exact: true });
      if (!owned()) { writes.delete(edit); return; }
      edit.saved = saved; edit.settledAt = Date.now();
      client.setQueryData<Comment[]>(queryKey, (rows) => mergeComment(rows, { ...saved, optimisticEdit: false }, false));
    } catch (error) {
      writes.delete(edit);
      if (owned()) {
        await client.cancelQueries({ queryKey, exact: true });
        if (owned()) client.setQueryData<Comment[]>(queryKey, (rows) => rows?.map((row) =>
          row.id === commentId && row.optimisticEdit && row.body === body
            ? { ...row, body: original.body, optimisticEdit: false } : row));
      }
      throw error;
    } finally {
      // Reconcile ambiguous acknowledgement failures by reading, never by replaying PATCH.
      if (owned()) void client.invalidateQueries({ queryKey, exact: true });
    }
  })();
  return edit.result;
}
