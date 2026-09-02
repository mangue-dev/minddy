/**
 * Grouping PR review comments into threads. Deliberately PUR
 * (no dependencies) and generic: the same rule is used for client rendering and for
 * agent context construction, server side — duplicating it would make them
 * diverge. What depends on the rendered diff lives in `pr-review-diff`.
 */

/** The bare minimum for bundling — the client and server types conform to this. */
export interface ReviewCommentLike {
  id: number;
  /** Root of the thread, or null if this comment IS the root. */
  in_reply_to_id: number | null;
  created_at: string;
}

/**
 * What the forge knows about a THREAD and which the list of comments does not say
 * (MIN-139): its own identity and its resolution state.
 *
 * `rootCommentId` is the pairing key: the two forges designate the thread by
 * its first comment, exactly the id that `groupReviewThreads`
 * already aggregates to. `threadId`, is OPAQUE and unrelated to the ids of
 * comments — node id GraphQL on the GitHub side (`PRRT_…`, only key accepted by
 * `resolveReviewThread`), discussion id on the GitLab side. Hence its type `string`:
 * it does not compare, it is returned as is to the forge.
 */
export interface ReviewThreadState {
  rootCommentId: number;
  threadId: string;
  resolved: boolean;
  /** Who has resolved, when the forge says it — the header of a folded wire names it. */
  resolvedBy: string | null;
  /** The forge can no longer attach the thread to the current version of the diff. */
  outdated?: boolean;
}

/** A review thread: the root and its responses, from oldest to most recent. */
export interface ReviewThread<T extends ReviewCommentLike = ReviewCommentLike> {
  /** Root id — this is what we pass to the `/replies` endpoint. */
  id: number;
  root: T;
  comments: T[];
  /**
 * State of the thread at the forge, when the caller loaded it (`listReviewThreads`).
 * `undefined` = UNKNOWN — not “unresolved”: this is the case of any caller who
 * only reads the comments, and the UI then offers no comments. affordance
 * rather than showing an open thread that may not be open.
 */
  resolution?: ReviewThreadState;
}

/**
 * Groups comments into threads. GitHub threads are FLAT: responding to a
 * response returns a `in_reply_to_id` that points to the ROOT, never the response
 * (checked against the API) — hence the key `in_reply_to_id ?? id`, without recursion.
 *
 * `states` (optional) attaches the resolution state, matched by the root. A
 * corresponding thread state is ignored, and a stateless thread remains `undefined` :
 * the two lists come from two separate calls and may diverge from a
 * comment posted between the two.
 */
export function groupReviewThreads<T extends ReviewCommentLike>(
  comments: T[],
  states?: ReviewThreadState[],
): Array<ReviewThread<T>> {
  const byId = new Map(comments.map((c) => [c.id, c]));
  const olderFirst = (a: T, b: T) => a.created_at.localeCompare(b.created_at) || a.id - b.id;

  // First grouping on the DECLARED root, even when this comment
  // is no longer in the list: it is `in_reply_to_id` which says “these answers are
  // ONE thread”, and him alone. Promote comment by comment (the old
  // cutting) burst a thread whose root had been removed in as many
  // son only surviving answers.
  const declared = new Map<number, T[]>();
  for (const c of comments) {
    const key = c.in_reply_to_id ?? c.id;
    const group = declared.get(key);
    if (group) group.push(c);
    else declared.set(key, [c]);
  }

  // Then promotion, once per thread: root absent → oldest answer
  // SURVIVOR takes its place. This is also what the two forges do in this
  // case (first remaining comment of the thread: `comments(first:1)` on the GitHub side, the
  // first DiffNote on GitLab side), so the resolution state still matches.
  const groups = new Map<number, T[]>();
  for (const [key, group] of declared) {
    const rootId = byId.has(key) ? key : group.reduce((a, b) => (olderFirst(a, b) <= 0 ? a : b)).id;
    const existing = groups.get(rootId);
    if (existing) existing.push(...group);
    else groups.set(rootId, [...group]);
  }

  const stateByRoot = new Map((states ?? []).map((s) => [s.rootCommentId, s]));
  const threads = [...groups.entries()].map(([rootId, group]) => {
    const sorted = [...group].sort(olderFirst);
    return {
      id: rootId,
      root: byId.get(rootId) ?? sorted[0],
      comments: sorted,
      resolution: stateByRoot.get(rootId),
    };
  });
  // Threads ordered by their root: two threads on the same line stack in
  // the order in which they were opened.
  return threads.sort(
    (a, b) => a.root.created_at.localeCompare(b.root.created_at) || a.id - b.id,
  );
}

/**
 * Line to DISPLAY for an outdated thread: `line` when GitHub still knows how to place it,
 * otherwise the line from the original commit. Serves as a label (“file:120”), not as an anchor — an expired thread no longer has one.
 */
export function displayLineOf(comment: { line: number | null; original_line: number | null }): number | null {
  return comment.line ?? comment.original_line;
}

/**
 * First line to display for a multi-line comment. GitHub clears `start_line`
 * when the referenced code changes, while preserving `original_start_line`.
 */
export function displayStartLineOf(comment: {
  start_line: number | null;
  original_start_line: number | null;
}): number | null {
  return comment.start_line ?? comment.original_start_line;
}
