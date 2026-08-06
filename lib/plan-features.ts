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
    // Les invités se lisent avec les autres QUANTITÉS, et sur les trois cartes
    // (MIN-199) : la ligne n'apparaissait qu'en Pro, ce qui laissait croire au
    // gratuit qu'on n'y travaille jamais à plusieurs.
    plan.maxMembersPerProject == null
      ? t("featureUnlimitedMembers")
      : t("featureMaxMembers", { n: plan.maxMembersPerProject }),
    ...(plan.allowAgents ? [t("featureAgents")] : []),
    // Le BYOK suit l'agent parce qu'il ne vaut QUE pour lui (`resolveAgentApiKey`
    // n'est appelé que par la boucle de l'agent) et qu'il est gardé par la même
    // condition : `checkAgentQuota` refuse un run sans `allowAgents`, clé perso
    // ou non. C'est l'argument central du prix (MIN-149) — l'abonnement achète
    // minddy, l'inférence de l'agent peut rester chez vous — donc il se lit sur
    // la carte, pas seulement en FAQ.
    ...(plan.allowAgents ? [t("featureByok")] : []),
  ];
}
