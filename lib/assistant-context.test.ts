import { describe, expect, it } from "vitest";
import { applyContextSelection, contextChips } from "./assistant-context";
import type { AssistantPageContext } from "./assistant-types";

/**
 * Numo's context seen as pills, and the REVERSE path: turn off
 * the eye of a pill must remove from the sent context exactly the fields
 * that it represented.
 *
 * It is this return that breaks silently. Adding a context nature
 * requires two gestures - the pill, and its entry in the field table - and
 * doing only one does nothing: the pill goes out on the screen, the message
 * persists "Numo didn't see that", and Numo nevertheless received it. Hence the last
 * test, which is valid for any nature added after this one.
 */

// The real translator brings nothing here: what is verified is the PATH of a
// field down to his pill, not the sentence written on it.
const t = ((key: string) => key) as unknown as Parameters<
  typeof contextChips
>[1]["t"];

/** A context that carries ONE pill of each ambient nature. */
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

  it("falls back to a generic label when the title is missing", () => {
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
    // The rest does not change: one extinguished pill does not extinguish others.
    expect(sent?.feedbackId).toBe("f1");
    expect(sent?.issueId).toBe("i1");
  });

  it("keeps the routine while its pill is lit", () => {
    const sent = applyContextSelection(everything, new Set(["feedback"]));
    expect(sent?.routineId).toBe("r1");
  });

  /**
 * The safeguard: EACH ambient pill must have something to extinguish. A
 * nature added without its entry in the table would pass all the
 * tests above and fail here.
 */
  it("actually turns off each pill in a complete context", () => {
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
