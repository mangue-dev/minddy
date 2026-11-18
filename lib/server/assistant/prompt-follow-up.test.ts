// Asked to follow MIN-1017 and close a journal entry once it was done, Numo
// answered that it could not follow an issue over time (MIN-1019): the
// reminder tools are deferred, and nothing it had read said a reminder
// watches an issue. The follow-up rule is given whenever create_watch can be
// loaded, and the catalog says what reminders watch.
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { buildGlobalSystemPrompt, buildSharedRules, buildSystemPrompt } = await import("./prompt");
const { NUMO_TOOL_NAMES } = await import("./tool-policy");
const { CORE_TOOL_NAMES, TOOL_FAMILIES } = await import("./tool-loading");

const RULE = "- **Following something over time**";
const ALL_TOOLS: ReadonlySet<string> = new Set(NUMO_TOOL_NAMES);
const CORE: ReadonlySet<string> = new Set(CORE_TOOL_NAMES);
const REMINDER_TOOLS = ["create_watch", "list_watches", "update_watch", "cancel_watch"];

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

describe("following something over time (MIN-1019)", () => {
  it("is a deferred family, so the rule cannot wait for the tools to load", () => {
    expect(CORE.has("create_watch")).toBe(false);
  });

  it("is given when create_watch can be loaded but is not loaded yet", () => {
    const rules = buildSharedRules("en", CORE, undefined, ALL_TOOLS);
    expect(rules).toContain(RULE);
    // The reminder family's own rules still wait for search_tools.
    expect(rules).not.toContain("- **Reminders (");
    expect(buildSystemPrompt(project, "en", CORE, undefined, ALL_TOOLS)).toContain(RULE);
    expect(buildGlobalSystemPrompt("en", CORE, undefined, ALL_TOOLS)).toContain(RULE);
  });

  it("is left out where reminders are hidden (routines, mentions, a reminder's turn)", () => {
    const pool = new Set([...ALL_TOOLS].filter((name) => !REMINDER_TOOLS.includes(name)));
    expect(buildSharedRules("en", CORE, undefined, pool)).not.toContain(RULE);
  });

  it("names the four mechanisms it chooses between", () => {
    const rules = buildSharedRules("en", ALL_TOOLS);
    const rule = rules.slice(rules.indexOf(RULE), rules.indexOf("\n- **", rules.indexOf(RULE) + 1));
    expect(rule).toMatch(/one-off reminder/);
    expect(rule).toMatch(/recurring reminder/);
    expect(rule).toMatch(/routine/);
    expect(rule).toMatch(/issue with a recurrence/);
    expect(rule).toMatch(/never answer that you cannot follow/);
  });

  it("describes in the catalog what a reminder watches", () => {
    const reminders = TOOL_FAMILIES.find((family) => family.name === "Reminders");
    expect(reminders?.summary).toMatch(/issue reaching a status/);
    expect(reminders?.summary).toMatch(/new comment on an issue/);
    expect(reminders?.summary).toMatch(/objective reaching a status/);
  });
});
