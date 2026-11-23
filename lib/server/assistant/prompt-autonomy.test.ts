// Numo once answered "translate the objective description into English" with
// the translation and "tell me if you want it to replace the description",
// changing nothing (MIN-1028). These checks keep the rules that make it act
// directly, reserve confirmations for destructive or bulk changes, and route
// its questions to where the user will see them.
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { buildGlobalSystemPrompt, buildSystemPrompt } = await import("./prompt");
const { NUMO_TOOL_NAMES } = await import("./tool-policy");

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

function section(prompt: string, start: string, end: string): string {
  const from = prompt.indexOf(start);
  expect(from).toBeGreaterThanOrEqual(0);
  const to = prompt.indexOf(end, from + start.length);
  return prompt.slice(from, to === -1 ? undefined : to);
}

describe("Numo acts without asking for confirmation (MIN-1028)", () => {
  for (const [surface, prompt] of [
    ["project", buildSystemPrompt(project, "en", ALL_TOOLS)],
    ["global", buildGlobalSystemPrompt("en", ALL_TOOLS)],
  ] as const) {
    it(`tells the ${surface} prompt to apply a requested change to the record`, () => {
      const rule = section(prompt, "- **You are autonomous", "- **What still needs");
      expect(rule).toMatch(/make it on the record/);
      expect(rule).toMatch(/not into your reply/);
      expect(rule).toMatch(/Never stop\s+at a draft/);
      expect(rule).toMatch(/pick the most reasonable option, do it, and state that choice/);
    });

    it(`limits the ${surface} prompt's confirmations to destructive or bulk changes`, () => {
      const rule = section(prompt, "- **What still needs a confirmation", "\n- ");
      for (const change of ["bulk edits", "canceling issues", "the trash", "merging a pull request"]) {
        expect(rule).toContain(change);
      }
      expect(rule).toMatch(/Everything else runs directly/);
    });

    it(`routes the ${surface} prompt's questions to a tool the user is notified by`, () => {
      const rules = section(prompt, "## Asking clarifying questions", "## Product knowledge");
      expect(rules).toMatch(/never with a question at the end of your reply/);
      expect(rules).toMatch(/notifies the user in their inbox/);
      expect(rules).toMatch(/notify_me note/);
      expect(prompt).toMatch(/a question only they can answer \(a routine cannot use\s+ask_user/);
    });
  }
});
