import { describe, expect, it } from "vitest";

import { stripUnstorable } from "./runs";

/**
 * MIN-286 — THE NULL BYTE, AND WHAT IT COST.
 *
 * Postgres refuses `\u0000` in a string, `text` as `jsonb`: writing
 * ENTIRE part in `unsupported Unicode escape sequence`. Now everything an agent tour
 * writes comes from the model and its shell — the output of a command that
 * touches a binary, a log truncated in the middle of a character, the opencode event log
 * that carries them.
 *
 * What that cost, measured in production on 2026-08-12 (runs `66023558` and
 * `a8051d06`): no longer a single checkpoint save — therefore no more heartbeat —, an end-of-turn report also refused, a frozen thread “in progress”
 * on the last gesture of the agent, and the watchdog which ends up putting the
 * run into “the process has stopped”. One byte.
 */
describe("ce qui ne peut pas entrer en base", () => {
  it("retire l'octet nul d'une chaîne, sans toucher au reste", () => {
    expect(stripUnstorable("sortie\u0000 de commande")).toBe("sortie de commande");
    expect(stripUnstorable("rien à retirer — même les accents")).toBe(
      "rien à retirer — même les accents",
    );
  });

  it("descend dans les objets et les tableaux — le journal d'opencode en est un", () => {
    const checkpoint = {
      messages: [],
      opencode: {
        sessionId: "ses_1",
        events: [{ type: "message.part.updated", data: { text: "cat bin\u0000aire" } }],
        seq: { ses_1: 12 },
      },
    };
    expect(stripUnstorable(checkpoint)).toEqual({
      messages: [],
      opencode: {
        sessionId: "ses_1",
        events: [{ type: "message.part.updated", data: { text: "cat binaire" } }],
        seq: { ses_1: 12 },
      },
    });
  });

  it("retire un demi-caractère isolé, que `JSON` accepte et que Postgres refuse", () => {
    expect(stripUnstorable("coupé au milieu \uD83D")).toBe("coupé au milieu ");
    // …and leaves the pair whole, which is a real character.
    expect(stripUnstorable("un emoji 🙂 entier")).toBe("un emoji 🙂 entier");
  });

  it("garde les nombres, les booléens et les nuls tels quels", () => {
    expect(stripUnstorable({ a: 1, b: true, c: null, d: undefined })).toEqual({
      a: 1,
      b: true,
      c: null,
      d: undefined,
    });
  });

  it("n'a pas de mémoire d'un appel à l'autre", () => {
    // The regex is global: probing it with `test` before replacing would leave
    // `lastIndex` in the air and would skip every other byte of a string
    // the other. Two calls in a row should return the same thing.
    expect(stripUnstorable("a\u0000b\u0000c")).toBe("abc");
    expect(stripUnstorable("a\u0000b\u0000c")).toBe("abc");
  });
});
