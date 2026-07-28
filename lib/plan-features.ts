import type { useTranslations } from "next-intl";

import { usageMultiplierVsFree, type BillingPlan } from "@/lib/billing-plans";

/**
 * Les lignes de features d'un plan, dérivées des champs de `BILLING_PLANS` —
 * partagées par les cartes de la page billing (`components/billing/plan-section`)
 * et par celles du site public (`components/marketing/pricing-plans`, MIN-73),
 * pour que les deux ne puissent pas raconter des choses différentes.
 *
 * L'usage IA se dit en MULTIPLES du plan Free, jamais en montants (cf. le
 * commentaire d'en-tête de `lib/billing-plans.ts`).
 */
/** Le translator du namespace `Billing` (import de TYPE : rien n'entre dans le
 *  bundle). Typé depuis la source plutôt que réécrit à la main — une signature
 *  maison `(key: string, values?: …)` accepte une clé à placeholder appelée sans
 *  ses valeurs, ce qui rend le label muet à l'écran au lieu de casser le build. */
export type PlanFeatureTranslator = ReturnType<typeof useTranslations<"Billing">>;

export function planFeatureLabels(plan: BillingPlan, t: PlanFeatureTranslator): string[] {
  return [
    plan.id === "free"
      ? t("featureBaseUsage")
      : t("featureUsageMultiplier", { n: usageMultiplierVsFree(plan) }),
    plan.maxProjects == null
      ? t("featureUnlimitedProjects")
      : t("featureMaxProjects", { n: plan.maxProjects }),
    plan.maxIssuesPerProject == null
      ? t("featureUnlimitedIssues")
      : t("featureMaxIssues", { n: plan.maxIssuesPerProject }),
    ...(plan.allowAgents ? [t("featureAgents")] : []),
    ...(plan.allowMembers ? [t("featureMembers")] : []),
  ];
}
