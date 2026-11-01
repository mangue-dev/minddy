import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { readFeedbackSelectionHint, writeFeedbackSelectionHint } from "./feedback-selection-hint";
import { seedPreparedPost } from "./feedback-query";
import { feedbackCommentsOptions, feedbackDetailOptions, feedbackEventsOptions } from "./secondary-view-queries";
import type { PreparedFeedbackPost } from "./server/feedback/post-reads";

const POST = "00000000-0000-4000-9000-000000000001";

describe("feedback selection hint (MIN-875)", () => {
  it("round-trips the view the page opens its post in", () => {
    const params = new URLSearchParams("statuses=open");
    writeFeedbackSelectionHint({ state: "planned", sort: "recent", onlyToReview: true, post: POST }, params);
    expect(readFeedbackSelectionHint(params)).toEqual({ state: "planned", sort: "recent", onlyToReview: true, post: POST });
    expect(params.getAll("statuses")).toEqual(["open"]);
  });

  it.each(["", "prepare=bogus.top.0", "prepare=unresolved.sideways.0", "prepare=unresolved.top.2"])("asks for nothing on %j", (query) => {
    expect(readFeedbackSelectionHint(new URLSearchParams(query))).toBeNull();
  });

  it("drops a post that is not an id", () => {
    expect(readFeedbackSelectionHint(new URLSearchParams("prepare=all.top.0&prepare_post=../x"))).toEqual({ state: "all", sort: "top", onlyToReview: false });
  });
});

describe("seedPreparedPost", () => {
  const prepared = { postId: POST, post: { id: POST, title: "Prepared" }, comments: [{ id: "c1" }], events: [{ id: "e1" }] } as unknown as PreparedFeedbackPost;

  it("fills the post's detail, comments and activity reads", () => {
    const client = new QueryClient();
    seedPreparedPost(client, "p1", prepared, Date.now());
    expect(client.getQueryData(feedbackDetailOptions("p1", POST).queryKey)).toMatchObject({ post: { id: POST, title: "Prepared" } });
    expect(client.getQueryData(feedbackCommentsOptions("p1", POST).queryKey)).toEqual([{ id: "c1" }]);
    expect(client.getQueryData(feedbackEventsOptions("p1", POST).queryKey)).toEqual([{ id: "e1" }]);
  });

  it("never replaces an answer newer than the list request", () => {
    const client = new QueryClient();
    const startedAt = Date.now() - 1_000;
    client.setQueryData(feedbackCommentsOptions("p1", POST).queryKey, [{ id: "newer" }] as never);
    seedPreparedPost(client, "p1", prepared, startedAt);
    expect(client.getQueryData(feedbackCommentsOptions("p1", POST).queryKey)).toEqual([{ id: "newer" }]);
  });
});
