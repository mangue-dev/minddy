import { describe, expect, it } from "vitest";
import { appendToPlan, parsePlan, planProgress } from "./plan";

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

  // MIN-146 : un titre de travail qui PARLE d'une question n'en ouvre pas une.
  // C'est un rôle, pas un mot-clé — sans quoi « La bascule (à écrire une fois la
  // question tranchée) » emportait silencieusement tout le reste du plan.
  it("n'ouvre pas de section sur un titre qui mentionne une question", () => {
    expect(
      questionFlags(`## La bascule (à écrire une fois la question tranchée)

- [ ] t1`)
    ).toEqual([["t1", false]]);
  });

  it("compte le plan de MIN-146 comme son auteur le lit", () => {
    const plan = `## Contexte

Prose.

## Questions tranchées

- [x] Quelle identité de service GitLab ?
- [x] Que faire des liaisons existantes ?

## 1. Le repli honnête

- [x] Dire dans l'UI sous quel compte Numo agit
- [x] Écrire la règle en tête de targetFromLink

## 2. La bascule (à écrire une fois la question tranchée)

- [ ] Stockage de l'identité de service

## 3. Vérification

- [x] i18n-contract + tsc verts
- [-] Run d'agent sur un projet GitLab`;

    // 3/4 : les deux décisions ne comptent pas, le run annulé non plus — mais le
    // stockage, si. C'est lui que le titre de la section 2 escamotait.
    expect(planProgress(plan)).toEqual({ done: 3, total: 4 });
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

describe("appendToPlan", () => {
  it("écrit le bloc tel quel quand le plan est vide", () => {
    expect(appendToPlan(null, "- [ ] t1")).toBe("- [ ] t1");
    expect(appendToPlan("   \n", "- [ ] t1\n- [ ] t2")).toBe(
      "- [ ] t1\n- [ ] t2"
    );
  });

  it("ne touche pas un octet de l'existant — états compris", () => {
    const plan = `## Contexte

Objectif : brancher l'invitation.

- [x] Écrire le handler
- [~] Brancher le formulaire`;

    const next = appendToPlan(plan, "- [ ] Valider l'email avant l'envoi");
    expect(next).toBe(`${plan}\n- [ ] Valider l'email avant l'envoi`);
    // Les tâches d'origine gardent leur état et leur index.
    expect(parsePlan(next!).tasks.map((t) => t.state)).toEqual([
      "completed",
      "in_progress",
      "pending",
    ]);
  });

  it("sépare d'une ligne vide sauf entre deux cases à cocher", () => {
    // Deux listes collées = une seule liste à l'écran.
    expect(appendToPlan("- [ ] t1", "- [ ] t2")).toBe("- [ ] t1\n- [ ] t2");
    // De la prose après des tâches a besoin de son paragraphe.
    expect(appendToPlan("- [ ] t1", "Vérification : `pnpm test`.")).toBe(
      "- [ ] t1\n\nVérification : `pnpm test`."
    );
    expect(appendToPlan("Contexte.", "- [ ] t1")).toBe("Contexte.\n\n- [ ] t1");
  });

  it("recolle le bloc sous la dernière ligne utile, pas sous les blancs de fin", () => {
    expect(appendToPlan("- [ ] t1\n\n\n", "- [ ] t2")).toBe(
      "- [ ] t1\n- [ ] t2"
    );
  });

  it("insère avant la section de questions, qui reste en dernier", () => {
    const plan = `- [ ] t1

## Questions

- [ ] On garde l'ancien endpoint ?`;

    const next = appendToPlan(plan, "- [ ] t2")!;
    expect(next).toBe(`- [ ] t1
- [ ] t2

## Questions

- [ ] On garde l'ancien endpoint ?`);
    // La tâche ajoutée est du travail, pas une question : elle compte.
    expect(planProgress(next)).toEqual({ done: 0, total: 2 });
  });

  it("insère à la fin de la section demandée, avant le titre suivant", () => {
    const plan = `## Backend

- [ ] Handler

## Frontend

- [ ] Formulaire`;

    expect(appendToPlan(plan, "- [ ] Migration", "Backend")).toBe(`## Backend

- [ ] Handler
- [ ] Migration

## Frontend

- [ ] Formulaire`);
  });

  it("vise une section sans se soucier de la casse, questions comprises", () => {
    const plan = "- [ ] t1\n\n## Questions\n\n- [ ] q1";
    expect(appendToPlan(plan, "- [ ] q2", "questions")).toBe(
      "- [ ] t1\n\n## Questions\n\n- [ ] q1\n- [ ] q2"
    );
  });

  it("renvoie null quand la section demandée n'existe pas", () => {
    expect(appendToPlan("- [ ] t1", "- [ ] t2", "Backend")).toBeNull();
    expect(appendToPlan("", "- [ ] t2", "Backend")).toBeNull();
  });

  it("ignore un titre à l'intérieur d'un bloc de code", () => {
    const plan = `- [ ] t1

\`\`\`md
## Questions
\`\`\``;

    // Le faux titre ne déplace pas l'insertion : le bloc va bien à la fin.
    expect(appendToPlan(plan, "- [ ] t2")).toBe(`${plan}\n\n- [ ] t2`);
  });

  it("laisse le plan intact pour un bloc vide", () => {
    expect(appendToPlan("- [ ] t1", "   \n\n")).toBe("- [ ] t1");
  });
});
