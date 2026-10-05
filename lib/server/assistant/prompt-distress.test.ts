import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { buildSystemPrompt, buildGlobalSystemPrompt } = await import("./prompt");

/**
 * MIN-296 — what to do in the face of distress, on ALL surfaces
 * where Numo responds to someone.
 *
 * The subject of the test is the list, not the text: the instruction lives in a single
 * block, and the risk is not that we rewrite it badly — it means that a new
 * surface arrives one day without it. The feedback board is the most exposed:
 * the person opposite does not have an account, and this is the only place where Numo speaks
 * to someone who is not on the team.
 *
 * The @Numo comment surfaces (issue, objective, page and feedback comments) no
 * longer build a prompt of their own: they share the conversation runtime
 * (comment-agent → startNumoIntent → executeNumoTurn), which assembles
 * buildSystemPrompt / buildGlobalSystemPrompt below. The two chat builders are
 * therefore the surfaces to pin.
 */

const project = {
  id: "p1",
  name: "Minddy",
  key: "MIND",
  statusCounts: { todo: 1 },
  recentIssues: [],
  members: [],
  objectives: [],
  categories: [],
};

const surfaces: Record<string, string> = {
  "chat de projet": buildSystemPrompt(project, "fr"),
  "chat global": buildGlobalSystemPrompt("fr"),
};

describe("how to respond to distress", () => {
  for (const [surface, prompt] of Object.entries(surfaces)) {
    it(`is in the assembled prompt for ${surface}`, () => {
      expect(prompt).toContain("distress or self-harm");
      // Resources, which are the only useful thing in the whole block.
      expect(prompt).toContain("3114");
      expect(prompt).toContain("988");
      expect(prompt).toContain("findahelpline.com");
      // And the instruction that decides: we put down the tool.
      expect(prompt).toContain("STOP the task");
    });
  }
});

describe("messages du chat Numo", () => {
  for (const [surface, prompt] of Object.entries(surfaces)) {
    it(`treats every user message as a direct request in ${surface}`, () => {
      expect(prompt).toContain("direct message from the person currently talking to");
      expect(prompt).toContain("not a task-notebook note");
      expect(prompt).toContain("asks to use it");
    });
  }
});
