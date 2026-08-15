import { describe, expect, it } from "vitest";

import { quitDecision, quitLogNote, quitPrompt } from "./quit-guard";

/**
 * MIN-293 — ⌘Q PENDANT QU'UN TOUR TOURNE.
 *
 * Le geste existait déjà et ne demandait rien ; ce lot en fait la principale
 * cause de perte d'un tour. Ce qui est tenu ici : on ne demande QUE quand ça
 * compte, on n'offre jamais « laisser tourner », le bouton sûr est le défaut, et
 * la boîte dit où la session repart.
 */

describe("quitPrompt", () => {
  it("ne demande RIEN quand aucun tour ne tourne", () => {
    // Une boîte à chaque ⌘Q est une boîte qu'on apprend à cliquer sans lire — et
    // le jour où elle compte, elle ne compte plus.
    expect(quitPrompt([])).toBeNull();
  });

  it("nomme le tour quand on en a le nom", () => {
    const prompt = quitPrompt([{ runId: "r1", label: "MIN-293" }]);
    expect(prompt?.message).toContain("MIN-293");
  });

  it("reste lisible sans nom", () => {
    const prompt = quitPrompt([{ runId: "r1" }]);
    expect(prompt?.message).toContain("agent turn");
    expect(prompt?.message).not.toContain("undefined");
  });

  it("compte les tours quand il y en a plusieurs", () => {
    const prompt = quitPrompt([{ runId: "r1" }, { runId: "r2" }, { runId: "r3" }]);
    expect(prompt?.message).toContain("3 agent turns");
  });

  it("n'offre JAMAIS de laisser tourner — deux boutons, et le second reste", () => {
    // Un harness détaché garderait vivants un token de forge en écriture et une
    // clé de modèle, sans plus aucune interface pour les arrêter.
    const prompt = quitPrompt([{ runId: "r1" }])!;
    expect(prompt.buttons).toHaveLength(2);
    expect(prompt.buttons.join(" ").toLowerCase()).not.toMatch(/background|keep running|detach/);
    expect(prompt.buttons[0]).toMatch(/quit/i);
  });

  it("met le bouton SÛR par défaut, et le donne aussi à Échap", () => {
    const prompt = quitPrompt([{ runId: "r1" }])!;
    expect(prompt.defaultId).toBe(1);
    expect(prompt.cancelId).toBe(1);
    expect(quitDecision(prompt.defaultId)).toBe("stay");
  });

  it("dit où la session repart — sans quoi on annule un ⌘Q légitime par peur", () => {
    const prompt = quitPrompt([{ runId: "r1" }])!;
    expect(prompt.detail).toMatch(/saved/i);
    expect(prompt.detail).toMatch(/carry on/i);
    // Et pourquoi le tour ne peut pas continuer sans l'app.
    expect(prompt.detail).toMatch(/token/i);
  });
});

describe("quitDecision", () => {
  it("ne quitte que sur le premier bouton", () => {
    expect(quitDecision(0)).toBe("quit");
    expect(quitDecision(1)).toBe("stay");
  });

  it("reste sur tout le reste — boîte fermée par le système, index hors bornes", () => {
    for (const response of [-1, 2, 42, Number.NaN]) {
      expect(quitDecision(response)).toBe("stay");
    }
  });
});

describe("quitLogNote", () => {
  it("distingue « quelqu'un a quitté » de « le harness a planté »", () => {
    expect(quitLogNote()).toMatch(/quit/i);
    expect(quitLogNote()).toMatch(/last save/i);
  });
});
