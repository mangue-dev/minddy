import "server-only";

import { randomUUID } from "node:crypto";
import { getServiceClient } from "@/lib/supabase-service";

// FORMES have lived apart since MIN-224 (see `ai-usage-shape.ts`): the loop
// agent needs it in the microVM, where this module — which writes in the key of
// service — has nothing to do. Re-exported here so nothing has to change
// d'import.
import {
  type AiFeature,
  type AiUsageBillTo,
} from "./ai-usage-shape";

export type {
  AiFeature,
  AiUsageBillTo,
  NormalizedUsage,
  OpenRouterUsage,
} from "./ai-usage-shape";
export { OPENROUTER_USAGE_INCLUDE, parseOpenRouterUsage } from "./ai-usage-shape";

/**
 * LLM Cost Tracker — the SINGLE recording point for all IA calls.
 *
 * Each LLM call writes a line to `ai_usage`. Calls of the same agentic
 * action share a `runId` (see `newRunId`) → we can aggregate by call,
 * by run and by type (`feature`). The cost comes from the usage reported by
 * OpenRouter when adding `usage: { include: true }` to the request body.
 *
 * RULE: `recordAiUsage` NEVER throw — cost tracking must never make
 * fail the AI feature who calls it (best effort, like `insertStatEvents`).
 */

/** A fresh run_id: to be generated once per user action (shared by its calls). */
export function newRunId(): string {
  return randomUUID();
}

/**
 * What a run spent, READ AT THE LEDGER (MIN-215) — all features combined,
 * `sandbox_compute` included.
 *
 * To be preferred to `agent_runs.cost_usd` wherever the answer must be true even
 * when a chunk is dead: the column is only written by healthy `executeAgentRun` * output paths, so a chunk that raises in the middle — or whose invocation is killed at the duration limit — NEVER bears its expense there. The
 * lines of the ledger are written call by call, before the accident.
 *
 * Returns `null` when the reading fails, never 0: a zero would be confused with
 * "this run has spent nothing" and would recharge the ceiling that we are trying to achieve hold.
 * The caller then falls back on what he has — at worst the behavior from before.
 */
export async function spentFromLedger(runId: string): Promise<number | null> {
  try {
    const service = getServiceClient();
    // Sum made IN BASE (`get_ai_run_spend`): a reading of lines would be
    // capped by PostgREST (1,000 by default) and would render, on a chatty run,
    // a silently low sum.
    const { data, error } = await service.rpc("get_ai_run_spend", { p_run_id: runId });
    if (error) {
      console.error("[ai-usage] get_ai_run_spend failed:", error.message);
      return null;
    }
    const spent = Number(data ?? 0);
    return Number.isFinite(spent) ? spent : null;
  } catch (err) {
    console.error("[ai-usage] get_ai_run_spend threw:", (err as Error).message);
    return null;
  }
}

export interface AiUsageInput {
  runId: string;
  /** Index of the call in the run (0 for a single call). */
  seq?: number;
  feature: AiFeature;
  /** Who pays, and in what capacity. See `AiUsageBillTo`. */
  billTo: AiUsageBillTo;
  model?: string | null;
  /** DB default: 'openrouter'. Add 'vercel' for the compute sandbox. */
  provider?: string;
  /** Who paid for the LLM call. The user quota is only `platform`. */
  keyMode?: "platform" | "byok";
  generationId?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  /**
 * Prompt caching (MIN-242): tokens RELEASED to the provider's cache, and tokens
 * that he has just written there. `undefined`/`null` = the vendor doesn't say anything about it,
 * which doesn't read like a cache that didn't bite.
 */
  cachedTokens?: number | null;
  cacheWriteTokens?: number | null;
  cost?: number | null;
  /**
 * Cost is CALCULATED, not reported by the provider (MIN-216) — an attempt to
 * abandoned stream (interrupt, cut, resume) is charged without
 * the `usage` object ever arriving. The line still counts: it's the
 * only way for the expense to enter the counters. But it stands out,
 * otherwise the finance admin would compare its margin to dollars never recorded.
 */
  estimated?: boolean;
  projectId?: string | null;
  conversationId?: string | null;
}

/** Imputation reason written in base — 1:1 with the migration check. */
type BilledReason = "trigger" | "project_owner" | "platform" | "unattributed";

function toRow(input: AiUsageInput) {
  return {
    run_id: input.runId,
    seq: input.seq ?? 0,
    feature: input.feature,
    ...(input.provider ? { provider: input.provider } : {}),
    ...(input.keyMode ? { key_mode: input.keyMode } : {}),
    model: input.model ?? null,
    generation_id: input.generationId ?? null,
    prompt_tokens: input.promptTokens ?? null,
    completion_tokens: input.completionTokens ?? null,
    total_tokens: input.totalTokens ?? null,
    // Omitted when the supplier says nothing (MIN-242): same precaution as
    // `estimated` just below — a deployment that would precede its migration
    // would only lose the cache detail, never the line.
    ...(input.cachedTokens != null ? { cached_tokens: input.cachedTokens } : {}),
    ...(input.cacheWriteTokens != null ? { cache_write_tokens: input.cacheWriteTokens } : {}),
    cost: input.cost ?? null,
    // Omitted when it is false: the column has a base default, and a row
    // ordinary should owe NOTHING to a migration. If the code went to production
    // before it, only the estimated lines would be refused — not the ledger
    // integer, what an always-present field would have caused.
    ...(input.estimated ? { estimated: true } : {}),
    user_id: null as string | null,
    billed_reason: "unattributed" as BilledReason,
    project_id: input.projectId ?? null,
    conversation_id: input.conversationId ?? null,
  };
}

/**
 * Imputation of background jobs (MIN-87) — short cache of project owners.
 *
 * The usage budget is counted BY USER (`get_user_usage_since` filter on
 * `user_id`): a line without `user_id` therefore does not enter the counter of
 * anyone. However, the background passes (feedback review, smart-assign, embeddings
 * from the public board) are AUTHORIZED by the budget of the project owner
 * (`ownerHasUsageBudget`) — leaving them off the meter was tantamount to opening a
 * unlimited consumption next to the door that guards it. Hence `projectOwner`:
 * what MIN-131 removed was the automation, not the fallback itself.
 */
const OWNER_CACHE_TTL_MS = 60_000;
const ownerCache = new Map<string, { ownerId: string | null; expiresAt: number }>();

async function resolveProjectOwners(projectIds: string[]): Promise<Map<string, string | null>> {
  const now = Date.now();
  const resolved = new Map<string, string | null>();
  const missing: string[] = [];
  for (const id of new Set(projectIds)) {
    const cached = ownerCache.get(id);
    if (cached && cached.expiresAt > now) resolved.set(id, cached.ownerId);
    else missing.push(id);
  }
  if (missing.length === 0) return resolved;

  const service = getServiceClient();
  const { data } = await service.from("projects").select("id, owner_id").in("id", missing);
  for (const row of (data ?? []) as { id: string; owner_id: string | null }[]) {
    resolved.set(row.id, row.owner_id);
    ownerCache.set(row.id, { ownerId: row.owner_id, expiresAt: now + OWNER_CACHE_TTL_MS });
  }
  // Project not found: we memorize the absence so as not to re-query in a loop.
  for (const id of missing) {
    if (!resolved.has(id)) {
      resolved.set(id, null);
      ownerCache.set(id, { ownerId: null, expiresAt: now + OWNER_CACHE_TTL_MS });
    }
  }
  return resolved;
}

/**
 * Records one (or more) AI call(s) in the `ai_usage` ledger. Best-effort:
 * logs the error and swallows it — never interrupts the caller.
 *
 * The charge comes from `billTo` and nowhere else (MIN-131): a call
 * with trigger pays to trigger, a call without a nameable trigger must
 * ask the project owner, a call offered to a visitor without an account
 * is announced as `platform`, and anything that does not fall into any of the three is written as
 * `unattributed` — counted as no one, but logged in error.
 */
export async function recordAiUsage(
  input: AiUsageInput | AiUsageInput[]
): Promise<void> {
  const inputs = Array.isArray(input) ? input : [input];
  const rows = inputs.map(toRow);
  if (rows.length === 0) return;
  try {
    // The owners of the lines that request them, in a single request (short cache).
    const ownerRequests = inputs
      .map((i) => ("projectOwner" in i.billTo ? i.billTo.projectOwner : null))
      .filter((id): id is string => Boolean(id));
    const owners =
      ownerRequests.length > 0
        ? await resolveProjectOwners(ownerRequests)
        : new Map<string, string | null>();

    for (const [i, row] of rows.entries()) {
      const billTo = inputs[i].billTo;
      if ("userId" in billTo && billTo.userId) {
        row.user_id = billTo.userId;
        row.billed_reason = "trigger";
      } else if ("projectOwner" in billTo) {
        const ownerId = owners.get(billTo.projectOwner) ?? null;
        row.user_id = ownerId;
        row.billed_reason = ownerId ? "project_owner" : "unattributed";
        if (!ownerId) {
          // The fallback has been requested but there is no one to go to: the expense
          // output all counters. It's said, otherwise it's never seen.
          console.error(
            `[ai-usage] ${row.feature}: owner introuvable pour le projet ${billTo.projectOwner} — ligne non imputée`
          );
        }
      } else if ("platform" in billTo) {
        // Expense offered, decided: nothing to charge, and nothing to report.
        row.billed_reason = "platform";
      } else {
        const reason =
          "unattributed" in billTo ? billTo.unattributed : "déclencheur annoncé mais vide";
        console.error(`[ai-usage] ${row.feature}: ligne non imputée — ${reason}`);
      }
    }

    const service = getServiceClient();
    const { error } = await service.from("ai_usage").insert(rows);
    if (error) console.error("[ai-usage] insert failed:", error.message);
  } catch (err) {
    console.error("[ai-usage] insert threw:", (err as Error).message);
  }
}
