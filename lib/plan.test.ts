import { describe, expect, it } from "vitest";
import { parsePlan, planProgress } from "./plan";

/** Raccourci de lecture : "texte" → question ? pour chaque tâche. */
const questionFlags = (plan: string) =>
  parsePlan(plan).tasks.map((t) => [t.text, t.question] as const);

describe("sections de questions", () => {
  it("sort les questions du compteur sans toucher aux indices des tâches", () => {
    const plan = `# Contexte

- [x] Ajouter le handler dans app/api/foo/route.ts
- [ ] Brancher le formulaire

## Questions ouvertes

- [ ] On garde l'ancien endpoint ?
- [ ] Quelle limite de taille ?`;

    // 1/2, pas 1/4 : les deux questions ne sont pas du travail.
    expect(planProgress(plan)).toEqual({ done: 1, total: 2 });
    // Les questions restent des tâches, aux mêmes indices (le MCP les cible
    // par index : minddy_update_plan_task ne doit pas se décaler).
    expect(parsePlan(plan).tasks.map((t) => t.index)).toEqual([0, 1, 2, 3]);
    expect(questionFlags(plan)).toEqual([
      ["Ajouter le handler dans app/api/foo/route.ts", false],
      ["Brancher le formulaire", false],
      ["On garde l'ancien endpoint ?", true],
      ["Quelle limite de taille ?", true],
    ]);
  });

  it("ferme la section sur un titre de rang égal ou supérieur", () => {
    expect(
      questionFlags(`## Questions

- [ ] q1

## Implémentation

- [ ] t1`)
    ).toEqual([
      ["q1", true],
      ["t1", false],
    ]);

    expect(
      questionFlags(`## Questions

- [ ] q1

# Suite

- [ ] t1`)
    ).toEqual([
      ["q1", true],
      ["t1", false],
    ]);
  });

  it("garde les sous-titres plus profonds dans la section", () => {
    expect(
      questionFlags(`## Questions

### Périmètre

- [ ] q1`)
    ).toEqual([["q1", true]]);
  });

  it("reconnaît les intitulés FR et EN", () => {
    for (const heading of [
      "## Questions",
      "## Open questions",
      "## Questions ouvertes",
      "## Question pour toi",
      "#### Remaining questions",
    ]) {
      expect(questionFlags(`${heading}\n\n- [ ] q1`)).toEqual([["q1", true]]);
    }
  });

  it("ignore un titre à l'intérieur d'un bloc de code", () => {
    expect(
      questionFlags(`\`\`\`md
## Questions
\`\`\`

- [ ] t1`)
    ).toEqual([["t1", false]]);
  });

  it("renvoie 0/0 pour un plan qui n'est que des questions", () => {
    expect(planProgress("## Questions\n\n- [ ] q1\n- [ ] q2")).toEqual({
      done: 0,
      total: 0,
    });
  });

  it("laisse un plan sans section de questions inchangé", () => {
    const plan = "- [x] t1\n- [ ] t2\n- [-] t3";
    expect(planProgress(plan)).toEqual({ done: 1, total: 2 });
    expect(parsePlan(plan).tasks.every((t) => !t.question)).toBe(true);
  });
});
