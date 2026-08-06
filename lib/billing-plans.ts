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
  /**
   * Modèle le plus cher que ce plan peut CHOISIR sur le quota minddy, exprimé en
   * multiplicateur du modèle par défaut de minddy (cf. lib/model-multiplier.ts).
   *
   * Un budget en USD ne suffisait pas à protéger l'échelle : sur un plan à petit
   * budget, un modèle à ×12 le vide en trois runs, et l'utilisateur découvre le
   * plafond au moment où il tombe. Le multiplicateur, lui, se lit AVANT de
   * lancer, dans le picker, à côté de chaque modèle.
   *
   * Ne s'applique QU'au quota minddy : en BYOK l'utilisateur paye ses tokens,
   * le catalogue lui est ouvert en entier. Et jamais aux défauts de minddy
   * eux-mêmes (`agent_model`, `pr_review_model`) : l'instance répond de ses
   * propres choix, elle ne se les refuse pas.
   *
   * Ces valeurs sont ACCROCHÉES au défaut du moment. Calées sur
   * deepseek-v4-flash (~0,21 $/Mtok), elles donnent à chaque plan une frontière
   * qui se nomme : Go va jusqu'à Claude Haiku 4.5 (×14), Pro jusqu'à Sonnet 5
   * (×29) et GPT-5.2 (×38), Opus 5 (×71) reste au BYOK. Changer `agent_model`
   * en /admin déplace TOUTE l'échelle — un défaut deux fois plus cher divise
   * tous les multiplicateurs par deux et ouvre les plafonds d'autant. Le jour
   * où ça arrive, ces trois nombres se rejouent contre le nouveau baseline.
   */
  maxModelMultiplier: number;
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
    maxModelMultiplier: 5,
    maxProjects: 2,
    maxIssuesPerProject: 300,
    allowAgents: false,
    allowMembers: false,
  },
  {
    id: "go",
    priceEurMonthly: 8,
    includedUsageUsd: 5,
    maxModelMultiplier: 15,
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
    maxModelMultiplier: 40,
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

/**
 * Les features du ledger que l'utilisateur voit dans sa barre d'usage — 1:1 avec
 * `AiFeature` (lib/server/ai-usage.ts) + le CHECK de la migration, à ceci près
 * que les features internes (`import_map`, `brief_split`, `landing_demo`) n'y
 * sont pas : personne ne les lit.
 *
 * Une LISTE, pas seulement une union : c'est elle que `billing-plans.test.ts`
 * parcourt pour vérifier que chaque feature tombe dans exactement UN segment.
 * Une feature ajoutée à l'union sans segment ne lèverait rien — la barre la
 * sous-compterait en silence face au total, et l'historique la rangerait sous
 * « Numo » par repli. Le test est le seul endroit qui l'attrape ; il lui faut
 * de quoi énumérer.
 */
export const BILLABLE_FEATURES = [
  "numo_chat",
  "numo_comment",
  "dictation",
  "transcription",
  "smart_assign",
  "feedback_classify",
  "feedback_analyze",
  "feedback_voice",
  "embedding",
  "agent_code",
  "sandbox_compute",
  "web_search",
  "pr_review",
  // Une ROUTINE (MIN-185) : le même run que `agent_code`/`sandbox_compute`, sur
  // une autre ligne de facture. Cf. le segment `routines` plus bas.
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
  | "smart_assign";

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
  // La review d'une PR par Numo (MIN-141) les rejoint : c'est le même Numo qui
  // lit du code, et la ranger ailleurs ferait chercher sa dépense dans la
  // mauvaise ligne — même si le tour se paye sans microVM.
  {
    id: "agents",
    features: ["agent_code", "sandbox_compute", "pr_review"],
    barClass: "bg-violet-500",
  },
  // Les ROUTINES (MIN-185), juste après les agents — c'est à eux qu'on les
  // compare. Techniquement c'est le même run ; en facturation ce n'est pas la
  // même dépense : un run d'agent est un geste qu'on a fait, une routine est un
  // abonnement qu'on a laissé tourner, et « qu'est-ce qui a mangé mon budget ce
  // mois-ci ? » ne se répond que si les deux se lisent séparément. Tokens ET
  // minutes de microVM, sinon la séparation serait à moitié fausse.
  // `web_search` déclenchée DANS une routine reste rangée avec Numo, comme
  // celle d'un run d'agent : c'est le même tool, au même prix anecdotique.
  {
    id: "routines",
    features: ["routine_code", "routine_compute"],
    barClass: "bg-sky-500",
  },
  // La recherche web est un tool de Numo (chat, commentaires) ET des agents,
  // mais elle reste anecdotique face au reste : on la range avec Numo plutôt que
  // d'ajouter une couleur à la barre pour quelques centimes. (Les routines, à
  // l'inverse, ont mérité la leur : une dépense récurrente qu'on veut pouvoir
  // regarder seule, pas quelques centimes noyés.)
  {
    id: "numo",
    features: ["numo_chat", "numo_comment", "web_search"],
    barClass: "bg-blue-500",
  },
  { id: "dictation", features: ["dictation", "transcription"], barClass: "bg-amber-500" },
  // Les retours : le tri d'un retour à son arrivée, la dictée de celui qu'on
  // écrit, ET les embeddings, qui ne servent qu'à eux (rapprochement des
  // doublons du board public). La voix reste ici plutôt qu'avec la dictée des
  // tickets : c'est la dépense d'un retour, et c'est cette ligne-là qu'on lit
  // quand on se demande ce que coûte le board.
  {
    id: "feedback",
    features: ["feedback_classify", "feedback_analyze", "feedback_voice", "embedding"],
    barClass: "bg-emerald-500",
  },
  // Smart Assign a SA ligne, et non une moitié muette de « retours &
  // automatisations » : deux features qu'on n'arme pas ensemble, dont on ne se
  // demande pas le coût ensemble. Elle porte son nom de produit — le nom
  // « automatisations » désigne déjà les chaînes de règles (MIN-147), qui ne
  // dépensent rien en propre et se lisent dans la ligne agents, celle des runs
  // qu'elles lancent.
  { id: "smart_assign", features: ["smart_assign"], barClass: "bg-fuchsia-500" },
];

/** Multiple d'usage d'un plan vs Free (« 10× plus d'usage ») — pour l'UI, qui
    parle en pourcentages et multiples, jamais en montants USD. */
export function usageMultiplierVsFree(plan: BillingPlan): number {
  const free = getBillingPlan("free");
  if (free.includedUsageUsd <= 0) return 1;
  return Math.round(plan.includedUsageUsd / free.includedUsageUsd);
}
