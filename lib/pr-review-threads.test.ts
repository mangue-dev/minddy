import { describe, expect, it } from "vitest";
import type { PullRequestReviewComment } from "@/lib/agent-api";
import {
  displayLineOf,
  displayStartLineOf,
  groupReviewThreads,
  type ReviewThreadState,
} from "@/lib/pr-review-threads";

/**
 * The cases below reproduce the REAL behavior of the GitHub API, noted
 * against a real PR: it dictates the rules, not intuition.
 */

function comment(over: Partial<PullRequestReviewComment> = {}): PullRequestReviewComment {
  return {
    id: 1,
    body: "body",
    path: "probe.txt",
    line: 150,
    original_line: 150,
    side: "RIGHT",
    start_line: null,
    original_start_line: null,
    start_side: null,
    in_reply_to_id: null,
    review_id: null,
    diff_hunk: "@@ -147,7 +147,7 @@",
    user: { login: "someone", avatar_url: null },
    created_at: "2026-07-17T10:00:00Z",
    html_url: "https://github.com/o/r/pull/1#discussion_r1",
    ...over,
  };
}

describe("groupReviewThreads", () => {
  it("groups replies under their root in chronological order", () => {
    const threads = groupReviewThreads([
      comment({ id: 10, created_at: "2026-07-17T10:00:00Z" }),
      comment({ id: 11, in_reply_to_id: 10, created_at: "2026-07-17T10:05:00Z" }),
      comment({ id: 12, in_reply_to_id: 10, created_at: "2026-07-17T10:02:00Z" }),
    ]);
    expect(threads).toHaveLength(1);
    expect(threads[0].id).toBe(10);
    expect(threads[0].root.id).toBe(10);
    expect(threads[0].comments.map((c) => c.id)).toEqual([10, 12, 11]);
  });

  it("attaches a reply to a reply to the root (GitHub flattens threads)", () => {
    // Checked against API: reply to response 11 returns in_reply_to_id = 10.
    const threads = groupReviewThreads([
      comment({ id: 10 }),
      comment({ id: 11, in_reply_to_id: 10 }),
      comment({ id: 12, in_reply_to_id: 10 }),
    ]);
    expect(threads).toHaveLength(1);
    expect(threads[0].comments).toHaveLength(3);
  });

  it("separates two distinct threads on the same line", () => {
    const threads = groupReviewThreads([
      comment({ id: 10, created_at: "2026-07-17T10:00:00Z" }),
      comment({ id: 20, created_at: "2026-07-17T11:00:00Z" }),
      comment({ id: 21, in_reply_to_id: 20 }),
    ]);
    expect(threads.map((t) => t.id)).toEqual([10, 20]);
  });

  it("promotes a reply with a missing root to a root instead of losing it", () => {
    const threads = groupReviewThreads([comment({ id: 11, in_reply_to_id: 999 })]);
    expect(threads).toHaveLength(1);
    expect(threads[0].id).toBe(11);
  });

  it("keeps ONE thread when a deleted root leaves several replies", () => {
    // Root 999 deleted on the forge: its responses keep `in_reply_to_id:999`.
    // Promoting them one by one gave as many threads as answers — and the
    // second also lost its resolution state, matched on the root alone.
    const threads = groupReviewThreads(
      [
        comment({ id: 12, in_reply_to_id: 999, created_at: "2026-07-17T10:05:00Z" }),
        comment({ id: 11, in_reply_to_id: 999, created_at: "2026-07-17T10:01:00Z" }),
      ],
      [{ rootCommentId: 11, threadId: "PRRT_kwDOABC", resolved: true, resolvedBy: "alice" }],
    );
    expect(threads).toHaveLength(1);
    // The OLDEST survivor makes root — the same as the forge makes.
    expect(threads[0].id).toBe(11);
    expect(threads[0].comments.map((c) => c.id)).toEqual([11, 12]);
    expect(threads[0].resolution?.resolved).toBe(true);
  });

  it("ne fusionne pas deux fils distincts dont les racines ont disparu", () => {
    const threads = groupReviewThreads([
      comment({ id: 11, in_reply_to_id: 998, created_at: "2026-07-17T10:01:00Z" }),
      comment({ id: 21, in_reply_to_id: 999, created_at: "2026-07-17T11:01:00Z" }),
    ]);
    expect(threads.map((t) => t.id)).toEqual([11, 21]);
  });
});

/**
 * MIN-139: resolution status comes from ANOTHER call than comments
 * (GraphQL on GitHub side, discussions on GitLab side). Everything therefore depends on the pairing
 * by the id of the ROOT — the only key that the two forges give, and the one on
 * which the grouping is already working on.
 */
describe("groupReviewThreads — resolution state", () => {
  const state = (over: Partial<ReviewThreadState> = {}): ReviewThreadState => ({
    rootCommentId: 10,
    threadId: "PRRT_kwDOABC",
    resolved: true,
    resolvedBy: "alice",
    ...over,
  });

  it("attache l'état au fil par l'id de sa racine, réponses comprises", () => {
    const threads = groupReviewThreads(
      [comment({ id: 10 }), comment({ id: 11, in_reply_to_id: 10 })],
      [state()],
    );
    expect(threads).toHaveLength(1);
    expect(threads[0].resolution).toEqual(state());
    expect(threads[0].comments).toHaveLength(2);
  });

  it("laisse `resolution` indéfini quand l'état n'est pas connu — pas « non résolu »", () => {
    // The nuance carries the UI: an unknown status thread does not offer “Resolve”,
    // where a known unresolved thread offers it.
    const [thread] = groupReviewThreads([comment({ id: 10 })]);
    expect(thread.resolution).toBeUndefined();
    const [withEmpty] = groupReviewThreads([comment({ id: 10 })], []);
    expect(withEmpty.resolution).toBeUndefined();
  });

  it("n'applique un état résolu qu'au fil visé, pas à ses voisins", () => {
    const threads = groupReviewThreads(
      [comment({ id: 10 }), comment({ id: 20, created_at: "2026-07-17T11:00:00Z" })],
      [state({ rootCommentId: 20, resolved: true })],
    );
    expect(threads.map((t) => !!t.resolution?.resolved)).toEqual([false, true]);
  });

  it("ignores state for a missing thread (lists read at two moments)", () => {
    const threads = groupReviewThreads(
      [comment({ id: 10 })],
      [state({ rootCommentId: 999 })],
    );
    expect(threads).toHaveLength(1);
    expect(threads[0].resolution).toBeUndefined();
  });

  it("preserves the provider's explicit outdated state on the matched thread", () => {
    const [thread] = groupReviewThreads(
      [comment({ id: 10 })],
      [state({ outdated: true })],
    );
    expect(thread.resolution?.outdated).toBe(true);
  });

  it("suit la racine PROMUE d'un fil tronqué par la pagination", () => {
    // The orphan response becomes its own root: it is this id which
    // pairs, otherwise a cut wire would lose its resolution state.
    const threads = groupReviewThreads(
      [comment({ id: 11, in_reply_to_id: 999 })],
      [state({ rootCommentId: 11, resolved: false, resolvedBy: null })],
    );
    expect(threads[0].resolution?.threadId).toBe("PRRT_kwDOABC");
    expect(threads[0].resolution?.resolved).toBe(false);
  });
});

describe("displayLineOf", () => {
  it("falls back to original_line when GitHub removed line", () => {
    expect(displayLineOf(comment({ line: null, original_line: 42 }))).toBe(42);
    expect(displayLineOf(comment({ line: 7, original_line: 42 }))).toBe(7);
  });
});

describe("displayStartLineOf", () => {
  it("falls back to original_start_line for an outdated multi-line comment", () => {
    expect(
      displayStartLineOf({ start_line: null, original_start_line: 236 }),
    ).toBe(236);
    expect(
      displayStartLineOf({ start_line: 12, original_start_line: 236 }),
    ).toBe(12);
  });
});
