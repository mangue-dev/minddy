import { describe, expect, it } from "vitest";

import {
  agentCompactThreshold,
  AGENT_COMPACT_BASELINE_TOKENS,
  AGENT_COMPACT_MAX_TOKENS_CEILING,
  AGENT_COMPACT_REFERENCE_INPUT_USD_PER_MTOK,
  AGENT_COMPACT_TOKEN_THRESHOLD,
} from "./agent-models";

/**
 * Le seuil de compaction borne un COÛT PAR ROUND, pas un nombre de tokens.
 *
 * Écrit en dur à 120 000, il disait la même chose à `deepseek-v4-flash`
 * (0,14 $/Mtok) et à `claude-opus-4.8` (5 $/Mtok) — soit 0,017 $ contre 0,60 $ le
 * round, trente-six fois l'écart pour un garde-fou de dépense. Ces tests figent
 * les trois bornes de la conversion, et surtout ce qu'elles PROTÈGENT.
 *
 * Les prix sont ceux relevés sur l'index OpenRouter le 2026-08-09.
 */

const WINDOW_1M = 1_000_000;

describe("agentCompactThreshold", () => {
  it("rend la valeur calibrée au prix de référence — rien ne bouge pour le modèle par défaut", () => {
    expect(
      agentCompactThreshold({
        contextWindow: 1_048_576, // deepseek-v4-flash
        inputUsdPerMTok: AGENT_COMPACT_REFERENCE_INPUT_USD_PER_MTOK,
      }),
    ).toBe(AGENT_COMPACT_BASELINE_TOKENS);
  });

  it("MONTE pour un modèle moins cher, à coût par round constant", () => {
    // gpt-5.6-luna, 0,10 $/Mtok : 40 % moins cher que la référence, donc 40 % de
    // contexte en plus pour le même prix.
    const threshold = agentCompactThreshold({ contextWindow: 1_050_000, inputUsdPerMTok: 0.1 });
    expect(threshold).toBe(168_000);
    // La propriété qui compte, et elle se vérifie en dollars : le prompt d'un round
    // au seuil coûte la même chose qu'à la référence.
    const atReference =
      (AGENT_COMPACT_BASELINE_TOKENS / 1e6) * AGENT_COMPACT_REFERENCE_INPUT_USD_PER_MTOK;
    expect((threshold / 1e6) * 0.1).toBeCloseTo(atReference, 6);
  });

  it("ne DESCEND pas pour un modèle cher — compacter plus tôt ne fait pas économiser", () => {
    // Le modèle rachèterait en relectures ce qu'on lui retire : c'est MIN-248, et
    // c'est plus cher que l'historique qu'on aurait gardé.
    for (const price of [2, 5, 15]) {
      expect(agentCompactThreshold({ contextWindow: WINDOW_1M, inputUsdPerMTok: price })).toBe(
        AGENT_COMPACT_BASELINE_TOKENS,
      );
    }
  });

  it("ne monte pas jusqu'à un seuil que les runs n'atteignent jamais", () => {
    // Le plus gros contexte jamais observé sur l'agent : 158 301 tokens. Un modèle
    // quasi gratuit donnerait un seuil de plusieurs millions — donc pas de seuil du
    // tout, ce qui est exactement la panne de MIN-113.
    const threshold = agentCompactThreshold({ contextWindow: WINDOW_1M, inputUsdPerMTok: 0.001 });
    expect(threshold).toBe(AGENT_COMPACT_MAX_TOKENS_CEILING);
    expect(threshold).toBeGreaterThan(158_301);
  });

  it("reste sous 75 % de la fenêtre, même quand le prix autoriserait plus", () => {
    // Un modèle bon marché à PETITE fenêtre : le budget ne peut pas dépasser ce que
    // le modèle sait lire.
    expect(agentCompactThreshold({ contextWindow: 128_000, inputUsdPerMTok: 0.01 })).toBe(96_000);
  });

  it("ne bouge pas sur un prix inconnu : ignorer n'autorise pas à monter", () => {
    // BYOK hors catalogue OpenRouter. On garde la valeur calibrée plutôt que
    // d'extrapoler sur une ignorance.
    expect(agentCompactThreshold({ contextWindow: WINDOW_1M, inputUsdPerMTok: null })).toBe(
      AGENT_COMPACT_BASELINE_TOKENS,
    );
    expect(agentCompactThreshold({ contextWindow: WINDOW_1M })).toBe(
      AGENT_COMPACT_BASELINE_TOKENS,
    );
  });

  it("traite un modèle GRATUIT comme un prix inconnu, pas comme un budget infini", () => {
    // Un prix nul n'annule pas la latence ni la dégradation d'attention d'un
    // historique démesuré — et une division par zéro ne dit rien de vrai.
    expect(agentCompactThreshold({ contextWindow: WINDOW_1M, inputUsdPerMTok: 0 })).toBe(
      AGENT_COMPACT_BASELINE_TOKENS,
    );
  });

  it("retombe sur le défaut quand la fenêtre est inconnue", () => {
    expect(agentCompactThreshold({ contextWindow: null, inputUsdPerMTok: 0.1 })).toBe(
      AGENT_COMPACT_TOKEN_THRESHOLD,
    );
  });
});
