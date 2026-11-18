// Numo once answered "create a ticket to check PostgreSQL 17.12 in production
// (follow-up of MIN-986)" by searching for that ticket, then said it could not
// find it (MIN-1018). The prompt told it to resolve every issue the user names
// before acting; these checks keep the creation path direct.
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { buildGlobalSystemPrompt, buildSystemPrompt } = await import("./prompt");
const { NUMO_TOOL_NAMES } = await import("./tool-policy");
const { ASSISTANT_TOOLS } = await import("./tools");

const ALL_TOOLS: ReadonlySet<string> = new Set(NUMO_TOOL_NAMES);

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

const description = (name: string) =>
  ASSISTANT_TOOLS.find((tool) => tool.function.name === name)?.function.description ?? "";

describe("Numo acts on the action a request asks for (MIN-1018)", () => {
  for (const [surface, prompt] of [
    ["project", buildSystemPrompt(project, "en", ALL_TOOLS)],
    ["global", buildGlobalSystemPrompt("en", ALL_TOOLS)],
  ] as const) {
    it(`tells the ${surface} prompt to create an issue directly when asked`, () => {
      const rule = prompt.slice(prompt.indexOf("- **Act on what the user asks**"));
      expect(rule.length).toBeGreaterThan(0);
      expect(rule).toMatch(/create_issue now/);
      // A referenced issue is background for the new one, not the thing to find.
      expect(rule).toMatch(/context for the new issue/);
      expect(rule).toMatch(/check for\s+duplicates/);
    });

    it(`limits the ${surface} prompt's lookups to records the action needs`, () => {
      expect(prompt).toMatch(/when the action needs a record that already exists/);
      expect(prompt).not.toMatch(/when the user references an issue, member/);
    });
  }

  it("separates creating an issue from searching for one in the tool descriptions", () => {
    expect(description("create_issue")).toMatch(/do NOT search for it first/);
    expect(description("search_issues")).toMatch(/Not a step before create_issue/);
  });
});
