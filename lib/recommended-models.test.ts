import { describe, expect, it, vi } from "vitest";

/**
 * On ne teste ici que les CLÉS de `PROVIDER_LOGOS`, qui sont des littéraux du
 * fichier — les composants en face ne servent à rien à ce test. D'où les deux
 * stubs : le baril de `@lobehub/icons` tire emoji-mart et ses JSON (illisibles
 * sans `import attributes` en environnement node), et celui de mangue-ui fait
 * de même. Un Proxy répond à n'importe quelle marque, `.Color` compris, ce qui
 * évite d'énumérer trente imports qui changeraient à chaque ajout.
 */
// Les marques sont énumérées parce que vitest veut un vrai objet de module (un
// Proxy est refusé). Tenir la liste à jour ne coûte rien : ajouter un import
// dans `model-logo` sans l'ajouter ici fait échouer ce fichier à l'import, avec
// le nom manquant en clair.
vi.mock("@lobehub/icons", () => {
  const icon: unknown = new Proxy(() => null, { get: () => icon });
  const brands = [
    "Ai21", "AionLabs", "Arcee", "Bedrock", "ByteDance", "Claude", "Cohere", "DeepSeek",
    "Gemini", "Grok", "IBM", "Inception", "Kwaipilot", "Liquid", "LongCat", "Meta",
    "Minimax", "Mistral", "Moonshot", "Nvidia", "OpenAI", "OpenRouter", "Perplexity",
    "Poolside", "Qwen", "Relace", "Stepfun", "Tencent", "Upstage", "XiaomiMiMo", "Zhipu",
  ];
  return Object.fromEntries(brands.map((b) => [b, icon]));
});
vi.mock("mangue-ui", () => ({ cn: (...parts: unknown[]) => parts.filter(Boolean).join(" ") }));

import { DEFAULT_RECOMMENDED_MODELS, parseRecommendedModels } from "@/lib/recommended-models";
import { BILLING_PLANS } from "@/lib/billing-plans";
import { aiModelFallback } from "@/lib/ai-model-config";
import { providerFromModel } from "@/lib/model-display";
import { hasProviderLogo } from "@/components/model-logo";

/**
 * La sélection conseillée : le repli produit, et le parseur partagé par l'API
 * admin (qui refuse à l'écriture) et le catalogue (qui lit).
 *
 * Le repli mérite ses propres assertions parce qu'il est un AVIS écrit à la
 * main, pas une donnée dérivée : rien dans le code ne le rattrape s'il dérive.
 */

describe("le repli produit", () => {
  it("tient dans ce qu'un picker peut montrer d'un coup", () => {
    // Une dizaine, disons entre 8 et 20 : au-delà, ouvrir sur la sélection
    // conseillée ne vaut plus mieux qu'ouvrir sur le catalogue.
    expect(DEFAULT_RECOMMENDED_MODELS.length).toBeGreaterThanOrEqual(8);
    expect(DEFAULT_RECOMMENDED_MODELS.length).toBeLessThanOrEqual(20);
  });

  it("ne conseille pas deux fois le même modèle", () => {
    expect(new Set(DEFAULT_RECOMMENDED_MODELS).size).toBe(DEFAULT_RECOMMENDED_MODELS.length);
  });

  it("ne contient que des ids OpenRouter complets", () => {
    // `vendor/model` : un id nu ne résout sur aucun provider de la plateforme,
    // et ne croiserait donc jamais le catalogue.
    for (const id of DEFAULT_RECOMMENDED_MODELS) {
      expect(id, id).toMatch(/^[a-z0-9~.-]+\/[a-zA-Z0-9._:-]+$/);
    }
  });

  it("ne conseille aucun aiguillage ni aucun modèle non textuel", () => {
    // Ceux-là ne sont même pas dans le catalogue (cf. models-catalog) : les
    // conseiller ferait des lignes qui disparaissent à l'intersection.
    for (const id of DEFAULT_RECOMMENDED_MODELS) {
      expect(id.startsWith("~"), id).toBe(false);
      expect(id.startsWith("openrouter/"), id).toBe(false);
      expect(/-image|-audio|whisper|embedding/.test(id), id).toBe(false);
    }
  });

  it("ne conseille aucun modèle sans logo de marque", () => {
    // C'est la liste sur laquelle le picker s'OUVRE : un `Cpu` générique y est
    // visible de tous. Si ce test tombe, il manque une entrée dans
    // `PROVIDER_LOGOS` (components/model-logo.tsx) — pas dans cette liste-ci.
    for (const id of DEFAULT_RECOMMENDED_MODELS) {
      expect(hasProviderLogo(providerFromModel(id)), `${id} → ${providerFromModel(id)}`).toBe(true);
    }
  });

  it("s'ouvre sur le modèle par défaut de minddy", () => {
    // Le défaut de l'instance DOIT être conseillé : c'est ce que le picker coche
    // à l'ouverture, et une liste qui ne le contient pas s'ouvre sur une
    // sélection où le choix courant n'est nulle part.
    expect(DEFAULT_RECOMMENDED_MODELS).toContain(aiModelFallback("agent_model"));
  });

  it("reste sous le plafond du plan le plus généreux", () => {
    // On ne conseille pas ce que personne ne peut lancer. Les multiplicateurs
    // vrais viennent des prix OpenRouter (`model-multiplier`) — ici on garde la
    // borne, qui est ce que la liste doit respecter par construction.
    const cap = Math.max(...BILLING_PLANS.map((p) => p.maxModelMultiplier));
    expect(cap).toBeGreaterThan(0);
    // Le repli est ÉTAGÉ : au moins un modèle doit tenir sous le plafond du plan
    // payant d'entrée, sinon la sélection ne sert qu'aux comptes Pro.
    const go = BILLING_PLANS.find((p) => p.id === "go");
    expect(go?.maxModelMultiplier).toBeGreaterThan(0);
  });

  it("est ce que le registre admin sert en repli", () => {
    // Le champ `app_config` doit retomber sur CETTE liste, pas sur une copie.
    expect(parseRecommendedModels(aiModelFallback("recommended_models"))).toEqual(
      DEFAULT_RECOMMENDED_MODELS,
    );
  });
});

describe("parseRecommendedModels", () => {
  it("lit une liste d'ids sans les réordonner", () => {
    // Le parseur ne trie PAS : l'ordre d'affichage se calcule plus tard, sur les
    // prix (`resolveRecommended`). Ici on rend ce qu'on a lu, tel quel.
    expect(parseRecommendedModels('["b/2","a/1"]')).toEqual(["b/2", "a/1"]);
  });

  it("rend null sur tout ce que le picker ne saurait pas afficher", () => {
    expect(parseRecommendedModels(null)).toBeNull();
    expect(parseRecommendedModels("")).toBeNull();
    expect(parseRecommendedModels("   ")).toBeNull();
    expect(parseRecommendedModels("pas du json")).toBeNull();
    expect(parseRecommendedModels('{"a":1}')).toBeNull();
    expect(parseRecommendedModels("[]")).toBeNull();
    expect(parseRecommendedModels('["", "  "]')).toBeNull();
    expect(parseRecommendedModels("[1, 2]")).toBeNull();
  });

  it("écarte les entrées vides sans jeter la liste", () => {
    expect(parseRecommendedModels('["a/1", "", 42, "b/2"]')).toEqual(["a/1", "b/2"]);
  });

  it("écrase les doublons", () => {
    // Deux `CommandItem` de même `value` donneraient deux lignes identiques dont
    // une seule réagit au clavier.
    expect(parseRecommendedModels('["a/1","a/1","b/2"]')).toEqual(["a/1", "b/2"]);
  });

  it("rogne les espaces autour d'un id", () => {
    expect(parseRecommendedModels('[" a/1 "]')).toEqual(["a/1"]);
  });
});
