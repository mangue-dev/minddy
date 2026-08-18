import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import { BILLABLE_FEATURES } from "./billing-plans";
import {
  FEATURE_LABEL_KEYS,
  USAGE_HISTORY_FEATURES,
  toUsageHistoryFeature,
} from "./usage-features";

/**
 * The usage history says the GESTURE ("Smart-fill"), not the family
 * ("Automations"): it is this table which allows it, and a feature
 * which is not returned silently under the name of its segment — the
 * exact regression which we have just corrected, and which raises nothing.
 */
describe("FEATURE_LABEL_KEYS", () => {
  it("nomme CHAQUE feature de l'historique, en anglais et en français", () => {
    for (const feature of USAGE_HISTORY_FEATURES) {
      const key = FEATURE_LABEL_KEYS[feature];
      expect(key, `feature ${feature}`).toBeTruthy();
      expect(en.Billing, `en.Billing.${key}`).toHaveProperty(key);
      expect(fr.Billing, `fr.Billing.${key}`).toHaveProperty(key);
    }
  });

  it("couvre tout ce que la barre de budget compte", () => {
    // A billable feature without a label would be displayed under the name of its
    // segment: the line would revert to “Automations” for this one alone.
    for (const feature of BILLABLE_FEATURES) {
      expect(USAGE_HISTORY_FEATURES, `feature ${feature}`).toContain(feature);
    }
  });

  it("donne à chaque feature un libellé qui lui est PROPRE", () => {
    // Two features with the same name, this is the grouping from before under another
    // mask: the user still can't tell what it triggered.
    for (const messages of [en, fr]) {
      const labels = USAGE_HISTORY_FEATURES.map(
        (f) => (messages.Billing as Record<string, string>)[FEATURE_LABEL_KEYS[f]],
      );
      expect(new Set(labels).size).toBe(labels.length);
    }
  });

  it("suit la table de l'admin finance, sauf la démo de la landing", () => {
    // The admin lists ALL the features of the ledger, up to date by construction (we
    // read a margin, we notice it immediately). It therefore serves as a witness:
    // a feature added there and forgotten here would be placed under “Numo” in
    // the history of the user who pays it. `landing_demo` is billed per
    // platform — no account has a line in this name.
    for (const feature of Object.keys(en.Admin.finance.features)) {
      if (feature === "landing_demo") continue;
      expect(USAGE_HISTORY_FEATURES, `feature ${feature}`).toContain(feature);
    }
  });
});

describe("toUsageHistoryFeature", () => {
  it("laisse passer une feature connue", () => {
    expect(toUsageHistoryFeature("smart_fill")).toBe("smart_fill");
  });

  it("rend null sur une feature qu'on ne sait pas nommer", () => {
    // The base still carries the feature lines removed from the code
    // (`issue_autocomplete`): letting them pass would display the PATH of the
    // i18n key on screen. `null` → the UI falls back to the segment name.
    expect(toUsageHistoryFeature("issue_autocomplete")).toBeNull();
    expect(toUsageHistoryFeature("landing_demo")).toBeNull();
  });
});
