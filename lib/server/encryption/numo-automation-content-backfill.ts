import "server-only";

import { markNumoAttempt } from "./numo-attempt";

import { getServiceClient } from "@/lib/supabase-service";
import { decodeOperationJson, decodeOperationText, encodeOperationJson,
  encodeOperationText, isEncryptedOperationJson, isEncryptedOperationText,
  operationJsonState, operationTextState } from
  "@/lib/server/automations/operation-content";
import { isContentEncryptionEnabled } from "./content-config";
import { getContentKeys } from "./registry";

/** Rotate operation snapshots through a bounded, service-only CAS queue. */
export async function backfillNumoAutomationContentBatch(limit = 30,
  signal?: AbortSignal) {
  if (!isContentEncryptionEnabled() ||
      process.env.MINDDY_NUMO_AUTOMATION_ENCRYPTION_ENABLED !== "true") {
    throw new Error("Numo automation encryption is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid Numo automation batch size");
  }
  const service = getServiceClient();
  const { data, error } = await service.from("numo_automation_operations")
    .select("id,chain_id,step,prompt,context,outcome,outcome_summary,outcome_blockers,chain:agent_chains!inner(project_id)")
    .order("content_encryption_attempted_at", { ascending: true,
      nullsFirst: true }).order("id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan Numo automation operations");
  const result = { scanned: 0, migrated: 0, unchanged: 0,
    conflicted: 0, failed: 0, interrupted: false };
  for (const row of data ?? []) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      const chain = Array.isArray(row.chain) ? row.chain[0] : row.chain;
      const projectId = chain?.project_id;
      if (!projectId || !row.prompt || !row.context ||
          !row.outcome_blockers) throw new Error("Invalid automation operation row");
      const key = await getContentKeys().current({ kind: "project", id: projectId });
      const version = key.version;
      key.bytes.fill(0);
      const prompt = await decodeOperationText(projectId, row.chain_id, row.step,
        "prompt", row.prompt);
      const context = await decodeOperationJson(projectId, row.chain_id, row.step,
        "context", row.context as Record<string, unknown>);
      const summary = await decodeOperationText(projectId, row.chain_id, row.step,
        "outcome_summary", row.outcome_summary);
      const blockers = await decodeOperationJson(projectId, row.chain_id, row.step,
        "outcome_blockers", row.outcome_blockers as unknown[]);
      if (typeof prompt !== "string" || !context || Array.isArray(context) ||
          !Array.isArray(blockers)) throw new Error("Invalid automation operation content");
      const freshText = (value: string | null) => value === null ||
        (isEncryptedOperationText(value) &&
          operationTextState(value).version === version &&
          operationTextState(value).format === 3);
      const freshJson = (value: unknown) => isEncryptedOperationJson(value) &&
        operationJsonState(value).version === version &&
        operationJsonState(value).format === 3;
      const emptyUnsetBlockers = row.outcome === null &&
        Array.isArray(row.outcome_blockers) &&
        row.outcome_blockers.length === 0;
      const freshBlockers = emptyUnsetBlockers || freshJson(row.outcome_blockers);
      const fresh = freshText(row.prompt) && freshJson(row.context) &&
        freshText(row.outcome_summary) && freshBlockers;
      const newPrompt = freshText(row.prompt) ? row.prompt : await encodeOperationText(
        projectId, row.chain_id, row.step, "prompt", prompt);
      const newContext = freshJson(row.context) ? row.context : await encodeOperationJson(
        projectId, row.chain_id, row.step, "context", context);
      const newSummary = freshText(row.outcome_summary) ? row.outcome_summary :
        await encodeOperationText(projectId, row.chain_id, row.step,
          "outcome_summary", summary);
      const newBlockers = freshBlockers
        ? row.outcome_blockers : await encodeOperationJson(projectId,
          row.chain_id, row.step, "outcome_blockers", blockers);
      if ((await decodeOperationText(projectId, row.chain_id, row.step,
        "prompt", newPrompt)) !== prompt ||
          JSON.stringify(await decodeOperationJson(projectId, row.chain_id,
            row.step, "context", newContext as Record<string, unknown>)) !==
            JSON.stringify(context) ||
          (await decodeOperationText(projectId, row.chain_id, row.step,
            "outcome_summary", newSummary)) !== summary ||
          JSON.stringify(await decodeOperationJson(projectId, row.chain_id,
            row.step, "outcome_blockers", newBlockers as unknown[])) !==
            JSON.stringify(blockers)) {
        throw new Error("Numo automation conversion verification failed");
      }
      if (signal?.aborted) { result.interrupted = true; break; }
      const write = await service.rpc("migrate_numo_automation_content", {
        p_id: row.id, p_old_prompt: row.prompt, p_old_context: row.context,
        p_old_summary: row.outcome_summary, p_old_blockers: row.outcome_blockers,
        p_new_prompt: newPrompt, p_new_context: newContext,
        p_new_summary: newSummary, p_new_blockers: newBlockers,
      });
      if (write.error) throw new Error("Unable to migrate Numo automation operation");
      if (!write.data) {
        result.conflicted++;
        await markNumoAttempt("automation", row.id, { prompt: row.prompt, context: row.context, outcome_summary: row.outcome_summary, outcome_blockers: row.outcome_blockers });
      }
      else if (fresh) result.unchanged++;
      else result.migrated++;
    } catch {
      result.failed++;
      await markNumoAttempt("automation", row.id, { prompt: row.prompt, context: row.context, outcome_summary: row.outcome_summary, outcome_blockers: row.outcome_blockers });
    }
  }
  return result;
}
