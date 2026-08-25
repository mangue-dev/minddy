import { describe, expect, it } from "vitest";

import { localExecRequested } from "./local-exec";

/**
 * MIN-359 — the `localExec` flag arrives in the body of a POST: it is a
 * REQUEST. These cases say what transforms it into a fact. Automated or
 * externally-triggered context never reaches the user's machine; issue context
 * additionally requires the explicit acknowledgement covered by MIN-439.
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
    // Nothing here distinguishes a mention typed in minddy from a
    // pull request comment copied by a webhook. As long as the source
    // is not carried so far (MIN-360), refusal is the only safe choice.
    expect(localExecRequested({ triggeredBy: "mention", localExec: true })).toBe(false);
  });
});
