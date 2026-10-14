import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { feedbackFiltersForDestination, feedbackFiltersForRequestedPost, feedbackQueryOptions } from "./feedback-query";
import { FEEDBACK_OPEN_STATUSES } from "@/lib/feedback/types";
import type { TeamFeedbackListItem } from "@/lib/server/feedback/team-queries";

const project = "00000000-0000-4000-8000-000000000001";
const category = "00000000-0000-4000-8000-000000000002";
const id = (n: number) => `00000000-0000-4000-9000-${n.toString(16).padStart(12, "0")}`;
const rows = Array.from({ length: 120 }, (_, index) => ({ id: id(index + 1), project_id: project,
  status: index < 96 ? "open" : "shipped", category_ids: [category], objective_id: null,
  author_id: null, is_public: true, source: "board", review_state: "published", sensitivity: null,
} as unknown as TeamFeedbackListItem));
const normal = { statuses: [...FEEDBACK_OPEN_STATUSES] };
const envelope = (posts = rows.slice(0, 96)) => ({ posts, board_enabled: true });
const href = (postId: string) => `/projects/${project}/feedback?post=${postId}`;
afterEach(() => vi.unstubAllGlobals());

describe("requested feedback scope reuse", () => {
  it("keeps the accepted 96-row query under its exact key without manufacturing the 120-row query", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 300_000 } } });
    const accepted = envelope(); client.setQueryData(feedbackQueryOptions(project, normal).queryKey, accepted);
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const selected = feedbackFiltersForRequestedPost(client, project, id(96), normal);
    expect(selected).toBe(normal);
    expect(feedbackFiltersForDestination(href(id(96)))).toEqual({});
    expect(await client.fetchQuery(feedbackQueryOptions(project, selected))).toBe(accepted);
    expect(fetch).not.toHaveBeenCalled();
    expect(client.getQueryState(["feedback", project])).toBeUndefined();
    expect(accepted.posts).toHaveLength(96);
    client.clear();
  });

  it("reuses the caller's exact saved property and status scope", () => {
    const client = new QueryClient(), filters = { ...normal, category: [category], visibility: ["public"] };
    client.setQueryData(feedbackQueryOptions(project, filters).queryKey, envelope());
    expect(feedbackFiltersForRequestedPost(client, project, id(1), filters)).toBe(filters);
    expect(client.getQueryState(["feedback", project])).toBeUndefined(); client.clear();
  });

  it.each(["missing", "invalidated", "error", "foreign", "resolved", "property", "review"])
    ("uses the ordinary full scope for a %s accepted-target boundary", async (boundary) => {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const data = envelope();
      if (boundary === "foreign") data.posts[0] = { ...data.posts[0], project_id: "foreign" };
      if (boundary === "resolved") data.posts[0] = { ...data.posts[0], status: "shipped" };
      if (boundary === "property") data.posts[0] = { ...data.posts[0], category_ids: [] };
      const filters = boundary === "property" ? { ...normal, category: [category] } : normal;
      if (boundary !== "missing") client.setQueryData(feedbackQueryOptions(project, filters).queryKey, data);
      if (boundary === "invalidated") await client.invalidateQueries({ queryKey: feedbackQueryOptions(project, filters).queryKey, exact: true, refetchType: "none" });
      if (boundary === "error") client.getQueryCache().find({ queryKey: feedbackQueryOptions(project, filters).queryKey, exact: true })!
        .setState({ status: "error", error: new Error("Denied") });
      const fetch = vi.fn(async () => Response.json(envelope(rows))); vi.stubGlobal("fetch", fetch);
      const selection = feedbackFiltersForRequestedPost(client, project, id(1), filters, boundary === "review");
      expect(selection).toEqual({});
      expect(await client.fetchQuery(feedbackQueryOptions(project, selection))).toMatchObject({ posts: rows });
      expect(fetch).toHaveBeenCalledWith(`/api/projects/${project}/feedback`, expect.objectContaining({ cache: "no-store" }));
      expect(client.getQueryData(feedbackQueryOptions(project, filters).queryKey)).toBe(boundary === "missing" ? undefined : data);
      client.clear();
    });

  it("keeps an unknown or explicit resolved target on the actual full reader", async () => {
    const client = new QueryClient(); client.setQueryData(feedbackQueryOptions(project, normal).queryKey, envelope());
    expect(feedbackFiltersForRequestedPost(client, project, id(120), normal)).toEqual({});
    expect(feedbackFiltersForRequestedPost(client, project, id(121), normal)).toEqual({});
    expect(feedbackFiltersForDestination(href(id(1)))).toEqual({});
    client.clear();
  });

  it("does not mutate accepted normal data or publish a partial full cache when the full reader denies access", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const accepted = envelope(); client.setQueryData(feedbackQueryOptions(project, normal).queryKey, accepted);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "Denied" }, { status: 403 })));
    await expect(client.fetchQuery(feedbackQueryOptions(project, feedbackFiltersForRequestedPost(client, project, id(120), normal)))).rejects.toThrow("Denied");
    expect(client.getQueryData(feedbackQueryOptions(project, normal).queryKey)).toBe(accepted);
    expect(client.getQueryData(["feedback", project])).toBeUndefined(); client.clear();
  });
});
