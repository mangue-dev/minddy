import { getTranslations } from "next-intl/server";
import { Check, Minus } from "lucide-react";
import { cn } from "mangue-ui";
import {
  BILLING_PLANS,
  usageMultiplierVsFree,
  type BillingPlan,
  type BillingPlanId,
} from "@/lib/billing-plans";

/**
 * Tableau comparatif de `/pricing` (MIN-73) : une ligne par limite réellement
 * appliquée par le produit, lue directement dans `BILLING_PLANS`. Rien
 * d'inventé — si une ligne existe ici, un champ la porte dans le code.
 */

const PLAN_LABEL_KEYS: Record<BillingPlanId, "planFree" | "planGo" | "planPro"> = {
  free: "planFree",
  go: "planGo",
  pro: "planPro",
};

type Cell = string | boolean;

type Row = {
  key: string;
  /** Libellé de la ligne, dans le namespace Billing. */
  labelKey: "limitProjects" | "limitIssuesPerProject" | "limitAgents" | "limitMembers" | "usageTitle";
  value: (plan: BillingPlan, t: (key: string, values?: Record<string, string | number>) => string) => Cell;
};

const ROWS: ReadonlyArray<Row> = [
  {
    key: "usage",
    labelKey: "usageTitle",
    value: (plan, t) =>
      plan.id === "free"
        ? t("featureBaseUsage")
        : t("featureUsageMultiplier", { n: usageMultiplierVsFree(plan) }),
  },
  {
    key: "projects",
    labelKey: "limitProjects",
    value: (plan, t) => (plan.maxProjects == null ? t("unlimited") : String(plan.maxProjects)),
  },
  {
    key: "issues",
    labelKey: "limitIssuesPerProject",
    value: (plan, t) =>
      plan.maxIssuesPerProject == null ? t("unlimited") : String(plan.maxIssuesPerProject),
  },
  { key: "agents", labelKey: "limitAgents", value: (plan) => plan.allowAgents },
  { key: "members", labelKey: "limitMembers", value: (plan) => plan.allowMembers },
];

export async function PricingComparison() {
  const t = await getTranslations("Billing");

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-sm">
        <thead>
          <tr>
            <th className="w-1/3 pb-4 text-left text-xs font-medium text-muted-foreground">
              <span className="sr-only">{t("plansTitle")}</span>
            </th>
            {BILLING_PLANS.map((plan) => (
              <th
                key={plan.id}
                className={cn(
                  "pb-4 text-center font-semibold",
                  plan.highlighted && "text-primary",
                )}
              >
                {t(PLAN_LABEL_KEYS[plan.id])}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.key} className="border-t border-border">
              <th scope="row" className="py-4 pr-4 text-left font-normal text-muted-foreground">
                {t(row.labelKey)}
              </th>
              {BILLING_PLANS.map((plan) => {
                const cell = row.value(plan, t);
                return (
                  // `relative` : les libellés sr-only sont en position absolue.
                  // Sans bloc conteneur local, ils se positionnent par rapport
                  // au document et échappent au défilement horizontal du
                  // tableau — la page entière déborderait sur mobile.
                  <td key={plan.id} className="relative py-4 text-center">
                    {typeof cell === "boolean" ? (
                      cell ? (
                        <>
                          <Check
                            className="mx-auto h-4 w-4 text-primary"
                            strokeWidth={3}
                            aria-hidden
                          />
                          <span className="sr-only">{t("included")}</span>
                        </>
                      ) : (
                        <>
                          <Minus className="mx-auto h-4 w-4 text-muted-foreground/50" aria-hidden />
                          <span className="sr-only">{t("notIncluded")}</span>
                        </>
                      )
                    ) : (
                      <span className="text-foreground/90">{cell}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
