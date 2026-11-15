// A tool family's rules reach the model only in a turn that offers the
// family (MIN-996): a mention or a routine is not told how to set reminders
// it cannot set, and a turn without web search is not told to search.
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { buildGlobalSystemPrompt, buildSharedRules, buildSystemPrompt } = await import("./prompt");
const { NUMO_TOOL_NAMES } = await import("./tool-policy");

const FAMILIES = {
  routines: {
    heading: "- **Routines (",
    tools: ["create_routine", "list_routines", "update_routine", "list_routine_runs", "read_routine_occurrence"],
  },
  reminders: { heading: "- **Reminders (", tools: ["create_watch", "list_watches", "update_watch", "cancel_watch"] },
  journal: { heading: "- **Your journal (", tools: ["journal_write", "journal_close"] },
  webSearch: { heading: "- **Web search (", tools: ["web_search"] },
} as const;

const ALL_TOOLS: ReadonlySet<string> = new Set(NUMO_TOOL_NAMES);

function without(names: readonly string[]): ReadonlySet<string> {
  return new Set([...ALL_TOOLS].filter((name) => !names.includes(name)));
}

const project = {
  id: "p1",
  name: "Minddy",
  key: "MIND",
  statusCounts: {},
  recentIssues: [],
  members: [],
  objectives: [],
  categories: [],
};

describe("tool-family rules in Numo's prompt", () => {
  for (const [family, { heading, tools }] of Object.entries(FAMILIES)) {
    it(`gives the ${family} rules when the turn offers them`, () => {
      expect(buildSharedRules("en", ALL_TOOLS)).toContain(heading);
    });

    it(`leaves the ${family} rules out when none of their tools is offered`, () => {
      const rules = buildSharedRules("en", without(tools));
      expect(rules).not.toContain(heading);
      // The neighbouring rules stay, without a gap where the block was.
      expect(rules).toContain("- **Notes to the user (notify_me)**");
      expect(rules).not.toMatch(/\n\s*\n- \*\*(Notes to the user|Pull requests|MCP connections)/);
    });
  }

  it("keeps a family's rules while one of its tools is still offered", () => {
    // A reminder's own turn may list reminders but not change them.
    const rules = buildSharedRules("en", without(["create_watch", "update_watch", "cancel_watch"]));
    expect(rules).toContain(FAMILIES.reminders.heading);
  });

  it("applies to the project and the global prompt alike", () => {
    const offered = without(FAMILIES.reminders.tools);
    expect(buildSystemPrompt(project, "en", offered)).not.toContain(FAMILIES.reminders.heading);
    expect(buildGlobalSystemPrompt("en", offered)).not.toContain(FAMILIES.reminders.heading);
    expect(buildSystemPrompt(project, "en", ALL_TOOLS)).toContain(FAMILIES.reminders.heading);
  });
});
