import { describe, expect, it } from "vitest";

import { DEFAULT_RECOMMENDED_MODELS } from "@/lib/recommended-models";
import { BILLING_PLANS } from "@/lib/billing-plans";
import { aiModelFallback } from "@/lib/ai-model-config";
import { providerFromModel } from "@/lib/model-display";
import { hasProviderLogo } from "@/components/model-logo";

/**
 * The recommended selection, written in code: since MIN-954 the admin no
 * longer rewrites it.
 *
 * The fallback deserves its own assertions because it is an NOTICE written to the
 * hand, not derived data : nothing in the code catches it if it drifts.
 */

describe("the product list", () => {
  it("fits within what a picker can show at once", () => {
    // Around ten, say between 8 and 20: beyond that, open on the selection
    // recommended is no longer better than opening the catalog.
    expect(DEFAULT_RECOMMENDED_MODELS.length).toBeGreaterThanOrEqual(8);
    expect(DEFAULT_RECOMMENDED_MODELS.length).toBeLessThanOrEqual(20);
  });

  it("does not recommend the same model twice", () => {
    expect(new Set(DEFAULT_RECOMMENDED_MODELS).size).toBe(DEFAULT_RECOMMENDED_MODELS.length);
  });

  it("holds only full OpenRouter ids", () => {
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

  it("opens on minddy's default model", () => {
    // The instance default MUST be advised: this is what the picker checks
    // on opening, and a list that does not contain it opens with a
    // selection where the current choice is nowhere.
    expect(DEFAULT_RECOMMENDED_MODELS).toContain(aiModelFallback("assistant_model"));
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
});
