import "server-only";

import { resolveNumoBackgroundEnabled } from "@/lib/numo-background";
import { runDecision } from "@/lib/server/decisions/runner";
import type { DecisionEngine } from "@/lib/server/decisions/types";
import { hasUsageBudget } from "@/lib/server/usage";
import { getServiceClient } from "@/lib/supabase-service";
import type { NumoEventBatch } from "./event-batches";
import { loadWakeInput } from "./wake-context";
import { hasNumoWakeLeft, numoWake, type NumoWakeOutcome } from "./wake";
import {
  buildNumoWakeSpec,
  numoWakeVerdict,
  selectWakeEvents,
  type WakeReason,
} from "./wake-decision";

/**
 * The triage of one due batch (MIN-928): the instance's decision model reads
 * the batch with the user's memories and open journal entries, the runner
 * falls back to the `numo_wake_model` LLM pass when the model is unsure, and
 * Numo is woken for the events the engine kept.
 *
 * - Background Numo or Numo's memory switched off since the batch was
 *   routed: no triage, the batch closes.
 * - The user's daily wake cap is reached (`wake.ts`): no triage, the batch
 *   closes.
 * - No budget left: no triage, the batch closes. Both engines are checked
 *   the way they bill: the decision model reads the user's automations key,
 *   the LLM fallback their assistant key.
 * - Both engines failed: no wake, the batch closes. Nothing is lost: the
 *   events stay in the journal and the next wake can read them.
 * - A database failure before the decision throws, so the clock retries the
 *   batch later. A failed wake does not: a retry would decide and bill
 *   again, and could wake Numo twice for the same events.
 *
 * Both engines bill the batch's user on one ledger run per batch: the
 * decision model under `jev_decision`, the LLM fallback under `numo_wake`.
 */

/** What the wake (MIN-929) receives. */
export interface NumoWakeRequest {
  batchId: string;
  userId: string;
  /** Journal ids of the events Numo should act on, a subset of the batch. */
  eventIds: number[];
  reason: Exclude<WakeReason, "none">;
  /** One sentence for Numo's prompt, from the reason. */
  sentence: string;
  engine: DecisionEngine;
}

/** What a wake did: `started` admitted Numo's turn; the others started nothing. */
export type NumoWake = (request: NumoWakeRequest) => Promise<NumoWakeOutcome>;

export type NumoTriageOutcome =
  | "empty"
  | "switched_off"
  | "budget_exhausted"
  | "capped"
  | "no_decision"
  | "asleep"
  | "woken"
  | "already_woken"
  | "wake_failed";

export async function triageNumoEventBatch(
  batch: Pick<NumoEventBatch, "id" | "user_id" | "event_ids">,
  deps: { wake?: NumoWake } = {}
): Promise<NumoTriageOutcome> {
  const service = getServiceClient();
  // The switches are read again: the user may have turned them off in the
  // minutes the batch was open. Same reading as `numo_event_recipients`.
  const { data: account, error } = await service.auth.admin.getUserById(batch.user_id);
  if (error) throw new Error("Unable to read the account for the wake decision");
  const metadata = (account?.user?.user_metadata ?? {}) as Record<string, unknown>;
  if (!resolveNumoBackgroundEnabled(metadata)) return "switched_off";
  // Past the daily cap no wake can follow: the decision is not even paid for.
  if (!(await hasNumoWakeLeft(batch.user_id))) {
    console.warn(`[numo-wake] batch=${batch.id} skipped: capped`);
    return "capped";
  }
  const input = await loadWakeInput(service, batch);
  const spec = buildNumoWakeSpec(input);
  if (!spec) return "empty";
  const [modelBudget, llmBudget] = await Promise.all([
    hasUsageBudget(batch.user_id, "automations", "issue_relation_model"),
    hasUsageBudget(batch.user_id, "assistant", "numo_wake_model"),
  ]);
  if (!modelBudget || !llmBudget) {
    console.warn(`[numo-wake] batch=${batch.id} skipped: budget_exhausted`);
    return "budget_exhausted";
  }
  const outcome = await runDecision(spec, {
    billTo: { userId: batch.user_id },
    projectId: null,
    subjectId: batch.id,
  });
  if (!outcome) {
    console.warn(`[numo-wake] batch=${batch.id} no_decision`);
    return "no_decision";
  }
  const verdict = numoWakeVerdict(outcome.answers, selectWakeEvents(input.events).shown);
  if (!verdict.wake) return "asleep";
  let woke: NumoWakeOutcome;
  try {
    woke = await (deps.wake ?? numoWake)({
      batchId: batch.id,
      userId: batch.user_id,
      eventIds: verdict.eventIds,
      reason: verdict.reason,
      sentence: verdict.sentence,
      engine: outcome.engine,
    });
  } catch (error) {
    console.error(`[numo-wake] batch=${batch.id} wake_failed:`, (error as Error).name);
    return "wake_failed";
  }
  switch (woke) {
    case "started": return "woken";
    case "duplicate": return "already_woken";
    case "empty": return "empty";
    case "switched_off": return "switched_off";
    case "capped": return "capped";
  }
}
