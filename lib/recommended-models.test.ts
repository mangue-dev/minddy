import { describe, expect, it, vi } from "vitest";

/**
 * We only test here the KEYS of `PROVIDER_LOGOS`, which are literals of the
 * file — the components opposite are of no use for this test. Hence the two
 * stubs: the barrel of `@lobehub/icons` pulls emoji-mart and its JSON (unreadable
 * without `import attributes` in node environment), and that of mango-ui does
 * similarly. A Proxy responds to any mark, including `.Color`, which
 * avoids listing thirty imports which would change with each addition.
 */
// The marks are listed because vitest wants a real module object (a
// Proxy is refused). Keeping the list up to date costs nothing: add an import
// in `model-logo` without adding it here causes this file to fail on import, with
// the missing name in plain text.
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
 * The recommended selection: the fallback produces, and the parser shared by the API
 * admin (which refuses to write) and the catalog (which reads).
 *
 * The fallback deserves its own assertions because it is an NOTICE written to the
 * hand, not derived data : nothing in the code catches it if it drifts.
 */

describe("le repli produit", () => {
  it("fits within what a picker can show at once", () => {
    // Around ten, say between 8 and 20: beyond that, open on the selection
    // recommended is no longer better than opening the catalog.
    expect(DEFAULT_RECOMMENDED_MODELS.length).toBeGreaterThanOrEqual(8);
    expect(DEFAULT_RECOMMENDED_MODELS.length).toBeLessThanOrEqual(20);
  });

  it("does not recommend the same model twice", () => {
    expect(new Set(DEFAULT_RECOMMENDED_MODELS).size).toBe(DEFAULT_RECOMMENDED_MODELS.length);
  });

  it("ne contient que des ids OpenRouter complets", () => {
    // `vendor/model`: a bare id does not resolve on any provider on the platform,
    // and would therefore never come across the catalog.
    for (const id of DEFAULT_RECOMMENDED_MODELS) {
      expect(id, id).toMatch(/^[a-z0-9~.-]+\/[a-zA-Z0-9._:-]+$/);
    }
  });

  it("recommends neither routing entries nor non-text models", () => {
    // These are not even in the catalog (see models-catalog): the
    // advisor would make lines that disappear at the intersection.
    for (const id of DEFAULT_RECOMMENDED_MODELS) {
      expect(id.startsWith("~"), id).toBe(false);
      expect(id.startsWith("openrouter/"), id).toBe(false);
      expect(/-image|-audio|whisper|embedding/.test(id), id).toBe(false);
    }
  });

  it("does not recommend a model without a brand logo", () => {
    // This is the list on which the picker OPENS: a generic `Cpu` is there
    // visible to everyone. If this test fails, an entry is missing in
    // `PROVIDER_LOGOS` (components/model-logo.tsx) — not in this list.
    for (const id of DEFAULT_RECOMMENDED_MODELS) {
      expect(hasProviderLogo(providerFromModel(id)), `${id} → ${providerFromModel(id)}`).toBe(true);
    }
  });

  it("s'ouvre sur le modèle par défaut de minddy", () => {
    // The instance default MUST be advised: this is what the picker checks
    // on opening, and a list that does not contain it opens with a
    // selection where the current choice is nowhere.
    expect(DEFAULT_RECOMMENDED_MODELS).toContain(aiModelFallback("agent_model"));
  });

  it("stays under the cap of the most generous plan", () => {
    // We don't recommend what no one can launch. Multipliers
    // real ones come from OpenRouter prices (`model-multiplier`) — here we keep the
    // bound, which is what the list must respect by construction.
    const cap = Math.max(...BILLING_PLANS.map((p) => p.maxModelMultiplier));
    expect(cap).toBeGreaterThan(0);
    // The fold is STAGED: at least one model must fit under the ceiling of the plan
    // entry fee, otherwise the selection is only used for Pro accounts.
    const go = BILLING_PLANS.find((p) => p.id === "go");
    expect(go?.maxModelMultiplier).toBeGreaterThan(0);
  });

  it("is what the admin registry serves as a fallback", () => {
    // The `app_config` field should fall on THIS list, not a copy.
    expect(parseRecommendedModels(aiModelFallback("recommended_models"))).toEqual(
      DEFAULT_RECOMMENDED_MODELS,
    );
  });
});

describe("parseRecommendedModels", () => {
  it("reads a list of ids without reordering them", () => {
    // The parser does NOT sort: the display order is calculated later, on the
    // prix (`resolveRecommended`). Ici on rend ce qu'on a lu, tel quel.
    expect(parseRecommendedModels('["b/2","a/1"]')).toEqual(["b/2", "a/1"]);
  });

  it("returns null for anything the picker could not display", () => {
    expect(parseRecommendedModels(null)).toBeNull();
    expect(parseRecommendedModels("")).toBeNull();
    expect(parseRecommendedModels("   ")).toBeNull();
    expect(parseRecommendedModels("pas du json")).toBeNull();
    expect(parseRecommendedModels('{"a":1}')).toBeNull();
    expect(parseRecommendedModels("[]")).toBeNull();
    expect(parseRecommendedModels('["", "  "]')).toBeNull();
    expect(parseRecommendedModels("[1, 2]")).toBeNull();
  });

  it("discards empty entries without discarding the list", () => {
    expect(parseRecommendedModels('["a/1", "", 42, "b/2"]')).toEqual(["a/1", "b/2"]);
  });

  it("deduplicates entries", () => {
    // Two `CommandItem` of the same `value` would give two identical lines of which
    // only one reacts to the keyboard.
    expect(parseRecommendedModels('["a/1","a/1","b/2"]')).toEqual(["a/1", "b/2"]);
  });

  it("rogne les espaces autour d'un id", () => {
    expect(parseRecommendedModels('[" a/1 "]')).toEqual(["a/1"]);
  });
});
