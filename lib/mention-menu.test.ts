import { describe, expect, it } from "vitest";
import {
  filterMentionItems,
  findActiveMentionQuery,
  orderMentionItems,
} from "@/lib/mention-menu";

describe("findActiveMentionQuery", () => {
  it("opens on an at sign and keeps single spaces inside the query", () => {
    expect(findActiveMentionQuery("Ask @")).toEqual({
      start: 4,
      end: 5,
      query: "",
    });
    expect(findActiveMentionQuery("Ask @release planning")).toEqual({
      start: 4,
      end: 21,
      query: "release planning",
    });
    expect(findActiveMentionQuery("Ask @release ")?.query).toBe("release ");
  });

  it("ends mention mode on two consecutive spaces", () => {
    expect(findActiveMentionQuery("Ask @release  ")).toBeNull();
    expect(findActiveMentionQuery("Ask @release \u00a0")).toBeNull();
  });

  it("does not interpret email addresses or a second at sign as mentions", () => {
    expect(findActiveMentionQuery("hello@example.com")).toBeNull();
    expect(findActiveMentionQuery("Ask @first@second")).toBeNull();
  });

  it("supports a mention at the start of a new line", () => {
    expect(findActiveMentionQuery("First line\n@road map")).toEqual({
      start: 11,
      end: 20,
      query: "road map",
    });
  });
});

describe("mention menu results", () => {
  const items = [
    { type: "issue", label: "MIN-12", keywords: ["Release planning"] },
    { type: "member", label: "Release Planner" },
    { type: "page", label: "Release planning guide" },
    { type: "issue", label: "MIN-13", keywords: ["Release planning notes"] },
    { type: "objective", label: "Release planning" },
  ];

  it("keeps source order within groups and moves tickets last", () => {
    expect(orderMentionItems(items).map((item) => item.type)).toEqual([
      "member",
      "page",
      "objective",
      "issue",
      "issue",
    ]);
  });

  it("matches multi-word queries and keeps matching tickets last", () => {
    expect(
      filterMentionItems(items, "release planning").map((item) => item.type),
    ).toEqual(["page", "objective", "issue", "issue"]);
  });

  it("does not cap the number of results", () => {
    const many = Array.from({ length: 18 }, (_, index) => ({
      type: index % 3 === 0 ? "issue" : "page",
      label: `Result ${index}`,
    }));
    expect(filterMentionItems(many, "")).toHaveLength(18);
  });
});
