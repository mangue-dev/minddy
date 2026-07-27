import { getTranslations } from "next-intl/server";
import { PricingInfoHint } from "./pricing-info-hint";
import { FeatureTable, type FeatureCell } from "./feature-table";
import {
  BILLING_PLANS,
  usageMultiplierVsFree,
  type BillingPlan,
  type BillingPlanId,
} from "@/lib/billing-plans";

/**
 * Tableau comparatif de `/pricing` (MIN-73).
 *
 * Il ne listait que les cinq champs de `BILLING_PLANS` — donc exactement ce que
 * les cartes disaient déjà juste au-dessus, et rien du produit. Il liste
 * maintenant CE QUE FAIT minddy, groupe par groupe, y compris tout ce qui est
 * inclus partout : c'est là que se voient le serveur MCP (gratuit compris) et
 * la clé d'API perso, les deux choses qu'un visiteur cherche et que les cartes
 * n'ont pas la place de porter.
 *
 * Règle inchangée, et c'est elle qui garde le tableau honnête : une ligne
 * GARDÉE PAR UN PLAN lit son état dans `BILLING_PLANS` (jamais une valeur
 * écrite à la main, sinon les cartes et le tableau divergeraient au premier
 * changement de plan) ; une ligne NON GARDÉE renvoie `true` partout, et le code
 * qui la sert n'a aucune garde de plan — vérifié une à une contre
 * `lib/server/entitlements.ts`, qui ne connaît que projets, issues, membres,
 * agents et budget d'usage.
 *
 * Le détail d'une ligne vit dans son « i » (`PricingInfoHint`) et non sous son
 * libellé : trente lignes suivies chacune de deux lignes d'explication, c'est
 * un tableau qu'on ne parcourt plus. Le survol garde l'information à portée
 * pour qui la cherche, sans la faire payer à qui balaye les colonnes.
 */

const PLAN_LABEL_KEYS: Record<BillingPlanId, "planFree" | "planGo" | "planPro"> = {
  free: "planFree",
  go: "planGo",
  pro: "planPro",
};

type Translator = (key: string, values?: Record<string, string | number>) => string;

/** `true` = inclus, `false` = absent, une chaîne = la valeur chiffrée du plan. */
type Cell = FeatureCell;

interface Row {
  /** Suffixe des clés i18n `row_<key>` et, si `hint`, `row_<key>_hint`. */
  key: string;
  hint?: boolean;
  value: (plan: BillingPlan, t: Translator) => Cell;
}

interface Group {
  /** Suffixe de la clé i18n `group_<key>`. */
  key: string;
  rows: ReadonlyArray<Row>;
}

/** Inclus dans tous les plans — aucune garde côté serveur. */
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
      // Le serveur MCP n'a AUCUNE garde de plan (app/api/mcp) : brancher ses
      // propres agents est gratuit, seul l'agent Numo est vendu.
      { key: "mcp", hint: true, value: EVERYWHERE },
      { key: "plan", hint: true, value: EVERYWHERE },
      { key: "agent", hint: true, value: (plan) => plan.allowAgents },
      // Une PR n'existe dans minddy que portée par un run d'agent
      // (`app/api/pull-requests` lit `agent_runs`) : même garde que l'agent.
      { key: "pr", hint: true, value: (plan) => plan.allowAgents },
      // BYOK lève le plafond d'usage, pas la garde de plan : `checkAgentQuota`
      // refuse un run sans `allowAgents`, clé perso ou non.
      { key: "byok", hint: true, value: (plan) => plan.allowAgents },
    ],
  },
  {
    key: "ai",
    rows: [
      {
        // Les cartes disent « 10× plus d'usage que Free » ; en cellule de
        // tableau, la phrase déborde de sa colonne sur mobile alors que la
        // comparaison, elle, tient en trois caractères. Free vaut 1× par
        // construction (c'est lui la référence de `usageMultiplierVsFree`).
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
      { key: "members", hint: true, value: (plan) => plan.allowMembers },
      // Pas un champ de plan : l'annuel n'existe que là où il y a un prix.
      { key: "annual", hint: true, value: (plan) => plan.priceEurMonthly > 0 },
    ],
  },
];

export async function PricingComparison() {
  const [t, tp] = await Promise.all([
    getTranslations("Billing"),
    getTranslations("Pricing"),
  ]);

  // Le tableau lui-même vit dans `feature-table.tsx` : les comparatifs
  // `/alternatives/<outil>` en rendent un second avec d'autres colonnes
  // (MIN-93). Ici on ne fait plus que CALCULER — et c'est ce calcul, dérivé de
  // `BILLING_PLANS` ligne par ligne, qui garde le tableau honnête.
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
        label: tp(`group_${group.key}`),
        rows: group.rows.map((row) => ({
          key: row.key,
          label: tp(`row_${row.key}`),
          hint: row.hint ? <PricingInfoHint text={tp(`row_${row.key}_hint`)} /> : undefined,
          cells: BILLING_PLANS.map((plan) => row.value(plan, t)),
        })),
      }))}
    />
  );
}
