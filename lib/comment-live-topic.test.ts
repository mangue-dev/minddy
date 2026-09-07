import { describe, expect, it } from "vitest";
import { numoCommentTopic } from "./comment-live-topic";

describe("Numo comment live topics", () => {
  it("keeps equal ids in separate table namespaces", () => {
    const id = "73300000-0000-4000-8000-000000000001";

    expect(numoCommentTopic(id, "comments")).toBe(`numo-comment:${id}`);
    expect(numoCommentTopic(id, "page_comments")).toBe(
      `numo-page-comment:${id}`,
    );
  });
});
