/**
 * Plans & billing (MIN-72) — the source of truth for plans, shared side
 * (importable client AND server, no server-only dependency).
 *
 * Model: each plan includes a monthly USAGE BUDGET in USD, deducted as
 * GROSS COST (the actual OpenRouter/Vercel cost, without overhead per action — the
 * margin is on the subscription price). The ledger `ai_usage` provides the
 * spent ; window is the current Stripe period (or calendar month
 * for free accounts). Prices displayed in EUR, budgets in USD (the currency of
 * costs reported by OpenRouter).
 */

export type BillingPlanId = "free" | "go" | "pro";

/** Billing rate for a subscription (= `recurring.interval` on the Stripe side). */
export type BillingInterval = "month" | "year";

export interface BillingPlan {
  id: BillingPlanId;
  /** Display price (the price charged comes from the Stripe price configured in approx). */
  priceEurMonthly: number;
  /** Monthly AI usage budget included, in gross cost USD. */
  includedUsageUsd: number;
  /**
   * The most expensive model that this plan can CHOOSE on the minddy quota, expressed in
   * minddy's default model multiplier (see lib/model-multiplier.ts).
   *
   * A USD budget was not enough to protect scale: on a small scale
   * budget, a ×12 model empties it in three runs, and the user discovers the
   * ceiling as it falls. The multiplier is read BEFORE
   * throw, in the picker, next to each model.
   *
   * ONLY applies to the minddy quota: in BYOK the user pays for their tokens,
   * the entire catalog is open to him. And never minddy's faults
   * themselves (`agent_model`, `pr_review_model`): the instance responds to its
   * her own choices, she does not refuse them.
   *
   * These values ​​are HOOKED to the current default. Propped on
   * deepseek-v4-flash (~$0.21/Mtok), they give each plane a boundary
   * which is called: Go goes up to Claude Haiku 4.5 (×14), Pro up to Sonnet 5
   * (×29) and GPT-5.2 (×38), Opus 5 (×71) remains BYOK. Change `agent_model`
   * en /admin moves the WHOLE scale — a default twice as expensive divides
   * all multipliers by two and opens the caps by that much. The day
   * where it happens, these three numbers are replayed against the new baseline.
   */
  maxModelMultiplier: number;
  /**
   * BYTES that projects in this account can hold in storage —
   * ticket attachments and page files combined (MIN-348).
   *
   * The only product cap that TypeScript doesn't enforce: sending
   * leaves the browser DIRECTLY to the bucket, with the JWT of its author, and
   * does not cross any of our roads. So this is the policy `attachments insert`
   * (migration 20261229090000) which applies it, reading the table
   * `plan_storage_quotas`. These three numbers and this table must say the
   * same thing — `lib/billing-plans.test.ts` checks it by reading the SQL.
   *
   * The imputation follows that of AI use: what counts is the OWNER of the
   * project where the file lands, not the member who dropped it.
   */
  maxStorageBytes: number;
  /** null = unlimited. */
  maxProjects: number | null;
  /** null = unlimited. */
  maxIssuesPerProject: number | null;
  /** Access to code agents (launch of runs on the platform key or BYOK). */
  allowAgents: boolean;
  /**
   * Guests per project — the people we bring in, the OWNER NOT INCLUDED
   * (“3 guests” = three people in addition to yourself). `null` = unlimited.
   *
   * Collaboration is part of the product, not a paid capability. The Free plan
   * has a small team cap; every paid plan is unlimited.
   */
  maxMembersPerProject: number | null;
  /** Plan highlighted in the UI. */
  highlighted?: boolean;
}

export const BILLING_PLANS: BillingPlan[] = [
  {
    id: "free",
    priceEurMonthly: 0,
    includedUsageUsd: 0.5,
    maxModelMultiplier: 1,
    maxStorageBytes: 1 * 1024 * 1024 * 1024, // 1 Go
    maxProjects: 2,
    maxIssuesPerProject: 300,
    allowAgents: true,
    maxMembersPerProject: 3,
  },
  {
    id: "go",
    priceEurMonthly: 8,
    includedUsageUsd: 5,
    maxModelMultiplier: 15,
    maxStorageBytes: 20 * 1024 * 1024 * 1024, // 20 Go
    maxProjects: null,
    maxIssuesPerProject: null,
    allowAgents: true,
    maxMembersPerProject: null,
    highlighted: true,
  },
  {
    id: "pro",
    priceEurMonthly: 20,
    includedUsageUsd: 15,
    maxModelMultiplier: 40,
    maxStorageBytes: 100 * 1024 * 1024 * 1024, // 100 Go
    maxProjects: null,
    maxIssuesPerProject: null,
    allowAgents: true,
    maxMembersPerProject: null,
  },
];
// An “Ultra” plan (~100-200 €, large usage budget) is considered: add it
// here + a Stripe price is enough, everything else is driven by these fields.

export const DEFAULT_BILLING_PLAN_ID: BillingPlanId = "free";

export function getBillingPlan(id: BillingPlanId): BillingPlan {
  return BILLING_PLANS.find((plan) => plan.id === id) ?? BILLING_PLANS[0];
}

export function coerceBillingPlanId(value: unknown): BillingPlanId | null {
  return typeof value === "string" &&
    BILLING_PLANS.some((plan) => plan.id === value)
    ? (value as BillingPlanId)
    : null;
}

/** Rank to compare plans (upgrade vs manage in the UI). */
export function billingPlanRank(id: BillingPlanId): number {
  return BILLING_PLANS.findIndex((plan) => plan.id === id);
}

/**
 * The plan to PROPOSE to someone who has exhausted their usage budget: the first
 * above which actually gives MORE budget and which authorizes agents.
 * `null` = there is none — the user is at the top of the ladder, and the
 * exhausted budget card must then only suggest waiting or switching to
 * BYOK. Proposing an upgrade that does not exist would be a dead end.
 *
 * The day an “Ultra” plan is added to `BILLING_PLANS`, it is offered all
 * alone — nothing else to wire.
 */
export function nextBillingPlanId(current: BillingPlanId): BillingPlanId | null {
  const budget = getBillingPlan(current).includedUsageUsd;
  const better = BILLING_PLANS.slice(billingPlanRank(current) + 1).find(
    (plan) => plan.allowAgents && plan.includedUsageUsd > budget,
  );
  return better?.id ?? null;
}

// ── Facturation annuelle ─────────────────────────────────────────────────────

/** Months offered on the annual: we charge 10 months for 12 (2 months offered). */
export const ANNUAL_FREE_MONTHS = 2;
export const ANNUAL_BILLED_MONTHS = 12 - ANNUAL_FREE_MONTHS;

/** Annual display price (the price charged comes from the annual Stripe price). */
export function annualPriceEur(plan: BillingPlan): number {
  return plan.priceEurMonthly * ANNUAL_BILLED_MONTHS;
}

/** Equivalent monthly cost of an annual subscription, rounded to the nearest cent. */
export function annualMonthlyEquivalentEur(plan: BillingPlan): number {
  return Math.round((annualPriceEur(plan) / 12) * 100) / 100;
}

// ── Non-LLM costs ────────────────────────────── ──────────────────────────────

/**
 * Approximation of the Vercel Sandbox cost per minute of wall-clock of an agent run
 * (Active CPU + provisioned memory, mostly waiting for LLM).
 * To be adjusted on the actual invoices.
 */
export const SANDBOX_USD_PER_MINUTE = 0.002;

// ── Segments d'affichage de l'usage ─────────────────────────────────────────

/**
 * The ledger features that the user sees in their usage bar — 1:1 with
 * `AiFeature` (lib/server/ai-usage.ts) + the CHECK of the migration, except for this
 * that the internal features (`import_map`, `brief_split`, `landing_demo`) are not
 * are not: no one reads them.
 *
 * A LIST, not just a union: it is this that `billing-plans.test.ts`
 * scans to verify that each feature falls into exactly ONE segment.
 * A feature added to the union without a segment would not raise anything — the bar
 * would silently undercount the total, and the history would file it under
 * “Numo” by fallback. The test is the only place that catches it; he needs
 * enough to list.
 */
export const BILLABLE_FEATURES = [
  "numo_chat",
  "numo_comment",
  "dictation",
  "transcription",
  "smart_assign",
  "smart_fill",
  "feedback_classify",
  "feedback_analyze",
  "feedback_voice",
  "embedding",
  "agent_code",
  "sandbox_compute",
  "web_search",
  "pr_review",
  // A ROUTINE (MIN-185): the same run as `agent_code`/`sandbox_compute`, on
  // another invoice line. See the `routines` segment below.
  "routine_code",
  "routine_compute",
] as const;

export type BillableFeature = (typeof BILLABLE_FEATURES)[number];

export type UsageSegmentId =
  | "agents"
  | "routines"
  | "numo"
  | "dictation"
  | "feedback"
  | "automations";

export interface UsageSegment {
  id: UsageSegmentId;
  features: BillableFeature[];
  /** Tailwind class of bar filling + legend patch. */
  barClass: string;
}

/**
 * The typed grouping shown to the user (“5% on agents, 2% on
 * dictation…”): the unified bar of the header and the page billing tiles these
 * segments in this order.
 */
export const USAGE_SEGMENTS: UsageSegment[] = [
  // LLM + compute sandbox of the same run: for the user, it is ONE agent.
  // The review of a PR by Numo (MIN-141) joins them: it is the same Numo who
  // reads the code, and storing it elsewhere would cause its expense to be found in the
  // bad line — even if the trick is paid without microVM.
  {
    id: "agents",
    features: ["agent_code", "sandbox_compute", "pr_review"],
    barClass: "bg-violet-500",
  },
  // The ROUTINES (MIN-185), just after the agents — we give them to them
  // compared. Technically it's the same run; in billing this is not the
  // same expense: an agent run is a gesture that we made, a routine is a
  // subscription that we let run, and “what ate my budget this
  // month? » is only answered if the two are read separately. ET Tokens
  // minutes of microVM, otherwise the separation would be half wrong.
  // `web_search` triggered IN a routine remains stored with Numo, like
  // that of an agent run: it's the same tool, at the same anecdotal price.
  {
    id: "routines",
    features: ["routine_code", "routine_compute"],
    barClass: "bg-sky-500",
  },
  // Web search is a Numo tool (chat, comments) AND agents,
  // but it remains anecdotal compared to the rest: we place it with Numo rather than
  // to add a color to the bar for a few cents. (Routines,
  // the opposite, have deserved theirs: a recurring expense that we want to be able to
  // look alone, not a few pennies drowned.)
  {
    id: "numo",
    features: ["numo_chat", "numo_comment", "web_search"],
    barClass: "bg-blue-500",
  },
  { id: "dictation", features: ["dictation", "transcription"], barClass: "bg-amber-500" },
  // Returns: the sorting of a return upon its arrival, the dictation of the one we
  // written, AND the embeddings, which only serve them (reconciliation of
  // duplicates of the public board). The voice remains here rather than with the dictation of
  // tickets: this is the expense of a return, and it is this line that we read
  // when you wonder what the board costs.
  {
    id: "feedback",
    features: ["feedback_classify", "feedback_analyze", "feedback_voice", "embedding"],
    barClass: "bg-emerald-500",
  },
  // FORM AUTOMATIONS: what minddy fills out for you
  // moment the ticket is born — who takes it (Smart Assign, MIN-31) and what it
  // is (Smart-fill, MIN-260). Two features, one line: we don’t arm them
  // together, but we wonder their cost together, because it is the same
  // question — “what does it cost me to no longer fill out my tickets?” ".
  //
  // The line was called "Smart Assign", and the commentary at the time dismissed
  // expressly the word “automations”, which already designates chains of rules
  // (MIN-147). He always points to it — but these channels spend nothing on
  // own: their cost is that of the runs they launch, and it can be read in the
  // agent line. The word was therefore free, and with two features the name of a
  // single product hid the other half of the line.
  {
    id: "automations",
    features: ["smart_assign", "smart_fill"],
    barClass: "bg-fuchsia-500",
  },
];

/** Multiple usage of a plan vs. Free (“10× more usage”) — for the UI, which
    speaks in percentages and multiples, never in USD amounts. */
export function usageMultiplierVsFree(plan: BillingPlan): number {
  const free = getBillingPlan("free");
  if (free.includedUsageUsd <= 0) return 1;
  return Math.round(plan.includedUsageUsd / free.includedUsageUsd);
}
