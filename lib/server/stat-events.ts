import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A line from the statistics ledger (`stat_events`). Append-only: we write
 * an event at the creation of an issue, one at each passage in `done`, and one at
 * each task checked in the task book. The `project_*` /
 * `issue_*` / `task_text` fields are SNAPSHOTS — they remain readable even after
 * deletion of the issue, the project (the FKs are `on delete set null`) or the
 * task (the notebook is a free note, without history).
 */
export interface StatEventRow {
  user_id: string;
  kind: "issue_created" | "issue_completed" | "scratchpad_task_completed";
  occurred_at: string;
  project_id: string | null;
  project_name: string | null;
  issue_id: string | null;
  issue_number: number | null;
  issue_title: string | null;
  /** Label of the checked task (kind `scratchpad_task_completed`). */
  task_text?: string | null;
}

/**
 * Inserts stats events (customer service, RLS bypassed). Best effort, at
 * the image of `insertNotifications` / `insertEvents`: we log and swallow
 * the error to NEVER fail the outcome mutation that calls it.
 */
export async function insertStatEvents(
  service: SupabaseClient,
  rows: StatEventRow[]
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await service.from("stat_events").insert(rows);
  if (error) console.error("[stat-events] insert failed:", error.message);
}
