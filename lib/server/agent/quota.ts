import "server-only";

import { nextBillingPlanId, type BillingPlanId } from "@/lib/billing-plans";
import { getResolvedBilling } from "@/lib/server/billing-accounts";
import { getUserUsage } from "@/lib/server/usage";
import { userHasByokKey } from "./model";
import type { AiSurface } from "@/lib/ai-surfaces";
import { isManagedAiEnabled } from "@/lib/managed-services";

/**
 * Contrôle d'accès de l'agent de code (MIN-46 / MIN-10, refondu par MIN-72) :
 *  1. le PLAN doit inclure les agents (`allowAgents` — Free : non), BYOK ou pas.
 *  2. BYOK VALIDÉE → usage LLM ILLIMITÉ (à ses frais), MAIS le compute de la
 *     microVM garde son plafond (voir plus bas).
 *  3. sinon → budget d'usage mensuel du plan (USD au coût brut, TOUTES features
 *     confondues — l'ancien plafond `agent_monthly_cap_usd` est remplacé).
 *
 * La fenêtre comptée vient de lib/server/usage.ts : période Stripe courante ou
 * mois calendaire, bornée par le filigrane admin `agent_quota_resets`.
 *
 * ## Ce que le BYOK lève, et ce qu'il ne lève pas (MIN-344)
 *
 * Il levait TOUT, et il suffisait de déclarer une clé — même inventée — pour ça.
 * Deux corrections, à deux endroits :
 *  • la clé doit avoir été RECONNUE par le fournisseur (`user_ai_keys.validated_at`,
 *    posé par le probe de `byok-validate.ts`) ; `getUserByok` ignore les autres,
 *    donc `userHasByokKey` ne les voit pas non plus ;
 *  • le compute sandbox ne se lève JAMAIS. Les tokens sont payés par la clé de
 *    l'utilisateur, la microVM ne l'est pas : elle tourne sur le compte Vercel de
 *    minddy, à la minute (`SANDBOX_USD_PER_MINUTE`). Une clé perso ne peut donc
 *    pas ouvrir un robinet de compute illimité — c'était le seul plafond qui
 *    protégeait une dépense qui reste la nôtre.
 *
 * Le plafond de compute est le budget d'usage du plan, lu sur les seules lignes
 * de microVM (`sandbox_compute` + `routine_compute`). Autrement dit : un compte
 * en BYOK a droit à autant de minutes de microVM qu'un compte plateforme
 * pourrait s'en payer en dépensant tout son budget — et ses tokens à lui, en
 * plus, sans limite. C'est large, et c'est borné.
 */

/** Les lignes de ledger qui mesurent des MINUTES DE MICROVM, payées par minddy. */
const COMPUTE_FEATURES = ["sandbox_compute", "routine_compute"] as const;

export interface AgentQuota {
  allowed: boolean;
  unlimited: boolean;
  mode: "platform" | "byok";
  spent?: number;
  cap?: number;
  remaining?: number;
  /** ISO — fin de la fenêtre comptée : la date à laquelle le budget se recharge. */
  resetsAt?: string;
  /** Plan courant, et le suivant s'il en existe un au-dessus (proposition d'upgrade). */
  planId?: BillingPlanId;
  nextPlanId?: BillingPlanId | null;
  reason?: "agents_not_in_plan" | "usage_budget_exceeded" | "managed_ai_unavailable";
}

/** Décide si l'utilisateur peut lancer un run maintenant. */
export async function checkAgentQuota(
  userId: string,
  surface: Extract<AiSurface, "agent" | "automations"> = "agent",
): Promise<AgentQuota> {
  const hasByok = await userHasByokKey(userId, surface);
  // En auto-hébergement, les tokens et l'endpoint appartiennent à l'opérateur.
  // Une clé BYOK (ou un endpoint local) est donc autorisée sans lire de plan ni
  // de ledger minddy ; sans elle, on refuse avant tout appel plateforme.
  if (!isManagedAiEnabled()) {
    return hasByok
      ? { allowed: true, unlimited: true, mode: "byok" }
      : { allowed: false, unlimited: false, mode: "platform", reason: "managed_ai_unavailable" };
  }

  const { plan } = await getResolvedBilling(userId);
  if (!plan.allowAgents) {
    return {
      allowed: false,
      unlimited: false,
      mode: "platform",
      planId: plan.id,
      nextPlanId: nextBillingPlanId(plan.id),
      reason: "agents_not_in_plan",
    };
  }

  if (hasByok) {
    const usage = await getUserUsage(userId);
    const cap = plan.includedUsageUsd;
    // Les DEUX features de microVM : un run d'agent et un passage de routine
    // brûlent les mêmes minutes sur le même compte Vercel, seule la ligne de
    // facture diffère. Les compter séparément laisserait la moitié du robinet
    // ouverte.
    const compute = COMPUTE_FEATURES.reduce(
      (sum, feature) => sum + (usage.byFeature[feature] ?? 0),
      0,
    );
    const allowed = compute < cap;
    return {
      allowed,
      unlimited: true,
      mode: "byok",
      planId: plan.id,
      spent: compute,
      cap,
      remaining: Math.max(0, cap - compute),
      resetsAt: usage.period.end,
      ...(allowed ? {} : { reason: "usage_budget_exceeded" as const }),
    };
  }

  const usage = await getUserUsage(userId);
  const cap = plan.includedUsageUsd;
  const spent = usage.usedUsd;
  const allowed = spent < cap;
  return {
    allowed,
    unlimited: false,
    mode: "platform",
    spent,
    cap,
    remaining: Math.max(0, cap - spent),
    resetsAt: usage.period.end,
    planId: plan.id,
    nextPlanId: nextBillingPlanId(plan.id),
    ...(allowed ? {} : { reason: "usage_budget_exceeded" as const }),
  };
}
