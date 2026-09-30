import "server-only";

import { getServiceClient } from "@/lib/supabase-service";

/** Move a failed CAS candidate behind later rows without recording verification. */
export async function markNumoAttempt(kind: string, id: string,
  old: Record<string, unknown>, callId?: string) {
  const { error } = await getServiceClient().rpc("mark_numo_content_attempt", {
    p_kind: kind, p_id: id, p_old: old, p_call_id: callId ?? null,
  });
  if (error) throw new Error("Unable to mark Numo content attempt");
}
