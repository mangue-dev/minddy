import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  buildSystemPrompt,
  buildGlobalSystemPrompt,
  buildCommentSystemPrompt,
  buildObjectiveCommentSystemPrompt,
  buildFeedbackCommentSystemPrompt,
} = await import("./prompt");

/**
 * MIN-296 — what to do in the face of distress, on ALL surfaces
 * where Numo responds to someone.
 *
 * The subject of the test is the list, not the text: the instruction lives in a single
 * block, and the risk is not that we rewrite it badly — it means that a sixth
 * surface arrives one day without it. The feedback board is the most exposed:
 * the person opposite does not have an account, and this is the only place where Numo speaks
 * to someone who is not on the team.
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

const issue = {
  id: "i1",
  identifier: "MIND-1",
  title: "Titre",
  description: null,
  status: "todo",
  priority: "none",
  effort: null,
  assignee_id: null,
  objective_id: null,
  due_date: null,
  category_ids: [],
};

const objective = {
  id: "o1",
  name: "Objectif",
  description: null,
  status: "active",
  lead_user_id: null,
  target_date: null,
  issues: [],
};

const feedback = {
  id: "f1",
  title: "Une demande",
  body: null,
  status: "open",
  vote_count: 3,
  is_public: true,
  linked_issue: null,
};

const surfaces: Record<string, string> = {
  "chat de projet": buildSystemPrompt(project, "fr"),
  "chat global": buildGlobalSystemPrompt("fr"),
  "commentaire de ticket": buildCommentSystemPrompt({
    project,
    issue,
    thread: [],
    locale: "fr",
  }),
  "commentaire d'objectif": buildObjectiveCommentSystemPrompt({
    project,
    objective,
    thread: [],
    locale: "fr",
  }),
  "commentaire de feedback": buildFeedbackCommentSystemPrompt({
    project,
    feedback,
    thread: [],
    locale: "fr",
  }),
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
  for (const [surface, prompt] of Object.entries({
    "chat de projet": surfaces["chat de projet"],
    "chat global": surfaces["chat global"],
  })) {
    it(`treats every user message as a direct request in ${surface}`, () => {
      expect(prompt).toContain("direct message from the person currently talking to");
      expect(prompt).toContain("not a task-notebook note");
      expect(prompt).toContain("asks to use it");
    });
  }
});
