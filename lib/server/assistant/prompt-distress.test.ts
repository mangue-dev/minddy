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
 * MIN-296 — la conduite à tenir face à de la détresse, sur TOUTES les surfaces
 * où Numo répond à quelqu'un.
 *
 * Le sujet du test est la liste, pas le texte : la consigne vit dans un seul
 * bloc, et le risque n'est pas qu'on le réécrive mal — c'est qu'une sixième
 * surface arrive un jour sans lui. Le board de feedback est la plus exposée :
 * la personne en face n'a pas de compte, et c'est le seul endroit où Numo parle
 * à quelqu'un qui n'est pas de l'équipe.
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

describe("conduite à tenir face à la détresse", () => {
  for (const [surface, prompt] of Object.entries(surfaces)) {
    it(`est dans le prompt assemblé du ${surface}`, () => {
      expect(prompt).toContain("distress or self-harm");
      // Les ressources, qui sont la seule chose utile de tout le bloc.
      expect(prompt).toContain("3114");
      expect(prompt).toContain("988");
      expect(prompt).toContain("findahelpline.com");
      // Et la consigne qui tranche : on pose l'outil.
      expect(prompt).toContain("STOP the task");
    });
  }
});

describe("messages du chat Numo", () => {
  for (const [surface, prompt] of Object.entries({
    "chat de projet": surfaces["chat de projet"],
    "chat global": surfaces["chat global"],
  })) {
    it(`traite chaque message utilisateur comme une demande directe dans le ${surface}`, () => {
      expect(prompt).toContain("direct message from the person currently talking to");
      expect(prompt).toContain("not a task-notebook note");
      expect(prompt).toContain("asks to use it");
    });
  }
});
