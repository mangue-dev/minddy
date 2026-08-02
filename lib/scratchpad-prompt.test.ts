import { describe, expect, it } from "vitest";
import {
  buildScratchpadPrompt,
  sectionHeadingChain,
  splitTaskSection,
} from "@/lib/scratchpad-prompt";
import { SPACER_LINE } from "@/lib/scratchpad";

describe("sectionHeadingChain", () => {
  it("carries the sections that CONTAIN the task, widest first", () => {
    expect(
      sectionHeadingChain([
        { level: 1, text: "Pull requests" },
        { level: 2, text: "Sidebar" },
      ])
    ).toEqual(["# Pull requests", "## Sidebar"]);
  });

  it("skips the siblings a task does not live in", () => {
    expect(
      sectionHeadingChain([
        { level: 1, text: "Pull requests" },
        { level: 2, text: "Sidebar" },
        { level: 3, text: "Détail" }, // fermée par la suivante
        { level: 2, text: "MCP et Numo" },
      ])
    ).toEqual(["# Pull requests", "## MCP et Numo"]);
    // Une section de premier rang plus loin dans la note ferme la précédente.
    expect(
      sectionHeadingChain([
        { level: 1, text: "Pull requests" },
        { level: 2, text: "Sidebar" },
        { level: 1, text: "Carnet" },
      ])
    ).toEqual(["# Carnet"]);
  });

  it("gives nothing before the first heading", () => {
    expect(sectionHeadingChain([])).toEqual([]);
  });

  it("does not name an empty heading, but still lets it close its rank", () => {
    expect(
      sectionHeadingChain([
        { level: 1, text: "Pull requests" },
        { level: 2, text: "   " },
      ])
    ).toEqual(["# Pull requests"]);
    expect(
      sectionHeadingChain([
        { level: 1, text: "Pull requests" },
        { level: 1, text: "" },
      ])
    ).toEqual([]);
  });
});

describe("splitTaskSection", () => {
  it("pulls the section out of a task carried with its heading", () => {
    expect(splitTaskSection("## Deploy\n\n- [~] restart the cron")).toEqual({
      section: "Deploy",
      body: "- [~] restart the cron",
      isTask: true,
    });
  });

  it("accepts any heading level and the four markers", () => {
    for (const marker of ["[ ]", "[~]", "[x]", "[-]"]) {
      expect(splitTaskSection(`#### Ideas\n- ${marker} ship it`).section).toBe(
        "Ideas"
      );
    }
    expect(splitTaskSection("# A\n- [ ] x").section).toBe("A");
  });

  it("names the whole chain of sections a task was carried with", () => {
    expect(
      splitTaskSection("# Pull requests\n\n## Sidebar\n\n- [ ] restyle the select")
    ).toEqual({
      section: "Pull requests > Sidebar",
      body: "- [ ] restyle the select",
      isTask: true,
    });
  });

  it("keeps titles that do not nest as a real section", () => {
    const siblings = "## Deploy\n\n## Ideas\n\n- [ ] a";
    expect(splitTaskSection(siblings)).toEqual({
      section: null,
      body: siblings,
      isTask: false,
    });
  });

  it("flags a lone task line as a task, without a section", () => {
    expect(splitTaskSection("- [ ] restart the cron")).toEqual({
      section: null,
      body: "- [ ] restart the cron",
      isTask: true,
    });
  });

  it("leaves a real section (prose or several tasks) untouched", () => {
    const prose = "## Deploy\nthe cron died again\n- [ ] restart it";
    expect(splitTaskSection(prose)).toEqual({
      section: null,
      body: prose,
      isTask: false,
    });
    const many = "## Deploy\n- [ ] a\n- [ ] b";
    expect(splitTaskSection(many)).toEqual({
      section: null,
      body: many,
      isTask: false,
    });
  });

  it("leaves a whole note and an empty note untouched", () => {
    const note = "- [ ] a\n\n## Deploy\n- [ ] b";
    expect(splitTaskSection(note)).toEqual({
      section: null,
      body: note,
      isTask: false,
    });
    expect(splitTaskSection("")).toEqual({ section: null, body: "", isTask: false });
  });
});

describe("buildScratchpadPrompt", () => {
  it("names the section of a task and keeps <notes> to the task alone", () => {
    const prompt = buildScratchpadPrompt("## Deploy\n\n- [~] restart the cron", {
      section: true,
    });
    expect(prompt).toContain("Work through the following task from my working notes.");
    expect(prompt).toContain("<notes>\n- [~] restart the cron\n</notes>");
    expect(prompt).toContain('This task is from the section named "Deploy".');
  });

  it("names a nested section by its full path, so it is nameable at all", () => {
    const prompt = buildScratchpadPrompt(
      "# Pull requests\n\n## Sidebar\n\n- [ ] restyle the select",
      { section: true }
    );
    expect(prompt).toContain("<notes>\n- [ ] restyle the select\n</notes>");
    expect(prompt).toContain(
      'This task is from the section named "Pull requests > Sidebar".'
    );
  });

  it("says nothing about a section for a task that has none", () => {
    const prompt = buildScratchpadPrompt("- [ ] restart the cron", { section: true });
    expect(prompt).toContain("Work through the following task from my working notes.");
    expect(prompt).not.toContain("section named");
    expect(prompt).toContain("<notes>\n- [ ] restart the cron\n</notes>\n\nThese are rough");
  });

  it("gives the agent (no MCP block) the same wording as the copied prompt", () => {
    const note = "## Deploy\n\n- [~] restart the cron";
    const copied = buildScratchpadPrompt(note, { section: true });
    const agent = buildScratchpadPrompt(note, { mcp: false });
    expect(agent).toBe(copied.slice(0, agent.length));
    expect(agent).toContain('This task is from the section named "Deploy".');
    expect(agent).not.toContain("minddy_get_scratchpad");
  });

  it("still frames a real section and the whole note as before", () => {
    const section = buildScratchpadPrompt("## Deploy\n- [ ] a\n- [ ] b", {
      section: true,
    });
    expect(section).toContain("Work through the following section of my working notes.");
    expect(section).toContain("<notes>\n## Deploy\n- [ ] a\n- [ ] b\n</notes>");
    expect(buildScratchpadPrompt("- [ ] a\n- [ ] b")).toContain(
      "Work through my working notes below."
    );
  });

  it("drops the editor's invisible spacers before splitting", () => {
    const prompt = buildScratchpadPrompt(
      `## Deploy\n${SPACER_LINE}\n- [ ] restart the cron`,
      { section: true }
    );
    expect(prompt).toContain('This task is from the section named "Deploy".');
    expect(prompt).not.toContain(SPACER_LINE);
  });
});
