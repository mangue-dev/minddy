import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import {
  SANDBOX_USD_PER_MINUTE,
  USAGE_SEGMENTS,
  type BillableFeature,
  type UsageSegmentId,
} from "@/lib/billing-plans";
import {
  getResolvedBilling,
  shouldUseStripePlan,
  type ResolvedBilling,
} from "@/lib/server/billing-accounts";
import { resolveUsageWindow } from "@/lib/billing-cycle";
import { PlanLimitError } from "@/lib/server/plan-limit-error";
import {
  recordAiUsage,
  type AiFeature,
  type AiUsageBillTo,
} from "@/lib/server/ai-usage";
import type { AiSurface } from "@/lib/ai-surfaces";
import { usesByokForSurface } from "@/lib/server/ai-runtime";
import { isManagedAiEnabled } from "@/lib/managed-services";

/**
 * Budget d'usage (MIN-72) — le dépensé d'un user sur la fenêtre courante,
 * agrégé depuis le ledger `ai_usage` (coût brut USD, ventilé par feature).
 *
 * Fenêtre : le cycle de facturation Stripe pour les abonnés (annuel → sous-cycle
 * MENSUEL, l'usage se réinitialise chaque mois même en paiement annuel), sinon
 * le mois calendaire UTC ; bornée par le filigrane `agent_quota_resets` (remise
 * à zéro admin — s'applique au budget entier, plus seulement aux agents). Ce
 * filigrane est un REGISTRE : plusieurs remises à zéro peuvent coexister sur une
 * même période, et c'est la PLUS RÉCENTE qui borne la fenêtre.
 *
 * Enforcement : `ensureUsageBudget` en PRÉ-VOL avant chaque action coûtante ;
 * l'enregistrement reste post-hoc best-effort (`recordAiUsage` ne throw
 * jamais) — un léger dépassement sur la dernière action est assumé, comme chez
 * Claude/ChatGPT. Pas de fenêtre 5 h / hebdo en v1 (les rate-limits de session
 * restent la garde anti-rafale).
 */

export interface UsagePeriod {
  start: string;
  end: string;
}

export interface UserUsage {
  billing: ResolvedBilling;
  period: UsagePeriod;
  usedUsd: number;
  byFeature: Partial<Record<BillableFeature, number>>;
}

function monthWindow(now = new Date()): UsagePeriod {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * La PÉRIODE DE FACTURATION de ce user, avant tout filigrane — c'est elle qui
 * borne le registre des remises à zéro (« combien en a-t-on déjà offert sur
 * cette période ? »), là où `getUsagePeriod` répond à « depuis quand compte-t-on
 * vraiment ? ».
 *
 * Cycle Stripe dès qu'un abonnement ACTIF porte ses dates, indépendamment de la
 * source du plan effectif : un override admin peut coexister avec un vrai
 * abonnement, et c'est alors le cycle (pas le mois calendaire) qui borne
 * l'usage. Annuel → sous-cycle MENSUEL : l'usage se réinitialise chaque mois
 * même quand le paiement est annuel.
 */
export function getBillingWindow(billing: ResolvedBilling): UsagePeriod {
  const account = billing.account;
  if (
    account?.stripe_current_period_start &&
    account.stripe_current_period_end &&
    shouldUseStripePlan(account.stripe_subscription_status)
  ) {
    const window = resolveUsageWindow({
      periodStart: account.stripe_current_period_start,
      periodEnd: account.stripe_current_period_end,
    });
    if (window) return window;
  }
  return monthWindow();
}

/**
 * Le dernier filigrane posé sur ce compte.
 *
 * `agent_quota_resets` est un REGISTRE : un admin peut en poser plusieurs sur
 * une même période, et c'est la remise à zéro la PLUS RÉCENTE qui fixe le début
 * de la fenêtre comptée — les précédentes sont déjà derrière elle, elles ne
 * peuvent plus rien libérer.
 */
export async function latestQuotaResetAt(userId: string): Promise<string | null> {
  const service = getServiceClient();
  const { data } = await service
    .from("agent_quota_resets")
    .select("reset_at")
    .eq("user_id", userId)
    .order("reset_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { reset_at?: string } | null)?.reset_at ?? null;
}

/** La fenêtre comptée par le budget de ce user. */
export async function getUsagePeriod(
  userId: string,
  billing: ResolvedBilling
): Promise<UsagePeriod> {
  const { start, end } = getBillingWindow(billing);
  const resetAt = await latestQuotaResetAt(userId);
  return { start: resetAt && resetAt > start ? resetAt : start, end };
}

interface UsageRpcRow {
  feature: string;
  cost: number | string;
  calls: number;
  runs: number;
}

function roundUsd(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/** Dépensé + ventilation par feature du user sur sa fenêtre courante. */
export async function getUserUsage(userId: string): Promise<UserUsage> {
  const billing = await getResolvedBilling(userId);
  const period = await getUsagePeriod(userId, billing);

  const service = getServiceClient();
  const { data, error } = await service.rpc("get_user_usage_since", {
    p_user_id: userId,
    p_since: period.start,
  });
  if (error) throw new Error(error.message);

  const parsed = (data ?? {}) as {
    total_cost?: number | string;
    by_feature?: UsageRpcRow[];
  };
  const byFeature: Partial<Record<BillableFeature, number>> = {};
  for (const row of parsed.by_feature ?? []) {
    byFeature[row.feature as BillableFeature] = roundUsd(Number(row.cost) || 0);
  }

  return {
    billing,
    period,
    usedUsd: roundUsd(Number(parsed.total_cost) || 0),
    byFeature,
  };
}

/** Ventile `byFeature` sur les segments d'affichage, dans l'ordre de la barre. */
export function segmentizeUsage(
  byFeature: Partial<Record<BillableFeature, number>>
): Array<{ id: UsageSegmentId; usd: number }> {
  return USAGE_SEGMENTS.map((segment) => ({
    id: segment.id,
    usd: roundUsd(
      segment.features.reduce((sum, feature) => sum + (byFeature[feature] ?? 0), 0)
    ),
  }));
}

/**
 * Check pré-vol : budget restant → l'usage courant ; épuisé → 403
 * `usage_budget_exceeded`. Retourne l'usage pour éviter un second fetch.
 */
export async function ensureUsageBudget(
  userId: string,
  surface?: AiSurface,
): Promise<UserUsage> {
  const usage = await getUserUsage(userId);
  if (!isManagedAiEnabled()) return usage;
  if (surface && (await usesByokForSurface(userId, surface))) return usage;
  const included = usage.billing.plan.includedUsageUsd;
  if (usage.usedUsd >= included) {
    throw new PlanLimitError("usage_budget_exceeded", {
      used: roundUsd(usage.usedUsd),
      included,
    });
  }
  return usage;
}

/** Variante booléenne pour les jobs de fond (cron feedback, smart assign). */
export async function hasUsageBudget(userId: string, surface?: AiSurface): Promise<boolean> {
  try {
    if (!isManagedAiEnabled()) return true;
    if (surface && (await usesByokForSurface(userId, surface))) return true;
    const usage = await getUserUsage(userId);
    return usage.usedUsd < usage.billing.plan.includedUsageUsd;
  } catch (err) {
    // Best-effort : un échec de lecture ne doit pas éteindre les jobs de fond.
    console.error("[usage] budget check failed:", (err as Error).message);
    return true;
  }
}

/**
 * Budget du OWNER d'un projet — pour l'IA du feedback board (cron, posts
 * publics) : c'est le owner qui paye, pas le visiteur. Best-effort (true si
 * le projet est introuvable) : ne jamais casser un flux public sur un doute.
 */
export async function ownerHasUsageBudget(
  projectId: string,
  surface?: AiSurface,
): Promise<boolean> {
  try {
    const service = getServiceClient();
    const { data } = await service
      .from("projects")
      .select("owner_id")
      .eq("id", projectId)
      .maybeSingle();
    const ownerId = (data as { owner_id?: string } | null)?.owner_id;
    if (!ownerId) return true;
    return await hasUsageBudget(ownerId, surface);
  } catch (err) {
    console.error("[usage] owner budget check failed:", (err as Error).message);
    return true;
  }
}

/**
 * Métrage du compute Vercel Sandbox d'un run agent : wall-clock × $/min, une
 * ligne au ledger (provider 'vercel'). `seq` doit être unique dans le run côté
 * appelant (une ligne par tranche de drain).
 *
 * `feature` distingue la microVM d'un run d'agent (`sandbox_compute`, le
 * défaut) de celle d'un passage de ROUTINE (`routine_compute`, MIN-185) — les
 * deux moitiés d'une dépense de routine, tokens et minutes, se rangent sous le
 * même segment ou la séparation ne veut rien dire.
 */
export async function recordSandboxUsage(params: {
  runId: string;
  seq: number;
  billTo: AiUsageBillTo;
  feature?: Extract<AiFeature, "sandbox_compute" | "routine_compute">;
  projectId: string | null;
  durationMs: number;
}): Promise<void> {
  const minutes = params.durationMs / 60_000;
  const cost = roundUsd(minutes * SANDBOX_USD_PER_MINUTE);
  if (cost <= 0) return;
  await recordAiUsage({
    runId: params.runId,
    seq: params.seq,
    feature: params.feature ?? "sandbox_compute",
    provider: "vercel",
    model: "vercel/sandbox",
    cost,
    billTo: params.billTo,
    projectId: params.projectId,
  });
}
