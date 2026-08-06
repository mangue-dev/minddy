import { describe, expect, it } from "vitest";
import { applyContextSelection, contextChips } from "./assistant-context";
import type { AssistantPageContext } from "./assistant-types";

/**
 * Le contexte de Numo vu comme des pilules, et le chemin INVERSE : éteindre
 * l'œil d'une pilule doit retirer du contexte envoyé exactement les champs
 * qu'elle représentait.
 *
 * C'est ce retour qui se casse en silence. Ajouter une nature de contexte
 * demande deux gestes — la pilule, et son entrée dans la table des champs — et
 * n'en faire qu'un ne lève rien : la pilule s'éteint à l'écran, le message
 * persiste « Numo n'a pas vu ça », et Numo l'a pourtant reçu. D'où le dernier
 * test, qui vaut pour toute nature ajoutée après celle-ci.
 */

// Le vrai traducteur n'apporte rien ici : ce qui se vérifie est le CHEMIN d'un
// champ jusqu'à sa pilule, pas la phrase écrite dessus.
const t = ((key: string) => key) as unknown as Parameters<
  typeof contextChips
>[1]["t"];

/** Un contexte qui porte UNE pilule de chaque nature ambiante. */
const everything: AssistantPageContext = {
  projectId: "p1",
  issueId: "i1",
  issueIdentifier: "MIN-42",
  issueTitle: "Un ticket",
  objectiveId: "o1",
  objectiveName: "Un objectif",
  feedbackId: "f1",
  feedbackTitle: "Un retour",
  routineId: "r1",
  routineTitle: "Audit sécurité",
  viewId: "v1",
  viewName: "Une vue",
  cycleId: "c1",
  cycleLabel: "6–19 juil",
};

describe("contextChips — la routine", () => {
  it("porte le titre de la routine ouverte", () => {
    const chips = contextChips(
      { projectId: "p1", routineId: "r1", routineTitle: "Audit sécurité" },
      { t },
    );
    const routine = chips.find((c) => c.key === "routine");
    expect(routine).toMatchObject({ kind: "routine", label: "Audit sécurité" });
  });

  it("retombe sur un libellé générique quand le titre manque", () => {
    const chips = contextChips({ routineId: "r1" }, { t });
    expect(chips.find((c) => c.key === "routine")?.label).toBe("contextRoutine");
  });

  it("n'existe pas sans routine ouverte", () => {
    const chips = contextChips({ projectId: "p1" }, { t });
    expect(chips.some((c) => c.key === "routine")).toBe(false);
  });
});

describe("applyContextSelection — ce que l'œil éteint retire", () => {
  it("retire l'id ET le titre de la routine", () => {
    const sent = applyContextSelection(everything, new Set(["routine"]));
    expect(sent?.routineId).toBeUndefined();
    expect(sent?.routineTitle).toBeUndefined();
    // Le reste ne bouge pas : une pilule éteinte n'en éteint pas d'autres.
    expect(sent?.feedbackId).toBe("f1");
    expect(sent?.issueId).toBe("i1");
  });

  it("garde la routine tant que sa pilule est allumée", () => {
    const sent = applyContextSelection(everything, new Set(["feedback"]));
    expect(sent?.routineId).toBe("r1");
  });

  /**
   * Le garde-fou : CHAQUE pilule ambiante doit avoir de quoi s'éteindre. Une
   * nature ajoutée sans son entrée dans la table passerait tous les tests
   * ci-dessus et échouerait ici.
   */
  it("éteint réellement chacune des pilules d'un contexte complet", () => {
    for (const chip of contextChips(everything, { t })) {
      const sent = applyContextSelection(everything, new Set([chip.key]));
      const before = Object.keys(everything).length;
      const after = Object.keys(sent ?? {}).filter(
        (k) => (sent as Record<string, unknown>)[k] !== undefined,
      ).length;
      expect(
        after,
        `la pilule « ${chip.key} » ne retire aucun champ du contexte envoyé`,
      ).toBeLessThan(before);
    }
  });
});
