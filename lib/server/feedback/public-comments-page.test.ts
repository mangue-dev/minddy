import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-714 — the public thread is read by pages, newest first, and its
 * summary covers the whole thread. A thread past the page bound used to keep
 * its 200 OLDEST comments: the 201st, even a team reply, never showed, and
 * the count and "team replied" badge stopped at the bound.
 */

type Row = Record<string, unknown>;

let rows: Row[] = [];
/** Ids requested by each body read, to check the bodies stay bounded. */
let bodyReads: string[][] = [];

function comment(index: number, extra: Row = {}): Row {
  return {
    id: `c${String(index).padStart(4, "0")}`,
    feedback_post_id: "post-1",
    visibility: "public",
    body: `Comment ${index}`,
    created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
    parent_id: null,
    feedback_user_id: "visitor-1",
    feedback_users: { pseudonym: "Calm Fox" },
    ...extra,
  };
}

vi.mock("@/lib/supabase-service", () => ({ getServiceClient: () => ({}) }));
vi.mock("@/lib/server/notifications", () => ({
  insertNotifications: async () => {},
  projectMemberIds: async () => new Set<string>(),
}));
vi.mock("@/lib/server/comment-store", () => ({
  commentStore: () => {
    const filters: Array<(row: Row) => boolean> = [];
    let ids: string[] | null = null;
    let descending = false;
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return query;
      },
      in: (column: string, values: string[]) => {
        ids = values;
        filters.push((row) => values.includes(row[column] as string));
        return query;
      },
      order: (_column: string, options?: { ascending?: boolean }) => {
        descending = options?.ascending === false;
        return query;
      },
      then: (resolve: (value: unknown) => unknown) => {
        if (ids) bodyReads.push(ids);
        const matched = rows.filter((row) => filters.every((filter) => filter(row)));
        if (descending) matched.reverse();
        return Promise.resolve({ data: matched, error: null, count: matched.length }).then(resolve);
      },
    };
    return query;
  },
}));

const { listPublicComments, PUBLIC_THREAD_LIMIT } = await import(
  "@/lib/server/feedback/comments"
);

beforeEach(() => {
  rows = [];
  bodyReads = [];
});

describe("listPublicComments", () => {
  it("shows the newest comment and the full-thread summary past the page bound", async () => {
    for (let i = 0; i < PUBLIC_THREAD_LIMIT; i += 1) rows.push(comment(i));
    // The 201st comment is a team reply to the very first thread.
    rows.push(comment(PUBLIC_THREAD_LIMIT, { feedback_user_id: null, parent_id: "c0000" }));
    // Never part of the public thread.
    rows.push(comment(9000, { visibility: "internal", feedback_user_id: null }));

    const page = await listPublicComments({ postId: "post-1", viewerId: null });

    const ids = page.comments.map((c) => c.id);
    expect(ids).toContain(`c0${PUBLIC_THREAD_LIMIT}`);
    // The reply comes with the root it answers, even though that root is
    // older than the page.
    expect(ids).toContain("c0000");
    expect(page.comments.find((c) => c.id === `c0${PUBLIC_THREAD_LIMIT}`)).toMatchObject({
      isTeam: true,
      parentId: "c0000",
    });
    expect(ids).not.toContain("c9000");
    expect(page.summary).toEqual({
      count: PUBLIC_THREAD_LIMIT + 1,
      teamRepliedAt: rows[PUBLIC_THREAD_LIMIT].created_at,
    });
    expect(page.earlierCursor).toBe("c0001");
    // Bodies stay bounded: the page plus the roots it needs.
    expect(bodyReads.flat()).toHaveLength(PUBLIC_THREAD_LIMIT + 1);
  });

  it("reaches every older comment through the cursor", async () => {
    for (let i = 0; i < PUBLIC_THREAD_LIMIT * 2 + 5; i += 1) rows.push(comment(i));

    const seen = new Set<string>();
    let cursor: string | null | undefined;
    let pages = 0;
    do {
      const page = await listPublicComments({ postId: "post-1", viewerId: null, before: cursor });
      for (const c of page.comments) seen.add(c.id);
      cursor = page.earlierCursor;
      pages += 1;
    } while (cursor && pages < 10);

    expect(pages).toBe(3);
    expect(seen.size).toBe(rows.length);
  });

  it("returns an empty page for a cursor that is not a comment of this thread", async () => {
    rows.push(comment(1), comment(2, { feedback_post_id: "other-post" }));

    const page = await listPublicComments({ postId: "post-1", viewerId: null, before: "c0002" });

    expect(page.comments).toEqual([]);
    expect(page.earlierCursor).toBeNull();
    expect(bodyReads).toEqual([]);
  });
});
