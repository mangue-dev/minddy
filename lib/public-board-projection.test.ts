import { describe, expect, it } from "vitest";
import {
  publicCategoriesFor,
  publicObjectivesFor,
  toPublicIssue,
} from "@/lib/public-board-projection";
import type { Category, Issue, Objective } from "@/lib/types";

/**
 * MIN-342 — la vue partagée sérialise dans son HTML tout ce qu'elle passe au
 * board client. Le test qui compte n'est donc pas « les bons champs sont là »
 * (n'importe quelle projection le dit) mais « RIEN d'autre n'est là » : c'est
 * la liste fermée qui est le garde-fou, et une colonne neuve sur `Issue` ne
 * doit pas s'y inviter en silence.
 */

function issue(over: Partial<Issue> = {}): Issue {
  return {
    id: "i1",
    project_id: "proj",
    number: 42,
    title: "Un ticket",
    description: "corps",
    plan: "- [x] une tâche secrète\n- [ ] une autre",
    status: "todo",
    priority: "high",
    effort: "m",
    assignee_id: "u1",
    objective_id: "obj-1",
    parent_id: null,
    duplicate_of_id: null,
    due_date: null,
    recurrence: null,
    recurrence_series_id: null,
    position: 1234,
    created_by: "u-secret",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    completed_at: null,
    cycle_id: "cycle-secret",
    category_ids: ["cat-1"],
    ...over,
  };
}

describe("toPublicIssue", () => {
  it("n'emporte que les champs qu'une carte affiche", () => {
    expect(Object.keys(toPublicIssue(issue())).sort()).toEqual([
      "assignee_id",
      "category_ids",
      "description",
      "due_date",
      "effort",
      "id",
      "integration_id",
      "number",
      "objective_id",
      "priority",
      "project_id",
      "recurrence",
      "remote_number",
      "remote_provider",
      "remote_url",
      "status",
      "title",
    ]);
  });

  it("laisse le plan, l'auteur, la position et le cycle au serveur", () => {
    const serialized = JSON.stringify(toPublicIssue(issue()));
    for (const leak of ["tâche secrète", "u-secret", "cycle-secret", "1234"]) {
      expect(serialized).not.toContain(leak);
    }
  });
});

const objectives: Objective[] = [
  {
    id: "obj-1",
    project_id: "proj",
    name: "Cité",
    description: "note interne",
    status: "in_progress",
    lead_user_id: "u1",
    target_date: "2026-03-01",
    color: "#fff",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  { ...{} as Objective, id: "obj-2", name: "Jamais affiché", color: null },
];

describe("publicObjectivesFor", () => {
  it("ne garde que les objectifs qu'une carte VISIBLE cite", () => {
    expect(publicObjectivesFor(objectives, [toPublicIssue(issue())])).toEqual([
      { id: "obj-1", name: "Cité", color: "#fff" },
    ]);
  });

  it("n'emporte ni la description, ni l'échéance, ni qui le porte", () => {
    const [projected] = publicObjectivesFor(objectives, [toPublicIssue(issue())]);
    expect(Object.keys(projected).sort()).toEqual(["color", "id", "name"]);
  });

  it("rend une liste vide quand aucun ticket n'en porte", () => {
    const orphan = toPublicIssue(issue({ objective_id: null }));
    expect(publicObjectivesFor(objectives, [orphan])).toEqual([]);
  });
});

describe("publicCategoriesFor", () => {
  const categories: Category[] = [
    { id: "cat-1", project_id: "proj", name: "Bug", color: "#f00", created_at: "x" },
    { id: "cat-2", project_id: "proj", name: "Inutilisée", color: "#0f0", created_at: "x" },
  ];

  it("ne garde que les catégories peintes par une carte, sans leur ligne complète", () => {
    expect(publicCategoriesFor(categories, [toPublicIssue(issue())])).toEqual([
      { id: "cat-1", name: "Bug", color: "#f00" },
    ]);
  });
});
