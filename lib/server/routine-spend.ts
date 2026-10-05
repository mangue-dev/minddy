import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export interface RoutineOccurrenceSpend {
  totalUsd: number;
  platformUsd: number;
}

/** Read every parent, worker, search and compute charge across occurrence turns. */
export async function routineOccurrenceSpend(
  service: SupabaseClient,
  conversationIds: string[],
): Promise<Map<string, RoutineOccurrenceSpend>> {
  if (!conversationIds.length) return new Map();
  const { data, error } = await service.rpc("get_numo_routine_occurrence_spend", {
    p_conversation_ids: [...new Set(conversationIds)],
  });
  if (error) throw new Error(`Routine occurrence usage read failed: ${error.message}`);
  return new Map((data ?? []).map((row: {
    conversation_id: string; total_cost: number | string; platform_cost: number | string;
  }) => [row.conversation_id, {
    totalUsd: Number(row.total_cost),
    platformUsd: Number(row.platform_cost),
  }]));
}
