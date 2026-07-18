import { describe, expect, it } from "vitest";
import {
  appendScratchpadTasks,
  removeCompletedTasks,
  splitScratchpadSections,
} from "@/lib/scratchpad";
import { parsePlan, setTaskState } from "@/lib/plan";

describe("splitScratchpadSections", () => {
  it("returns nothing for blank content", () => {
    expect(splitScratchpadSections("")).toEqual([]);
    expect(splitScratchpadSections("\n  \n")).toEqual([]);
  });

  it("keeps a note with no headings as a single untitled section", () => {
    const sections = splitScratchpadSections("- [ ] a\n- [x] b");
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBeNull();
    expect(sections[0].startLine).toBe(0);
  });

  it("splits on headings and preserves the preamble + titles", () => {
    const note = "intro\n## First\n- [ ] a\n## Second\n- [ ] b";
    const sections = splitScratchpadSections(note);
    expect(sections.map((s) => s.title)).toEqual([null, "First", "Second"]);
    expect(sections.map((s) => s.startLine)).toEqual([0, 1, 3]);
    expect(sections[1].markdown).toBe("## First\n- [ ] a");
  });

  it("addresses a section task at its absolute line in the whole note", () => {
    const note = "intro\n## First\n- [ ] a\n## Second\n- [ ] b";
    const second = splitScratchpadSections(note)[2];
    const relLine = parsePlan(second.markdown).tasks[0].line; // 1 within the section
    const absLine = second.startLine + relLine; // → 4 in the full note
    expect(setTaskState(note, absLine, "completed")).toContain("- [x] b");
    // the other task must be untouched
    expect(setTaskState(note, absLine, "completed")).toContain("- [ ] a");
  });

  it("does not treat a '#' inside a code fence as a heading", () => {
    const note = "## Real\n```\n# not a heading\n```\n- [ ] x";
    const sections = splitScratchpadSections(note);
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe("Real");
  });
});

describe("appendScratchpadTasks", () => {
  it("appends at the end of the document with the right marker", () => {
    const out = appendScratchpadTasks("- [ ] a", [
      { text: "b", state: "pending" },
      { text: "c", state: "in_progress" },
    ]);
    expect(out).toBe("- [ ] a\n- [ ] b\n- [~] c\n");
  });

  it("seeds an empty note", () => {
    expect(appendScratchpadTasks("", [{ text: "first", state: "pending" }])).toBe(
      "- [ ] first\n"
    );
  });

  it("inserts at the end of a named section, before the next heading", () => {
    const note = "## A\n- [ ] a1\n\n## B\n- [ ] b1";
    const out = appendScratchpadTasks(note, [{ text: "a2", state: "pending" }], "A");
    expect(out).toBe("## A\n- [ ] a1\n- [ ] a2\n\n## B\n- [ ] b1");
  });

  it("appends to the last section when it is the target", () => {
    const note = "## A\n- [ ] a1\n## B\n- [ ] b1";
    const out = appendScratchpadTasks(note, [{ text: "b2", state: "completed" }], "B");
    expect(out).toBe("## A\n- [ ] a1\n## B\n- [ ] b1\n- [x] b2");
  });

  it("flattens multi-line task text to one line", () => {
    const out = appendScratchpadTasks("", [
      { text: "line one\nline two", state: "pending" },
    ]);
    expect(out).toBe("- [ ] line one line two\n");
  });

  it("returns null when the section is not found", () => {
    expect(
      appendScratchpadTasks("## A\n- [ ] a", [{ text: "x", state: "pending" }], "Z")
    ).toBeNull();
  });
});

describe("removeCompletedTasks", () => {
  it("drops only completed task lines, keeping prose and other states", () => {
    const note = "## Section\n- [ ] a\n- [x] b\n- [~] c\n- [-] d\n- [x] e";
    const { content, removed } = removeCompletedTasks(note);
    expect(removed).toBe(2);
    expect(content).toBe("## Section\n- [ ] a\n- [~] c\n- [-] d");
  });

  it("returns the content unchanged when there is nothing completed", () => {
    const note = "- [ ] a\n- [~] b";
    const result = removeCompletedTasks(note);
    expect(result.removed).toBe(0);
    expect(result.content).toBe(note);
  });
});
