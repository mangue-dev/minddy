import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Une ligne du ledger de statistiques (`stat_events`). Append-only : on écrit
 * un event à la création d'une issue et un à chaque passage en `done`. Les
 * champs `project_*` / `issue_*` sont des SNAPSHOTS — ils restent lisibles même
 * après suppression de l'issue ou du projet (les FKs sont `on delete set null`).
 */
export interface StatEventRow {
  user_id: string;
  kind: "issue_created" | "issue_completed";
  occurred_at: string;
  project_id: string | null;
  project_name: string | null;
  issue_id: string | null;
  issue_number: number | null;
  issue_title: string | null;
}

/**
 * Insère des events de stats (service client, RLS bypassée). Best-effort, à
 * l'image de `insertNotifications` / `insertEvents` : on log et on avale
 * l'erreur pour ne JAMAIS faire échouer la mutation d'issue qui l'appelle.
 */
export async function insertStatEvents(
  service: SupabaseClient,
  rows: StatEventRow[]
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await service.from("stat_events").insert(rows);
  if (error) console.error("[stat-events] insert failed:", error.message);
}
