import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { decodeDecisionEvaluation, evaluationScope } from
  "@/lib/server/decisions/evaluation-content";
import { EncryptedRowCodec, type StoredRow } from "./row-codec";
import { isContentEncryptionEnabled } from "./content-config";
import { getContentKeys, getEncryptedStore } from "./registry";

type Row = StoredRow & { id: string; content_revision: number;
  replay_succeeded: boolean | null };
const context = { table: "ai_decision_evaluations" as const,
  scope: evaluationScope };

/** Migrate complete shadow evaluations under a revision CAS. */
export async function backfillAiDecisionEvaluationsBatch(
  limit = 25, signal?: AbortSignal,
) {
  if (!isContentEncryptionEnabled())
    throw new Error("Decision evaluation encryption is not enabled");
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw new Error("Invalid decision evaluation batch size");
  const result = { scanned: 0, migrated: 0, unchanged: 0,
    conflicted: 0, failed: 0, interrupted: false };
  const service = getServiceClient();
  const { data, error } = await service.from("ai_decision_evaluations")
    .select("*")
    .order("encryption_attempted_at", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan decision evaluations");
  const codec = new EncryptedRowCodec(getEncryptedStore());
  for (const row of (data ?? []) as Row[]) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      const key = await getContentKeys().current(evaluationScope);
      const version = key.version;
      key.bytes.fill(0);
      const plain = await decodeDecisionEvaluation(row);
      const fresh = row.encryption_version === version;
      const sealed = fresh ? row : await codec.encode({ ...row, ...plain }, context);
      const check = await codec.decode(sealed, context,
        { actorId: null, reason: "migration_verification" });
      for (const column of ["subject_id", "jev_answers", "llm_answers"])
        if (JSON.stringify(check[column]) !== JSON.stringify(plain[column]))
          throw new Error("Decision evaluation migration mismatch");
      if (signal?.aborted) { result.interrupted = true; break; }
      const now = new Date().toISOString();
      const { data: saved, error: writeError } = await service
        .from("ai_decision_evaluations")
        .update({ subject_id: sealed.subject_id,
          jev_answers: sealed.jev_answers, llm_answers: sealed.llm_answers,
          encrypted_content: sealed.encrypted_content,
          encryption_version: sealed.encryption_version,
          replay_succeeded: plain.llm_answers !== null,
          encryption_checked_at: now,
          encryption_attempted_at: now })
        .eq("id", row.id).eq("content_revision", row.content_revision)
        .select("id").maybeSingle();
      if (writeError) throw new Error("Unable to migrate decision evaluation");
      if (!saved) result.conflicted++;
      else if (fresh) result.unchanged++;
      else result.migrated++;
    } catch {
      result.failed++;
      await service.from("ai_decision_evaluations")
        .update({ encryption_attempted_at: new Date().toISOString() })
        .eq("id", row.id).eq("content_revision", row.content_revision);
    }
  }
  return result;
}
