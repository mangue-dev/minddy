import { describe, expect, it } from "vitest";

import { localExecRequested } from "./local-exec";

/**
 * MIN-359 — le drapeau `localExec` arrive dans le corps d'un POST : c'est une
 * DEMANDE. Ces cas disent ce qui la transforme en fait, et surtout ce qui ne la
 * transforme pas. La règle qu'ils protègent, en une phrase : **un run dont le
 * contexte n'a pas été écrit par la personne qui lance ne part jamais sur sa
 * machine** — dans une microVM jetable, une injection de prompt coûte une VM ;
 * sur un Mac, c'est un shell.
 */
describe("localExecRequested", () => {
  const base = { triggeredBy: "button" } as const;

  it("laisse passer un lancement humain qui le demande", () => {
    expect(localExecRequested({ ...base, localExec: true })).toBe(true);
    expect(localExecRequested({ triggeredBy: "chat", localExec: true })).toBe(true);
  });

  it("ne l'invente jamais : sans demande, c'est le cloud", () => {
    expect(localExecRequested(base)).toBe(false);
    expect(localExecRequested({ ...base, localExec: false })).toBe(false);
  });

  it("refuse une ROUTINE, même déclenchée en apparence par un bouton", () => {
    expect(
      localExecRequested({ triggeredBy: "routine", localExec: true }),
    ).toBe(false);
    expect(
      localExecRequested({ ...base, localExec: true, routineId: "r-1" }),
    ).toBe(false);
  });

  it("refuse une étape de CHAÎNE d'automatisation", () => {
    expect(localExecRequested({ ...base, localExec: true, chainId: "c-1" })).toBe(false);
    expect(
      localExecRequested({ triggeredBy: "automation", localExec: true }),
    ).toBe(false);
  });

  it("refuse une MENTION — elle peut venir d'un webhook de forge", () => {
    // Rien à cet endroit ne distingue une mention tapée dans minddy d'un
    // commentaire de pull request recopié par un webhook. Tant que la source
    // n'est pas portée jusqu'ici (MIN-360), le refus est le seul choix sûr.
    expect(localExecRequested({ triggeredBy: "mention", localExec: true })).toBe(false);
  });
});
