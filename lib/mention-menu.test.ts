import { describe, expect, it } from "vitest";
import {
  filterMentionItems,
  findActiveMentionQuery,
  findActiveTriggerQuery,
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

  it("places Numo first only when the assistant matches the query", () => {
    const options = [...items, { type: "numo", label: "Numo", keywords: ["assistant"] }];
    expect(filterMentionItems(options, "")[0].type).toBe("numo");
    expect(filterMentionItems(options, "num").map((item) => item.type)).toEqual(["numo"]);
    expect(filterMentionItems(options, "release").some((item) => item.type === "numo")).toBe(false);
  });

  it("does not cap the number of results", () => {
    const many = Array.from({ length: 18 }, (_, index) => ({
      type: index % 3 === 0 ? "issue" : "page",
      label: `Result ${index}`,
    }));
    expect(filterMentionItems(many, "")).toHaveLength(18);
  });
});

describe("issue order in mention menus (MIN-726)", () => {
  const items = [
    { type: "issue", label: "MIN-1", keywords: ["Login fails"], status: "done" },
    { type: "member", label: "Login Bot" },
    { type: "issue", label: "MIN-2", keywords: ["Login page"], status: "triage" },
    { type: "issue", label: "MIN-3", keywords: ["Login copy"], status: "todo" },
    { type: "issue", label: "MIN-4", keywords: ["Login redirect"], status: "in_review" },
  ];

  it("lists issues under way first and closed or triage issues last, after the other options", () => {
    expect(filterMentionItems(items, "login").map((item) => item.label)).toEqual([
      "Login Bot", "MIN-4", "MIN-3", "MIN-1", "MIN-2",
    ]);
  });

  it("puts the issue whose identifier is typed before every tier", () => {
    expect(filterMentionItems(items, "min-1").map((item) => item.label)[0]).toBe("MIN-1");
  });
});

describe("findActiveTriggerQuery", () => {
  it("reads “/” like “@”: one space stays, two end the query", () => {
    expect(findActiveTriggerQuery("text /bullet li", "/")?.query).toBe("bullet li");
    expect(findActiveTriggerQuery("text /bullet  ", "/")).toBeNull();
    expect(findActiveTriggerQuery("http://example", "/")).toBeNull();
    // macOS turns a double space into a period and a space.
    expect(findActiveTriggerQuery("text /bullet. ", "/")).toBeNull();
    expect(findActiveMentionQuery("Ask @cam. ")).toBeNull();
  });

  it("ends a bare trigger on its first space, for good", () => {
    expect(findActiveTriggerQuery("text / ", "/")).toBeNull();
    expect(findActiveMentionQuery("Ask @\u00a0")).toBeNull();
    // Typing on after that space does not reopen the query.
    expect(findActiveMentionQuery("Ask @ cam")).toBeNull();
  });
});
