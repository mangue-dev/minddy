import { describe, expect, it } from "vitest";
import { groupBySection, mentionSection, stepSuggestion } from "./suggestion-menu";

describe("groupBySection", () => {
  it("keeps each section where its first item stands, and never splits one", () => {
    const items = [
      { id: "task", section: "lists" },
      { id: "dictate", section: "lists" },
      { id: "text", section: "basic" },
      { id: "bullet", section: "lists" },
      { id: "code", section: "advanced" },
    ];
    const { ordered, sections } = groupBySection(items, (item) => item.section);
    expect(ordered.map((item) => item.id)).toEqual(["task", "dictate", "bullet", "text", "code"]);
    expect(sections.map(({ id, start, items: list }) => [id, start, list.length])).toEqual([
      ["lists", 0, 3],
      ["basic", 3, 1],
      ["advanced", 4, 1],
    ]);
  });

  it("lists items without a section under no header", () => {
    const { sections } = groupBySection([{ id: "skill" }], () => undefined);
    expect(sections).toEqual([{ id: null, start: 0, items: [{ id: "skill" }] }]);
  });
});

describe("stepSuggestion", () => {
  it("reaches the close row from the first item and wraps back from it", () => {
    // Three items (0, 1, 2) and the close row at index 3.
    expect(stepSuggestion(0, 3, "up")).toBe(3);
    expect(stepSuggestion(3, 3, "down")).toBe(0);
    expect(stepSuggestion(2, 3, "down")).toBe(3);
    expect(stepSuggestion(3, 3, "up")).toBe(2);
    expect(stepSuggestion(1, 3, "down")).toBe(2);
  });

  it("starts from nothing highlighted, and offers only the close row when nothing matches", () => {
    expect(stepSuggestion(-1, 3, "down")).toBe(0);
    expect(stepSuggestion(-1, 3, "up")).toBe(3);
    expect(stepSuggestion(-1, 0, "down")).toBe(0);
    expect(stepSuggestion(0, 0, "down")).toBe(0);
    expect(stepSuggestion(0, 0, "up")).toBe(0);
  });
});

describe("mentionSection", () => {
  it("groups by what a mention cites, related-by-meaning issues apart", () => {
    expect(mentionSection({ type: "numo" })).toBe("people");
    expect(mentionSection({ type: "member" })).toBe("people");
    expect(mentionSection({ type: "forge" })).toBe("people");
    expect(mentionSection({ type: "issue" })).toBe("issues");
    expect(mentionSection({ type: "issue", semantic: true })).toBe("semantic");
    expect(mentionSection({ type: "objective" })).toBe("objectives");
    expect(mentionSection({ type: "page" })).toBe("pages");
    expect(mentionSection({ type: "project" })).toBe("projects");
    expect(mentionSection({ type: "resource" })).toBe("resources");
  });
});
