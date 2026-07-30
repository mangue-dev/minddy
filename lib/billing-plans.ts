/**
 * Plans & billing (MIN-72) — la source de vérité des plans, côté partagé
 * (importable client ET serveur, aucune dépendance server-only).
 *
 * Modèle : chaque plan inclut un BUDGET D'USAGE mensuel en USD, décompté au
 * COÛT BRUT (le coût OpenRouter/Vercel réel, sans surcharge par action — la
 * marge est sur le prix de l'abonnement). Le ledger `ai_usage` fournit le
 * dépensé ; la fenêtre est la période Stripe courante (ou le mois calendaire
 * pour les comptes free). Prix affichés en EUR, budgets en USD (la devise des
 * coûts rapportés par OpenRouter).
 */

export type BillingPlanId = "free" | "go" | "pro";

/** Cadence de facturation d'un abonnement (= `recurring.interval` côté Stripe). */
export type BillingInterval = "month" | "year";

export interface BillingPlan {
  id: BillingPlanId;
  /** Prix d'affichage (le prix facturé vient du price Stripe configuré en env). */
  priceEurMonthly: number;
  /** Budget d'usage IA mensuel inclus, en USD de coût brut. */
  includedUsageUsd: number;
  /** null = illimité. */
  maxProjects: number | null;
  /** null = illimité. */
  maxIssuesPerProject: number | null;
  /** Accès aux agents de code (lancement de runs sur la clé plateforme ou BYOK). */
  allowAgents: boolean;
  /** Travail en équipe : inviter des membres dans ses projets. */
  allowMembers: boolean;
  /** Plan mis en avant dans l'UI. */
  highlighted?: boolean;
}

export const BILLING_PLANS: BillingPlan[] = [
  {
    id: "free",
    priceEurMonthly: 0,
    includedUsageUsd: 0.5,
    maxProjects: 2,
    maxIssuesPerProject: 300,
    allowAgents: false,
    allowMembers: false,
  },
  {
    id: "go",
    priceEurMonthly: 8,
    includedUsageUsd: 5,
    maxProjects: null,
    maxIssuesPerProject: null,
    allowAgents: true,
    allowMembers: false,
    highlighted: true,
  },
  {
    id: "pro",
    priceEurMonthly: 20,
    includedUsageUsd: 15,
    maxProjects: null,
    maxIssuesPerProject: null,
    allowAgents: true,
    allowMembers: true,
  },
];
// Un plan « Ultra » (~100-200 €, gros budget d'usage) est envisagé : l'ajouter
// ici + un price Stripe suffit, tout le reste est piloté par ces champs.

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

/** Rang pour comparer les plans (upgrade vs manage dans l'UI). */
export function billingPlanRank(id: BillingPlanId): number {
  return BILLING_PLANS.findIndex((plan) => plan.id === id);
}

/**
 * Le plan à PROPOSER à quelqu'un qui a épuisé son budget d'usage : le premier
 * au-dessus qui donne réellement PLUS de budget et qui autorise les agents.
 * `null` = il n'y en a pas — l'utilisateur est au sommet de l'échelle, et la
 * carte de budget épuisé ne doit alors proposer que d'attendre ou de passer en
 * BYOK. Proposer un upgrade qui n'existe pas serait une impasse.
 *
 * Le jour où un plan « Ultra » s'ajoute à `BILLING_PLANS`, il est proposé tout
 * seul — rien d'autre à câbler.
 */
export function nextBillingPlanId(current: BillingPlanId): BillingPlanId | null {
  const budget = getBillingPlan(current).includedUsageUsd;
  const better = BILLING_PLANS.slice(billingPlanRank(current) + 1).find(
    (plan) => plan.allowAgents && plan.includedUsageUsd > budget,
  );
  return better?.id ?? null;
}

// ── Facturation annuelle ─────────────────────────────────────────────────────

/** Mois offerts sur l'annuel : on facture 10 mois pour 12 (2 mois offerts). */
export const ANNUAL_FREE_MONTHS = 2;
export const ANNUAL_BILLED_MONTHS = 12 - ANNUAL_FREE_MONTHS;

/** Prix annuel d'affichage (le prix facturé vient du price Stripe annuel). */
export function annualPriceEur(plan: BillingPlan): number {
  return plan.priceEurMonthly * ANNUAL_BILLED_MONTHS;
}

/** Coût mensuel équivalent d'un abonnement annuel, arrondi au centime. */
export function annualMonthlyEquivalentEur(plan: BillingPlan): number {
  return Math.round((annualPriceEur(plan) / 12) * 100) / 100;
}

// ── Coûts non-LLM ────────────────────────────────────────────────────────────

/**
 * Approximation du coût Vercel Sandbox par minute de wall-clock d'un run agent
 * (CPU actif + mémoire provisionnée, majoritairement en attente du LLM).
 * À recaler sur les factures réelles.
 */
export const SANDBOX_USD_PER_MINUTE = 0.002;

// ── Segments d'affichage de l'usage ─────────────────────────────────────────

/** 1:1 avec `AiFeature` (lib/server/ai-usage.ts) + le CHECK de la migration. */
export type BillableFeature =
  | "numo_chat"
  | "numo_comment"
  | "dictation"
  | "transcription"
  | "smart_assign"
  | "feedback_classify"
  | "feedback_analyze"
  | "embedding"
  | "agent_code"
  | "sandbox_compute"
  | "web_search";

export type UsageSegmentId = "agents" | "numo" | "dictation" | "feedback";

export interface UsageSegment {
  id: UsageSegmentId;
  features: BillableFeature[];
  /** Classe Tailwind du remplissage de la barre + de la pastille de légende. */
  barClass: string;
}

/**
 * Le regroupement typé montré à l'utilisateur (« 5 % sur les agents, 2 % sur la
 * dictée… ») : la barre unifiée du header et de la page billing tuile ces
 * segments dans cet ordre.
 */
export const USAGE_SEGMENTS: UsageSegment[] = [
  // LLM + compute sandbox d'un même run : pour l'utilisateur, c'est UN agent.
  {
    id: "agents",
    features: ["agent_code", "sandbox_compute"],
    barClass: "bg-violet-500",
  },
  // La recherche web est un tool de Numo (chat, commentaires) ET des agents,
  // mais elle reste anecdotique face au reste : on la range avec Numo plutôt que
  // d'ajouter une 5e couleur à la barre pour quelques centimes.
  {
    id: "numo",
    features: ["numo_chat", "numo_comment", "web_search"],
    barClass: "bg-blue-500",
  },
  { id: "dictation", features: ["dictation", "transcription"], barClass: "bg-amber-500" },
  {
    id: "feedback",
    features: ["feedback_classify", "feedback_analyze", "embedding", "smart_assign"],
    barClass: "bg-emerald-500",
  },
];

/** Multiple d'usage d'un plan vs Free (« 10× plus d'usage ») — pour l'UI, qui
    parle en pourcentages et multiples, jamais en montants USD. */
export function usageMultiplierVsFree(plan: BillingPlan): number {
  const free = getBillingPlan("free");
  if (free.includedUsageUsd <= 0) return 1;
  return Math.round(plan.includedUsageUsd / free.includedUsageUsd);
}
