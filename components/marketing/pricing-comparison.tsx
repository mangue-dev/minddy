import { getTranslations } from "next-intl/server";
import { PricingInfoHint } from "./pricing-info-hint";
import { FeatureTable, type FeatureCell } from "./feature-table";
import type { MessageKey } from "@/lib/i18n-keys";
import {
  BILLING_PLANS,
  usageMultiplierVsFree,
  type BillingPlan,
  type BillingPlanId,
} from "@/lib/billing-plans";

/**
 * Comparison table of `/pricing` (MIN-73).
 *
 * It only listed the five fields of `BILLING_PLANS` — so exactly what
 * the cards already said just above, and nothing about the product. It lists
 * now WHAT minddy DOES, group by group, including everything that is
 * included everywhere: this is where you see the MCP server (including free) and
 * the personal API key, the two things that a visitor is looking for and that the cards
 * have no place to porter.
 *
 * Rule unchanged, and it is this which keeps the table honest: a line
 * KEPT BY A PLAN reads its state in `BILLING_PLANS` (never a value
 * written by hand, otherwise the cards and the table would diverge at first
 * plan change); an UNGUARDED line returns `true` everywhere, and the code
 * which serves it has no plan guard — checked one by one against
 * `lib/server/entitlements.ts`, which only knows projects, issues, members,
 * agents and usage budget.
 *
 * The detail of a line lives in its "i" (`PricingInfoHint`) and not under its
 * wording: thirty lines each followed by two lines of explanation, it's
 * a table that we no longer go through. Hovering keeps information within reach
 * for those looking for it, without charging those who scan the columns.
 */

const PLAN_LABEL_KEYS: Record<BillingPlanId, "planFree" | "planGo" | "planPro"> = {
  free: "planFree",
  go: "planGo",
  pro: "planPro",
};

/** The translator of the `Billing` namespace, typed from the source. A signature
 * house `(key: string, values?: …)` would accept a non-existent key or a
 * message to placeholder called without its values. */
type Translator = Awaited<ReturnType<typeof getTranslations<"Billing">>>;

/** `true` = included, `false` = absent, a string = the encrypted value of the plan. */
type Cell = FeatureCell;

interface Row {
  /** i18n key suffix `row_<key>` and, if `hint`, `row_<key>_hint`. */
  key: string;
  hint?: boolean;
  value: (plan: BillingPlan, t: Translator) => Cell;
}

interface Group {
  /** i18n key suffix `group_<key>`. */
  key: string;
  rows: ReadonlyArray<Row>;
}

/** Included in all plans — no server-side guarding. */
const EVERYWHERE = () => true;

const GROUPS: ReadonlyArray<Group> = [
  {
    key: "tracker",
    rows: [
      {
        key: "projects",
        value: (plan, t) => (plan.maxProjects == null ? t("unlimited") : String(plan.maxProjects)),
      },
      {
        key: "issues",
        value: (plan, t) =>
          plan.maxIssuesPerProject == null ? t("unlimited") : String(plan.maxIssuesPerProject),
      },
      { key: "views", hint: true, value: EVERYWHERE },
      { key: "objectives", hint: true, value: EVERYWHERE },
      { key: "cycles", hint: true, value: EVERYWHERE },
      { key: "triage", hint: true, value: EVERYWHERE },
      { key: "relations", hint: true, value: EVERYWHERE },
      { key: "comments", hint: true, value: EVERYWHERE },
      { key: "scratchpad", hint: true, value: EVERYWHERE },
      { key: "inbox", hint: true, value: EVERYWHERE },
      { key: "palette", hint: true, value: EVERYWHERE },
      { key: "stats", hint: true, value: EVERYWHERE },
      { key: "realtime", hint: true, value: EVERYWHERE },
    ],
  },
  {
    key: "agents",
    rows: [
      // The MCP server has NO plan guard (app/api/mcp): connect its
      // own agents is free, only the Numo agent is sold.
      { key: "mcp", hint: true, value: EVERYWHERE },
      { key: "plan", hint: true, value: EVERYWHERE },
      { key: "agent", hint: true, value: (plan) => plan.allowAgents },
      // A PR only exists in minddy carried by an agent run
      // (`app/api/pull-requests` reads `agent_runs`): same guard as the agent.
      { key: "pr", hint: true, value: (plan) => plan.allowAgents },
      // BYOK raises the usage cap, not the plan guard: `checkAgentQuota`
      // refuse a run without `allowAgents`, personal key or not.
      { key: "byok", hint: true, value: (plan) => plan.allowAgents },
    ],
  },
  {
    key: "ai",
    rows: [
      {
        // The cards say “10x more usage than Free”; in cell of
        // table, the sentence overflows its column on mobile while the
        // comparison, it takes three characters. Free is worth 1× per
        // construction (this is the reference for `usageMultiplierVsFree`).
        key: "usage",
        hint: true,
        value: (plan) => `${usageMultiplierVsFree(plan)}×`,
      },
      { key: "numo", hint: true, value: EVERYWHERE },
      { key: "dictation", hint: true, value: EVERYWHERE },
      { key: "overage", hint: true, value: EVERYWHERE },
    ],
  },
  {
    key: "feedback",
    rows: [
      { key: "board", hint: true, value: EVERYWHERE },
      { key: "moderation", hint: true, value: EVERYWHERE },
      { key: "feedbackStatus", hint: true, value: EVERYWHERE },
      { key: "sso", hint: true, value: EVERYWHERE },
      { key: "domain", hint: true, value: EVERYWHERE },
    ],
  },
  {
    key: "open",
    rows: [
      { key: "share", hint: true, value: EVERYWHERE },
      { key: "import", hint: true, value: EVERYWHERE },
      { key: "api", hint: true, value: EVERYWHERE },
    ],
  },
  {
    key: "team",
    rows: [
      {
        key: "members",
        hint: true,
        value: (plan, t) =>
          plan.maxMembersPerProject == null
            ? t("unlimited")
            : String(plan.maxMembersPerProject),
      },
      // Not a plan field: the annual only exists where there is a price.
      { key: "annual", hint: true, value: (plan) => plan.priceEurMonthly > 0 },
    ],
  },
];

export async function PricingComparison() {
  const [t, tp] = await Promise.all([
    getTranslations("Billing"),
    getTranslations("Pricing"),
  ]);

  // The table itself lives in `feature-table.tsx`: comparisons
  // `/alternatives/<outil>` return a second one with other columns
  // (MIN-93). Here we only do CALCULATE — and it is this calculation, derived from
  // `BILLING_PLANS` row by row, which keeps the table honest.
  return (
    <FeatureTable
      caption={tp("comparisonTitle")}
      includedLabel={t("included")}
      notIncludedLabel={t("notIncluded")}
      columns={BILLING_PLANS.map((plan) => ({
        key: plan.id,
        label: t(PLAN_LABEL_KEYS[plan.id]),
        highlighted: plan.highlighted,
      }))}
      groups={GROUPS.map((group) => ({
        key: group.key,
        label: tp(`group_${group.key}` as MessageKey<"Pricing">),
        rows: group.rows.map((row) => ({
          key: row.key,
          label: tp(`row_${row.key}` as MessageKey<"Pricing">),
          hint: row.hint ? (
            <PricingInfoHint text={tp(`row_${row.key}_hint` as MessageKey<"Pricing">)} />
          ) : undefined,
          cells: BILLING_PLANS.map((plan) => row.value(plan, t)),
        })),
      }))}
    />
  );
}
