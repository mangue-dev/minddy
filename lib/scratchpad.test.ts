import { describe, expect, it } from "vitest";
import { splitScratchpadSections } from "@/lib/scratchpad";
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
