import { describe, expect, it } from "vitest";

import { stripUnstorable } from "./runs";

/**
 * MIN-286 — L'OCTET NUL, ET CE QU'IL COÛTAIT.
 *
 * Postgres refuse `\u0000` dans une chaîne, `text` comme `jsonb` : l'écriture
 * ENTIÈRE part en `unsupported Unicode escape sequence`. Or tout ce qu'un tour
 * d'agent écrit vient du modèle et de son shell — la sortie d'une commande qui
 * touche un binaire, un log tronqué au milieu d'un caractère, le journal
 * d'événements d'opencode qui les transporte.
 *
 * Ce que ça coûtait, mesuré en production le 2026-08-12 (runs `66023558` et
 * `a8051d06`) : plus une seule sauvegarde de checkpoint — donc plus de battement
 * de cœur —, un rapport de fin de tour refusé lui aussi, un fil figé « en cours »
 * sur le dernier geste de l'agent, et le chien de garde qui finit par ranger le
 * run en « le processus s'est arrêté ». Un octet.
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
    // …et laisse la paire entière, qui est un vrai caractère.
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
    // La regex est globale : la sonder avec `test` avant de remplacer laisserait
    // `lastIndex` en l'air et ferait sauter un octet sur deux d'une chaîne à
    // l'autre. Deux appels d'affilée doivent rendre la même chose.
    expect(stripUnstorable("a\u0000b\u0000c")).toBe("abc");
    expect(stripUnstorable("a\u0000b\u0000c")).toBe("abc");
  });
});
