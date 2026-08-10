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
 * L'historique d'usage dit le GESTE (« Smart-fill »), pas la famille
 * (« Automatisations ») : c'est cette table-là qui le permet, et une feature
 * qui n'y est pas repasse silencieusement sous le nom de son segment — la
 * régression exacte qu'on vient de corriger, et qui ne lève rien.
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
    // Une feature facturable sans libellé s'afficherait sous le nom de son
    // segment : la ligne redeviendrait « Automatisations » pour celle-là seule.
    for (const feature of BILLABLE_FEATURES) {
      expect(USAGE_HISTORY_FEATURES, `feature ${feature}`).toContain(feature);
    }
  });

  it("donne à chaque feature un libellé qui lui est PROPRE", () => {
    // Deux features au même nom, c'est le regroupement d'avant sous un autre
    // masque : l'utilisateur ne peut toujours pas dire ce qu'il a déclenché.
    for (const messages of [en, fr]) {
      const labels = USAGE_HISTORY_FEATURES.map(
        (f) => (messages.Billing as Record<string, string>)[FEATURE_LABEL_KEYS[f]],
      );
      expect(new Set(labels).size).toBe(labels.length);
    }
  });

  it("suit la table de l'admin finance, sauf la démo de la landing", () => {
    // L'admin liste TOUTES les features du ledger, à jour par construction (on
    // y lit une marge, on la remarque tout de suite). Elle sert donc de témoin :
    // une feature ajoutée là-bas et oubliée ici se rangerait sous « Numo » dans
    // l'historique de l'utilisateur qui la paye. `landing_demo` se facture à la
    // plateforme — aucun compte n'a de ligne à ce nom.
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
    // La base porte encore les lignes de features retirées du code
    // (`issue_autocomplete`) : les laisser passer afficherait le CHEMIN de la
    // clé i18n à l'écran. `null` → l'UI retombe sur le nom du segment.
    expect(toUsageHistoryFeature("issue_autocomplete")).toBeNull();
    expect(toUsageHistoryFeature("landing_demo")).toBeNull();
  });
});
