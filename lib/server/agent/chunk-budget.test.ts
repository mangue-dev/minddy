import { describe, expect, it } from "vitest";

import { AGENT_SOFT_DEADLINE_MS } from "@/lib/agent-models";
import {
  CHUNK_FLOOR_MS,
  COLD_SETUP_ALLOWANCE_MS,
  COMMIT_MARGIN_MS,
  MIN_CHUNK_BUDGET_MS,
  MIN_SOFT_DEADLINE_MS,
  chunkSoftDeadlineMs,
} from "./chunk-budget";

/**
 * MIN-213 — le seuil d'admission d'un chunk et le plancher que ce chunk s'accorde
 * disent la même chose et vivaient de part et d'autre d'une frontière de module.
 * `MIN_CHUNK_BUDGET_MS` valait 40 s dans `drain.ts` ; `MIN_SOFT_DEADLINE_MS +
 * COMMIT_MARGIN_MS` en valait 45 dans `execute.ts`, et ce plancher-là ne compte
 * même pas l'amorçage. Le drain admettait donc des chunks qui ne pouvaient pas
 * tenir : fonction tuée en plein push, run figé sur `running` vingt minutes, et deux
 * débordements de suite effaçaient la conversation.
 *
 * Ce test tient l'INVARIANT, pas les chiffres : un chunk admis au seuil exact doit
 * pouvoir payer son amorçage ET tenir son plancher. Bouger une des constantes reste
 * libre — les faire diverger, non.
 */

describe("seuil d'admission d'un chunk (MIN_CHUNK_BUDGET_MS)", () => {
  it("couvre le plancher du chunk PLUS son amorçage", () => {
    // L'invariant du ticket, en une ligne. Un `MIN_CHUNK_BUDGET_MS` reposé à la
    // main sous cette somme rouvre exactement le bug.
    expect(MIN_CHUNK_BUDGET_MS).toBe(CHUNK_FLOOR_MS + COLD_SETUP_ALLOWANCE_MS);
    expect(CHUNK_FLOOR_MS).toBe(MIN_SOFT_DEADLINE_MS + COMMIT_MARGIN_MS);
  });

  it("laisse à l'amorçage une part STRICTEMENT positive", () => {
    // Une indemnité à zéro ferait un seuil formellement dérivé et toujours faux :
    // le réveil de la microVM et le clone ne sont bornés par rien côté minddy.
    expect(COLD_SETUP_ALLOWANCE_MS).toBeGreaterThan(0);
    expect(MIN_CHUNK_BUDGET_MS).toBeGreaterThan(CHUNK_FLOOR_MS);
  });

  it("laisse un chunk admis au seuil finir son tour même après un amorçage complet", () => {
    // La simulation qui compte : le chunk part avec le budget minimum, l'amorçage
    // consomme TOUTE son indemnité, et il doit encore pouvoir jouer un round au
    // plancher puis commiter et pousser.
    const soft = chunkSoftDeadlineMs(MIN_CHUNK_BUDGET_MS, COLD_SETUP_ALLOWANCE_MS);
    expect(soft).toBe(MIN_SOFT_DEADLINE_MS);
    expect(soft + COMMIT_MARGIN_MS).toBeLessThanOrEqual(
      MIN_CHUNK_BUDGET_MS - COLD_SETUP_ALLOWANCE_MS,
    );
  });

  it("refuse la bande où le chunk déborderait (l'ancien 40 s en tête)", () => {
    for (const budget of [40_000, CHUNK_FLOOR_MS, MIN_CHUNK_BUDGET_MS - 1]) {
      expect(budget, `${budget} ms ne suffit pas à amorcer PUIS finir un chunk`).toBeLessThan(
        MIN_CHUNK_BUDGET_MS,
      );
    }
  });
});

describe("chunkSoftDeadlineMs", () => {
  it("rend le restant EXACT, marge de fin de tour déduite", () => {
    expect(chunkSoftDeadlineMs(300_000, 0)).toBe(300_000 - COMMIT_MARGIN_MS);
    expect(chunkSoftDeadlineMs(300_000, 50_000)).toBe(250_000 - COMMIT_MARGIN_MS);
  });

  it("ne descend jamais sous le plancher, et c'est CE plancher qui ment", () => {
    // Le mensonge est ici, et il est voulu : un chunk trop court se donne quand
    // même de quoi jouer un round. C'est pour ça que l'admission doit refuser en
    // AMONT — la boucle, elle, ne freinera pas.
    expect(chunkSoftDeadlineMs(10_000, 0)).toBe(MIN_SOFT_DEADLINE_MS);
    expect(chunkSoftDeadlineMs(300_000, 299_000)).toBe(MIN_SOFT_DEADLINE_MS);
  });

  it("reste plafonné par la config du run", () => {
    expect(chunkSoftDeadlineMs(AGENT_SOFT_DEADLINE_MS * 3, 0)).toBe(AGENT_SOFT_DEADLINE_MS);
  });
});
