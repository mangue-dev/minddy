import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/supabase-service";
import { EncryptedRowCodec, type StoredRow } from "@/lib/server/encryption/row-codec";
import { getEncryptedStore } from "@/lib/server/encryption/registry";
import { isContentEncryptionEnabled } from "@/lib/server/encryption/content-config";

export const evaluationScope = { kind: "system" as const,
  id: "00000000-0000-0000-0000-000000000000" };
const context = { table: "ai_decision_evaluations" as const,
  scope: evaluationScope };

export async function shouldProtectDecisionEvaluations(
  service: SupabaseClient = getServiceClient(),
): Promise<boolean> {
  if (isContentEncryptionEnabled())
    return true;
  const { data, error } = await service.from("ai_decision_evaluation_scope")
    .select("id").eq("id", true).maybeSingle();
  if (error && !["42P01", "PGRST205"].includes(error.code))
    throw new Error("Unable to resolve decision evaluation protection state");
  return !!data;
}

export async function prepareDecisionEvaluation<T extends Record<string, unknown>>(
  row: T, protect: boolean,
): Promise<T | StoredRow> {
  if (!protect) return row;
  const complete = { ...row, id: crypto.randomUUID(),
    encryption_version: 0, encrypted_content: null,
    replay_succeeded: row.llm_answers !== null };
  return new EncryptedRowCodec(getEncryptedStore()).encode(complete, context);
}

export async function decodeDecisionEvaluation(row: StoredRow) {
  return new EncryptedRowCodec(getEncryptedStore()).decode(row, context,
    { actorId: null, reason: "migration_verification" });
}
