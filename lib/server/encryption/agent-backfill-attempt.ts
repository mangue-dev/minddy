import "server-only";

import { getServiceClient } from "@/lib/supabase-service";

type SourceRow = Record<string, unknown>;

/** Record a fair retry position without treating an attempt as verification. */
export async function markAgentBackfillAttempt(
  service: ReturnType<typeof getServiceClient>, table: string,
  checkedColumn: string, row: SourceRow, idColumn = "id",
): Promise<boolean> {
  const id = row[idColumn];
  if (typeof id !== "string") return false;
  const expected = Object.fromEntries(Object.entries(row).filter(([key]) =>
    key !== "run" && key !== "conversation" && key !== "created_at"));
  const { data, error } = await service.rpc("mark_agent_backfill_attempt", {
    p_table: table, p_id_column: idColumn, p_id: id,
    p_checked_column: checkedColumn, p_expected: expected,
  });
  if (error) throw new Error("Unable to record agent backfill attempt");
  return data === true;
}
