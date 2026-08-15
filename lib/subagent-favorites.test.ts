import { describe, expect, it } from "vitest";

import {
  DEFAULT_SUBAGENT_FAVORITES,
  parseSubagentFavorites,
  type FavoriteSubagentModel,
} from "./subagent-favorites";
import {
  AI_MODEL_CONFIG_FIELDS,
  aiModelFallback,
  getAiConfigField,
} from "./ai-model-config";

/**
 * Les favoris de sous-agents sont éditables depuis /admin : le parseur est donc
 * le CONTRAT entre l'écran qui écrit et le run qui lit. Ce qu'on vérifie ici,
 * c'est qu'il rend le même verdict des deux côtés — l'API refuse à l'écriture
 * exactement ce que le runtime jetterait à la lecture (sinon on enregistre une
 * liste qui ne servira jamais, sans que personne ne le voie).
 */
describe("parseSubagentFavorites", () => {
  it("rend null sur tout ce qui ne donne aucun favori utilisable", () => {
    for (const raw of [
      null,
      undefined,
      "",
      "   ",
      "{ not json",
      '"a string"',
      "{}",
      "[]",
      "[{}]",
      '[{"label":"no id"}]',
      '[{"id":"   "}]',
    ]) {
      expect(parseSubagentFavorites(raw)).toBeNull();
    }
  });

  it("garde les entrées valides et jette les autres", () => {
    const favorites = parseSubagentFavorites(
      JSON.stringify([
        { id: " ok/one ", use_case: " explore " },
        { nope: true },
        { id: "ok/two", label: "Two", thinking_effort: "off" },
        { id: "ok/three", label: "Three", thinking_effort: "high" },
      ]),
    );
    expect(favorites).toEqual([
      // Sans libellé, l'id fait office de nom ; `off` n'est pas un niveau exposé.
      { id: "ok/one", label: "ok/one", use_case: "explore" },
      { id: "ok/two", label: "Two", use_case: "" },
      { id: "ok/three", label: "Three", use_case: "", thinking_effort: "high" },
    ] satisfies FavoriteSubagentModel[]);
  });

  it("relit ce qu'il a produit — l'aller-retour de l'écran admin", () => {
    const json = JSON.stringify(DEFAULT_SUBAGENT_FAVORITES);
    expect(parseSubagentFavorites(json)).toEqual(DEFAULT_SUBAGENT_FAVORITES);
  });
});

describe("DEFAULT_SUBAGENT_FAVORITES", () => {
  it("est du prompt : anglais, un use-case par entrée, jamais les hints du picker", () => {
    for (const favorite of DEFAULT_SUBAGENT_FAVORITES) {
      expect(favorite.id).toMatch(/\//);
      expect(favorite.label.length).toBeGreaterThan(0);
      // Le use-case EST ce qui sert au choix : un favori sans conseil ne dit rien.
      expect(favorite.use_case.length).toBeGreaterThan(10);
    }
    expect(DEFAULT_SUBAGENT_FAVORITES.map((f) => f.use_case).join(" ")).not.toMatch(
      /Économique|défaut/,
    );
  });
});

/**
 * Le registre est le SEUL endroit où un id de modèle est écrit en dur : chaque
 * appelant lit le sien via `aiModelFallback`. Une clé absente ou un fallback vide
 * enverrait `undefined` au fournisseur — mieux vaut le voir ici.
 */
describe("registre des réglages IA", () => {
  it("donne un défaut non vide à chaque réglage de modèle", () => {
    for (const field of AI_MODEL_CONFIG_FIELDS) {
      // Un endpoint générique (ou un provider sans cette capacité native) n'a
      // aucun id universel honnête. Ses champs BYOK générés restent vides tant
      // qu'un admin ne les configure pas, plutôt que d'envoyer un modèle faux.
      if (field.adminLabel && field.kind === "modelId" && !field.fallback.trim()) continue;
      expect(aiModelFallback(field.key).trim().length).toBeGreaterThan(0);
    }
  });

  it("lève sur une clé inconnue plutôt que de router vers undefined", () => {
    expect(() => aiModelFallback("nope_model")).toThrow();
    expect(getAiConfigField("nope_model")).toBeUndefined();
  });

  it("sert des favoris relisibles comme défaut de la liste éditable", () => {
    const field = getAiConfigField("agent_subagent_favorites");
    expect(field?.kind).toBe("favorites");
    expect(parseSubagentFavorites(field!.fallback)).toEqual(DEFAULT_SUBAGENT_FAVORITES);
  });
});
