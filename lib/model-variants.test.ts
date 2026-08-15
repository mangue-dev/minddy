import { describe, expect, it } from "vitest";
import { canonicalModelId, dedupeModelVariants } from "@/lib/model-variants";

/**
 * Les doublons de version du catalogue (cf. lib/model-variants.ts). Rien d'IO :
 * c'est une règle de chaîne sur une liste d'ids, et c'est là qu'elle se vérifie.
 * Les ids sont ceux qu'OpenRouter publiait vraiment le jour de l'écriture.
 */

const ids = (models: { id: string }[]) => models.map((m) => m.id);
const dedupe = (list: string[]) => ids(dedupeModelVariants(list.map((id) => ({ id }))));

describe("canonicalModelId", () => {
  it("retire un instantané daté", () => {
    expect(canonicalModelId("openai/gpt-4o-2024-11-20")).toBe("openai/gpt-4o");
    expect(canonicalModelId("anthropic/claude-sonnet-5-20260114")).toBe("anthropic/claude-sonnet-5");
    expect(canonicalModelId("google/gemini-2.5-pro-05-06")).toBe("google/gemini-2.5-pro");
  });

  it("NE retire PAS un tag de release à quatre chiffres", () => {
    // `-0731` / `-2507` ne sont pas des dates de build mais le nom d'une sortie
    // de plus : l'id nu reste accroché à la précédente. Les ramener à lui, c'est
    // annoncer un doublon là où il y a deux modèles.
    for (const id of [
      "deepseek/deepseek-v4-flash-0731",
      "deepseek/deepseek-v4-pro-0813",
      "qwen/qwen3-235b-a22b-2507",
      "moonshotai/kimi-k3-0905",
    ]) {
      expect(canonicalModelId(id)).toBe(id);
    }
  });

  it("retire un qualificatif de pré-version", () => {
    expect(canonicalModelId("tencent/hy3-preview")).toBe("tencent/hy3");
    expect(canonicalModelId("deepseek/deepseek-v3.2-exp")).toBe("deepseek/deepseek-v3.2");
    expect(canonicalModelId("openai/gpt-4-turbo-preview")).toBe("openai/gpt-4-turbo");
  });

  it("cumule les deux formes", () => {
    expect(canonicalModelId("google/gemini-2.5-pro-preview-05-06")).toBe("google/gemini-2.5-pro");
  });

  it("ignore la variante `:`, qui n'est pas une version", () => {
    expect(canonicalModelId("openai/gpt-4o:batch")).toBe("openai/gpt-4o");
    expect(canonicalModelId("qwen/qwen-plus-2025-07-28:thinking")).toBe("qwen/qwen-plus");
  });

  it("laisse un id nu intact", () => {
    for (const id of [
      "anthropic/claude-sonnet-5",
      "openai/gpt-5.4-mini",
      "nvidia/nemotron-3-ultra-550b-a55b",
      "google/gemma-4-26b-a4b-it",
      "openai/o4-mini-high",
    ]) {
      expect(canonicalModelId(id)).toBe(id);
    }
  });

  it("ne rend jamais un nom vide, même sur un slug qui n'est que sa date", () => {
    // Un id nu vide serait la clé de TOUS les slugs dégénérés : ils se
    // dédoublonneraient entre eux. La boucle s'arrête sur la dernière forme qui
    // nomme encore quelque chose.
    for (const id of ["vendor/2024-01-01", "vendor/preview", "2024-01-01"]) {
      expect(canonicalModelId(id).replace(/^[^/]*\//, "")).not.toBe("");
    }
  });
});

describe("dedupeModelVariants", () => {
  it("écarte le tarif différé, toujours", () => {
    // Même sans base en face : on n'appelle jamais une file asynchrone depuis
    // une boucle qui attend sa réponse.
    expect(dedupe(["openai/gpt-5.4", "openai/gpt-5.4:batch"])).toEqual(["openai/gpt-5.4"]);
    expect(dedupe(["google/gemini-3.1-pro-preview:batch"])).toEqual([]);
  });

  it("écarte les instantanés quand l'id nu est là", () => {
    expect(
      dedupe([
        "openai/gpt-4o-2024-11-20",
        "openai/gpt-4o-2024-08-06",
        "openai/gpt-4o",
        "openai/gpt-4o-2024-05-13",
        "openai/gpt-4o:batch",
      ]),
    ).toEqual(["openai/gpt-4o"]);
  });

  it("écarte la pré-version quand la version stable est là", () => {
    expect(dedupe(["tencent/hy3", "tencent/hy3-preview"])).toEqual(["tencent/hy3"]);
    expect(
      dedupe(["google/gemini-2.5-pro", "google/gemini-2.5-pro-preview", "google/gemini-2.5-pro:batch"]),
    ).toEqual(["google/gemini-2.5-pro"]);
  });

  it("GARDE la pré-version qui est le seul chemin vers ce modèle", () => {
    // `google/gemini-3.1-pro` n'existe pas : la retirer ne rangerait pas la
    // liste, elle retirerait le modèle.
    expect(dedupe(["google/gemini-3.1-pro-preview", "google/gemini-3.1-pro-preview:batch"])).toEqual(
      ["google/gemini-3.1-pro-preview"],
    );
  });

  it("GARDE la sortie suivante d'une famille, même à côté de l'id nu", () => {
    // Le cas qui a cassé le picker : `deepseek-v4-flash-0731` et
    // `deepseek-v4-pro-0813` sont des modèles de plus, pas des photos de
    // `-flash` et `-pro`. Les écarter ne laissait AUCUN chemin vers eux.
    expect(
      dedupe([
        "deepseek/deepseek-v4-flash",
        "deepseek/deepseek-v4-flash-0731",
        "deepseek/deepseek-v4-pro",
        "deepseek/deepseek-v4-pro-0813",
        "deepseek/deepseek-v4-pro-0813:batch",
        "qwen/qwen3.8-27b",
        "qwen/qwen3.8-27b-2507",
      ]),
    ).toEqual([
      "deepseek/deepseek-v4-flash",
      "deepseek/deepseek-v4-flash-0731",
      "deepseek/deepseek-v4-pro",
      "deepseek/deepseek-v4-pro-0813",
      "qwen/qwen3.8-27b",
      "qwen/qwen3.8-27b-2507",
    ]);
  });

  it("garde toute une famille qui n'a que des datés", () => {
    // Aucun id nu : désigner un gagnant serait un pari sur ce que l'utilisateur veut.
    expect(dedupe(["openai/gpt-4o-2024-11-20", "openai/gpt-4o-2024-08-06"])).toEqual([
      "openai/gpt-4o-2024-11-20",
      "openai/gpt-4o-2024-08-06",
    ]);
  });

  it("garde les variantes qui sont une autre offre", () => {
    // `:free` est un autre prix, `:thinking` un autre comportement — et cette
    // dernière survit à la disparition de sa base datée, faute d'équivalent.
    expect(dedupe(["openai/gpt-oss-20b", "openai/gpt-oss-20b:free"])).toEqual([
      "openai/gpt-oss-20b",
      "openai/gpt-oss-20b:free",
    ]);
    expect(
      dedupe(["qwen/qwen-plus", "qwen/qwen-plus-2025-07-28", "qwen/qwen-plus-2025-07-28:thinking"]),
    ).toEqual(["qwen/qwen-plus", "qwen/qwen-plus-2025-07-28:thinking"]);
  });

  it("ne touche pas à une liste déjà propre, ni à son ordre", () => {
    const clean = ["anthropic/claude-sonnet-5", "deepseek/deepseek-v4-flash", "openai/gpt-5.4"];
    expect(dedupe(clean)).toEqual(clean);
  });

  it("préserve le reste de l'entrée", () => {
    expect(
      dedupeModelVariants([
        { id: "openai/gpt-4o", name: "GPT-4o" },
        { id: "openai/gpt-4o-2024-08-06", name: "GPT-4o (2024-08-06)" },
      ]),
    ).toEqual([{ id: "openai/gpt-4o", name: "GPT-4o" }]);
  });
});
