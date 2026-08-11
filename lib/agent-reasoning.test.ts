import { describe, expect, it } from "vitest";
import {
  DEFAULT_REASONING_LEVEL,
  GENERIC_REASONING_LEVELS,
  isReasoningLevel,
  nearestReasoningLevel,
  reasoningLevelsFor,
  reasoningMaxTokens,
  reasoningRequestFields,
  REASONING_LEVELS,
  toReasoningLevel,
} from "./agent-reasoning";

/**
 * Tests du niveau de raisonnement (MIN-122). Ce qui compte ici : rien n'est
 * envoyé tant qu'on ne l'a pas explicitement demandé ET que le provider ne l'a
 * pas déclaré au registre — un champ inconnu revient en 400 et tue le round.
 */

describe("isReasoningLevel / toReasoningLevel", () => {
  it("accepte tout le vocabulaire et rien d'autre", () => {
    for (const level of REASONING_LEVELS) expect(isReasoningLevel(level)).toBe(true);
    expect(isReasoningLevel("maximum")).toBe(false);
    // `none` est le mot d'OpenRouter ; le nôtre est `off`, et il dit un peu plus
    // (n'envoyer AUCUN champ). La traduction se fait à la lecture de l'index.
    expect(isReasoningLevel("none")).toBe(false);
    expect(isReasoningLevel("")).toBe(false);
    expect(isReasoningLevel(null)).toBe(false);
    expect(isReasoningLevel(2)).toBe(false);
  });

  it("normalise tout le reste au défaut", () => {
    expect(toReasoningLevel("high")).toBe("high");
    expect(toReasoningLevel("nope")).toBe(DEFAULT_REASONING_LEVEL);
    expect(toReasoningLevel(undefined)).toBe(DEFAULT_REASONING_LEVEL);
  });

  it("le défaut est `medium` — l'agent réfléchit un peu, sauf choix contraire", () => {
    expect(DEFAULT_REASONING_LEVEL).toBe("medium");
  });
});

describe("reasoningRequestFields", () => {
  it("n'envoie RIEN à `off`, quel que soit le provider", () => {
    expect(reasoningRequestFields("off", "openrouter")).toEqual({});
    expect(reasoningRequestFields("off", "openai")).toEqual({});
  });

  it("n'envoie RIEN sur un niveau inconnu ou absent", () => {
    expect(reasoningRequestFields(null, "openrouter")).toEqual({});
    expect(reasoningRequestFields(undefined, "openrouter")).toEqual({});
    expect(reasoningRequestFields("maximum" as never, "openrouter")).toEqual({});
  });

  it("n'envoie RIEN au provider générique, même à `high`", () => {
    // Base URL inconnue : un serveur OpenAI-compatible strict rejette le champ.
    expect(reasoningRequestFields("high", "generic")).toEqual({});
  });

  it("forme IMBRIQUÉE sur OpenRouter, trace demandée", () => {
    expect(reasoningRequestFields("medium", "openrouter")).toEqual({
      reasoning: { effort: "medium", exclude: false },
    });
  });

  it("forme PLATE sur les couches compat OpenAI", () => {
    expect(reasoningRequestFields("low", "openai")).toEqual({ reasoning_effort: "low" });
    expect(reasoningRequestFields("high", "anthropic")).toEqual({ reasoning_effort: "high" });
    expect(reasoningRequestFields("medium", "google")).toEqual({ reasoning_effort: "medium" });
    expect(reasoningRequestFields("minimal", "openai")).toEqual({ reasoning_effort: "minimal" });
  });

  it("passe `xhigh` et `max` tels quels à OpenRouter — c'est SON vocabulaire", () => {
    expect(reasoningRequestFields("xhigh", "openrouter")).toEqual({
      reasoning: { effort: "xhigh", exclude: false },
    });
    expect(reasoningRequestFields("max", "openrouter")).toEqual({
      reasoning: { effort: "max", exclude: false },
    });
  });

  it("mais les RABAT sur les couches compat, qui ne les connaissent pas", () => {
    // OpenRouter rabat lui-même sur ce que le modèle accepte ; envoyés en direct,
    // ces deux-là reviennent en 400 et tuent le round. Perdre un cran de
    // réflexion vaut mieux que perdre le tour.
    expect(reasoningRequestFields("xhigh", "openai")).toEqual({ reasoning_effort: "high" });
    expect(reasoningRequestFields("max", "anthropic")).toEqual({ reasoning_effort: "high" });
  });

  it("n'émet jamais budget_tokens ni thinkingConfig (champs d'API natives)", () => {
    for (const provider of ["openrouter", "openai", "anthropic", "google", "generic"] as const) {
      const body = JSON.stringify(reasoningRequestFields("high", provider));
      expect(body).not.toContain("budget_tokens");
      expect(body).not.toContain("thinkingConfig");
      expect(body).not.toContain("thinking");
    }
  });
});

describe("reasoningMaxTokens", () => {
  it("laisse le plafond intact à `off` ou sur un niveau invalide", () => {
    expect(reasoningMaxTokens(8192, "off")).toBe(8192);
    expect(reasoningMaxTokens(8192, null)).toBe(8192);
  });

  it("relève le plafond, et de plus en plus haut avec le niveau", () => {
    const off = reasoningMaxTokens(8192, "off")!;
    const low = reasoningMaxTokens(8192, "low")!;
    const medium = reasoningMaxTokens(8192, "medium")!;
    const high = reasoningMaxTokens(8192, "high")!;
    expect(off).toBeLessThan(low);
    expect(low).toBeLessThan(medium);
    expect(medium).toBeLessThan(high);
  });

  it("reste absent quand le provider n'envoie pas de max_tokens", () => {
    expect(reasoningMaxTokens(undefined, "high")).toBeUndefined();
  });
});

describe("reasoningLevelsFor — ce que le sélecteur propose", () => {
  it("sans métadonnées, les quatre historiques", () => {
    // Un BYOK direct, un modèle hors index : on ne sait rien, on ne promet rien
    // de plus que ce qui marchait avant.
    expect(reasoningLevelsFor(null)).toEqual(GENERIC_REASONING_LEVELS);
    expect(reasoningLevelsFor(undefined)).toEqual(GENERIC_REASONING_LEVELS);
  });

  it("les paliers PUBLIÉS par le modèle, précédés de « sans raisonnement »", () => {
    // `openai/gpt-5.1-codex-max` en vrai : xhigh|high|medium|low, non obligatoire.
    expect(
      reasoningLevelsFor({ efforts: ["low", "medium", "high", "xhigh"], mandatory: false }),
    ).toEqual(["off", "low", "medium", "high", "xhigh"]);
  });

  it("un modèle qui raisonne TOUJOURS n'a pas de « sans raisonnement »", () => {
    // `google/gemini-3.6-flash` en vrai : mandatory, minimal|low|medium|high. Lui
    // envoyer `none` casse l'appel — l'option ne doit donc pas exister à l'écran.
    expect(
      reasoningLevelsFor({ efforts: ["minimal", "low", "medium", "high"], mandatory: true }),
    ).toEqual(["minimal", "low", "medium", "high"]);
  });

  it("un modèle qui raisonne sans publier d'énumération retombe sur les génériques", () => {
    // Les Claude : `{ mandatory: false }`, et rien d'autre.
    expect(reasoningLevelsFor({ efforts: [], mandatory: false })).toEqual(
      GENERIC_REASONING_LEVELS,
    );
  });
});

describe("nearestReasoningLevel", () => {
  it("garde le niveau quand le modèle l'accepte", () => {
    expect(nearestReasoningLevel("high", ["low", "medium", "high"])).toBe("high");
  });

  it("descend d'abord — on ne dépense jamais plus que demandé", () => {
    expect(nearestReasoningLevel("max", ["low", "medium", "high"])).toBe("high");
    expect(nearestReasoningLevel("medium", ["off", "low"])).toBe("low");
  });

  it("mais remonte quand le modèle n'a rien de moins cher", () => {
    // Un modèle qui n'accepte que `high` doit recevoir `high`, même sur un défaut
    // perso à `low` : le sélecteur ne peut pas afficher un palier qu'il ne liste pas.
    expect(nearestReasoningLevel("low", ["high"])).toBe("high");
  });

  it("laisse passer quand on ne sait rien de ce qu'il accepte", () => {
    expect(nearestReasoningLevel("xhigh", [])).toBe("xhigh");
  });

  it("tout le vocabulaire est ordonné du moins cher au plus cher", () => {
    // Le rang de `REASONING_LEVELS` EST l'échelle que `nearestReasoningLevel`
    // descend : les mettre dans le désordre ferait rabattre `max` sur `minimal`.
    expect(REASONING_LEVELS).toEqual([
      "off",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ]);
  });
});
