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
  { id: "public", title: "Public duplicate", merged_into_id: "canonical", is_public: true, review_state: "published", status: "open", deleted_at: null, created_at: "1" },
  { id: "private", title: "Private duplicate", merged_into_id: "canonical", is_public: false, review_state: "published", status: "open", deleted_at: null, created_at: "2" },
  { id: "pending", title: "Pending duplicate", merged_into_id: "canonical", is_public: true, review_state: "pending", status: "open", deleted_at: null, created_at: "3" },
  { id: "spam", title: "Spam duplicate", merged_into_id: "canonical", is_public: true, review_state: "published", status: "spam", deleted_at: null, created_at: "4" },
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
      if (table === "feedback_posts") return [canonical, ...merged].filter((row) => filters.every((filter) => filter(row)));
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

const { getPublicPostDetail } = await import("@/lib/server/feedback/queries");

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
