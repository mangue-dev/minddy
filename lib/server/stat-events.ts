import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { isContentEncryptionEnabled } from "./encryption/content-config";
import { getEncryptedStore } from "./encryption/registry";
import { EncryptedRowCodec } from "./encryption/row-codec";

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
  rows: StatEventRow[],
  options: { requireEncryption?: boolean } = {},
): Promise<void> {
  try { await appendStatEvents(service, rows, options); }
  catch { console.error("[stat-events] insert failed"); }
}

/** Imports must surface failures; best-effort event producers use insertStatEvents. */
export async function appendStatEvents(
  service: SupabaseClient,
  rows: StatEventRow[],
  { requireEncryption = false }: { requireEncryption?: boolean } = {},
): Promise<void> {
  for (let offset = 0; offset < rows.length; offset += 200) {
    const encoded = [];
    for (const input of rows.slice(offset, offset + 200)) {
      const row = { ...input, id: randomUUID(), project_name: input.project_name ?? null,
        issue_title: input.issue_title ?? null, task_text: input.task_text ?? null };
      if (isContentEncryptionEnabled() || requireEncryption) {
        const codec = new EncryptedRowCodec(getEncryptedStore());
        encoded.push(await codec.encode({ ...row, encryption_version: 0, encrypted_content: null },
          { table: "stat_events", scope: { kind: "user", id: row.user_id } }));
      } else encoded.push(row);
    }
    const { error } = await service.from("stat_events").insert(encoded);
    if (error) throw new Error("Unable to append statistics");
  }
}

/** User-scoped export; statistics SQL aggregates only the non-sensitive metadata. */
export async function readStatEvents(service: SupabaseClient, userId: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await service.from("stat_events").select("*").eq("user_id", userId).order("occurred_at");
  if (error) throw new Error("Unable to read statistics");
  const rows: Record<string, unknown>[] = [];
  for (const row of data ?? []) {
    if (row.user_id !== userId) throw new Error("Invalid statistics owner");
    if (row.encryption_version === undefined && row.encrypted_content === undefined ||
        row.encryption_version === 0 && row.encrypted_content === null) {
      rows.push(row);
    } else {
      const store = getEncryptedStore();
      rows.push(await new EncryptedRowCodec(store).decode({ ...row,
        encrypted_content: store.fromDatabase<Record<string, unknown>>(row.encrypted_content),
      }, { table: "stat_events", scope: { kind: "user", id: userId } },
      { actorId: userId, reason: "repository_read" }));
    }
  }
  return rows.map(({ kind, occurred_at, project_name, issue_number, issue_title, task_text }) =>
    ({ kind, occurred_at, project_name, issue_number, issue_title, task_text }));
}
