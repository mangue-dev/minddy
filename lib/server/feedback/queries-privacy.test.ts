import { describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const canonical: Row = {
  id: "canonical",
  project_id: "project-1",
  author_id: "author-1",
  title: "Canonical",
  body: "Body",
  submitted_title: "Canonical",
  submitted_body: "Body",
  translated_title: null,
  translated_body: null,
  moderation_reason: null,
  embedding: null,
  status: "open",
  vote_count: 0,
  merged_into_id: null,
  suggested_merge_into_id: null,
  suggested_confidence: null,
  source: "board",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  is_public: true,
  review_state: "published",
  deleted_at: null,
  feedback_users: { pseudonym: "Calm Fox" },
};

const merged: Row[] = [
  { ...canonical, id: "public", title: "Public duplicate", merged_into_id: "canonical", is_public: true, review_state: "published", status: "open", created_at: "1" },
  { ...canonical, id: "private", title: "Private duplicate", merged_into_id: "canonical", is_public: false, review_state: "published", status: "open", created_at: "2" },
  { ...canonical, id: "pending", title: "Pending duplicate", merged_into_id: "canonical", is_public: true, review_state: "pending", status: "open", created_at: "3" },
  { ...canonical, id: "spam", title: "Spam duplicate", merged_into_id: "canonical", is_public: true, review_state: "published", status: "spam", created_at: "4" },
];

// MIN-713: Alice's feedback merged into Bob's, which the team then made
// private, and into a public one for contrast.
const mergedAway: Row[] = [
  { ...canonical, id: "bob-private", author_id: "bob", title: "Bob's private post", is_public: false },
  { ...canonical, id: "alice-hidden", author_id: "alice", title: "Alice's post", merged_into_id: "bob-private" },
  { ...canonical, id: "public-target", author_id: "bob", title: "Bob's public post" },
  { ...canonical, id: "alice-visible", author_id: "alice", title: "Alice's other post", merged_into_id: "public-target" },
];

function query(table: string) {
  const filters: Array<(row: Row) => boolean> = [];
  const api = {
    select: () => api,
    eq: (column: string, value: unknown) => {
      filters.push((row) => row[column] === value);
      return api;
    },
    neq: (column: string, value: unknown) => {
      filters.push((row) => row[column] !== value);
      return api;
    },
    is: (column: string, value: unknown) => {
      filters.push((row) => row[column] === value);
      return api;
    },
    in: () => api,
    order: () => api,
    limit: () => api,
    rows: () => {
      if (table === "feedback_posts") return [canonical, ...merged, ...mergedAway].filter((row) => filters.every((filter) => filter(row)));
      return [];
    },
    maybeSingle: async () => ({ data: api.rows()[0] ?? null, error: null }),
    then: (resolve: (value: { data: Row[]; error: null }) => unknown) =>
      Promise.resolve(resolve({ data: api.rows(), error: null })),
  };
  return api;
}

vi.mock("@/lib/supabase-service", () => ({
  getServiceClient: () => ({ from: query }),
}));

const { getPublicPostDetail, listEarlierPublicComments } = await import(
  "@/lib/server/feedback/queries"
);

describe("getPublicPostDetail merge disclosure", () => {
  it("lists titles only from publicly readable merged posts", async () => {
    const detail = await getPublicPostDetail({
      projectId: "project-1",
      postId: "canonical",
      viewerId: null,
    });

    expect(detail?.mergedFromTitles).toEqual(["Public duplicate"]);
  });
});

describe("getPublicPostDetail merged into an unreadable destination", () => {
  it("redirects to a destination the viewer can read", async () => {
    const detail = await getPublicPostDetail({
      projectId: "project-1",
      postId: "alice-visible",
      viewerId: "alice",
    });

    expect(detail?.mergedIntoId).toBe("public-target");
    expect(detail?.mergedIntoUnreadable).toBe(false);
  });

  it("keeps the author's own post readable without revealing the private destination", async () => {
    const detail = await getPublicPostDetail({
      projectId: "project-1",
      postId: "alice-hidden",
      viewerId: "alice",
    });

    expect(detail).not.toBeNull();
    expect(detail?.mergedIntoId).toBeNull();
    expect(detail?.mergedIntoUnreadable).toBe(true);
    expect(detail?.post.id).toBe("alice-hidden");
    expect(detail?.post.title).toBe("Alice's post");
    expect(JSON.stringify(detail)).not.toContain("bob-private");
    expect(JSON.stringify(detail)).not.toContain("Bob's private post");
  });

  it.each([null, "someone-else"])("returns 404 to viewer %s instead of pointing at the private destination", async (viewerId) => {
    expect(
      await getPublicPostDetail({ projectId: "project-1", postId: "alice-hidden", viewerId })
    ).toBeNull();
  });

  it("still redirects Bob, who can read his own private post", async () => {
    const detail = await getPublicPostDetail({
      projectId: "project-1",
      postId: "alice-hidden",
      viewerId: "bob",
    });

    expect(detail?.mergedIntoId).toBe("bob-private");
  });
});

describe("listEarlierPublicComments visibility", () => {
  const read = (postId: string, viewerId: string | null) =>
    listEarlierPublicComments({ projectId: "project-1", postId, viewerId, before: "c1" });

  it("reads the thread of a publicly visible post", async () => {
    expect(await read("canonical", null)).toEqual({ comments: [], earlierCursor: null });
  });

  it.each([
    ["a private post", "bob-private", null],
    ["someone else's private post", "bob-private", "alice"],
    ["a merged post someone else wrote", "public", null],
  ])("refuses %s", async (_label, postId, viewerId) => {
    expect(await read(postId, viewerId)).toBeNull();
  });

  it("lets authors read their own private or merged post", async () => {
    expect(await read("bob-private", "bob")).not.toBeNull();
    expect(await read("alice-hidden", "alice")).not.toBeNull();
  });
});
