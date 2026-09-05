import type { useTranslations } from "next-intl";

import { usageMultiplierVsFree, type BillingPlan } from "@/lib/billing-plans";

/**
 * The feature lines of a plan, derived from the fields of `BILLING_PLANS` —
 * shared by the cards on the billing page (`components/billing/plan-section`)
 * and by those on the public site (`components/marketing/pricing-plans`, MIN-73),
 * so that the two cannot say different things.
 *
 * AI usage is stated in MULTIPLES of the Free plan, never in amounts (see the
 * header comment of `lib/billing-plans.ts`).
 */
/** The namespace translator `Billing` (TYPE import: nothing enters the
 * bundle). Typed from source rather than rewritten by hand — a
 * signature `(key: string, values?: …)` accepts a placeholder key called without
 * its values, which makes the label mute on the screen instead of breaking the build. */
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
    // The guests are read with the other QUANTITIES, and on the three cards
    // (MIN-199): the line only appeared in Pro, which suggested
    // free that we never work with several people.
    plan.maxMembersPerProject == null
      ? t("featureUnlimitedMembers")
      : t("featureMaxMembers", { n: plan.maxMembersPerProject }),
    t("featureModelsUpTo", { n: plan.maxModelMultiplier }),
    ...(plan.allowAgents ? [t("featureAgents")] : []),
    // Every current plan offers provider keys for compatible AI features.
    ...(plan.allowAgents ? [t("featureByok")] : []),
  ];
}
