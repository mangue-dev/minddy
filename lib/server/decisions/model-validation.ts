import "server-only";

import { newRunId } from "@/lib/server/ai-usage";
import { getPlatformModelCatalog } from "@/lib/server/agent/models-catalog";
import {
  probeDecisionModel,
  type DecisionModelFailure,
} from "@/lib/server/decisions/decision-model";

/**
 * Server-side gate of the global decision-model setting (MIN-694), run by the
 * admin save before anything is written. A refused choice leaves the stored
 * setting untouched, so the runtime keeps calling the previous model.
 *
 * Three checks, cheapest first:
 * 1. The platform decision catalog loads. Without it nothing can be verified,
 *    so the save is refused rather than trusted (self-hosted instances without
 *    managed AI have no platform catalog and keep the default model).
 * 2. The candidate publishes the `decisions` output modality in that catalog.
 *    Chat, embedding, transcription and router entries are never accepted.
 * 3. The candidate answers a representative decision through the real
 *    adapter within the latency budget (`probeDecisionModel`): the modality
 *    alone does not prove it accepts Minddy's state and question kinds.
 */
export type DecisionModelValidationCode =
  | "catalog_unavailable"
  | "not_a_decision_model"
  | "compatibility_check_failed";

export type DecisionModelValidation =
  | { ok: true }
  | {
      ok: false;
      status: 400 | 422 | 503;
      code: DecisionModelValidationCode;
      /** The probe's failure, for `compatibility_check_failed`. */
      reason?: DecisionModelFailure;
    };

export async function validateDecisionModelChoice(
  model: string
): Promise<DecisionModelValidation> {
  const catalog = await getPlatformModelCatalog("decision");
  if (catalog.length === 0) {
    return { ok: false, status: 503, code: "catalog_unavailable" };
  }
  if (!catalog.some((entry) => entry.id === model)) {
    return { ok: false, status: 400, code: "not_a_decision_model" };
  }
  const probe = await probeDecisionModel(model, newRunId());
  if (!probe.ok) {
    return { ok: false, status: 422, code: "compatibility_check_failed", reason: probe.reason };
  }
  return { ok: true };
}
