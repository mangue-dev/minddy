import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AllStartupTiming } from "./all-startup-timing";
import { ISSUE_SELECT } from "./issue-mapper";
import { issueStore } from "./issue-store";

const BATCH_SIZE = 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
type Row = Record<string, unknown> & { id: string; position: number | null; number: number | null };
type Result = { data: Row[]; error: null } | { data: null; error: { message: string } };

function compareNumber(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

/** Load every RLS-visible issue through the ordinary protected projection. */
export async function loadGlobalBoardIssues(client: SupabaseClient, actorId: string, timing?: AllStartupTiming): Promise<Result> {
  const rows: Row[] = [];
  const ids = new Set<string>();
  let cursor: string | null = null;
  try {
    for (;;) {
      // UUID order stays stable when a concurrent edit moves a card. The board's
      // position/number order is restored only after every batch succeeds.
      let query = issueStore(client, actorId, timing).select(ISSUE_SELECT, { count: "exact" })
        .order("id", { ascending: true }).limit(BATCH_SIZE);
      if (cursor) query = query.gt("id", cursor);
      const result = await query;
      if (result.error || !Array.isArray(result.data)) throw new Error("Incomplete issue read");
      const batch = result.data as Row[];
      const count = result.count;
      if (count != null && (!Number.isSafeInteger(count) || count < batch.length)) throw new Error("Invalid issue count");
      for (const row of batch) {
        if (!row || typeof row.id !== "string" || !UUID.test(row.id) || ids.has(row.id) ||
            (cursor !== null && row.id <= cursor) ||
            ![row.position, row.number].every((value) => value === null || typeof value === "number" && !Number.isNaN(value))) {
          throw new Error("Invalid issue pagination");
        }
        ids.add(row.id);
        rows.push(row);
        cursor = row.id;
      }
      // count describes this filtered remainder, including rows beyond the
      // server cap. Without it, only an empty batch proves exhaustion.
      if (count === batch.length || count == null && batch.length === 0) break;
      if (batch.length === 0) throw new Error("Issue pagination did not advance");
    }
    rows.sort((a, b) => compareNumber(a.position, b.position) || compareNumber(a.number, b.number) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return { data: rows, error: null };
  } catch {
    // Never publish a truncated collection or expose protected row/decode data.
    return { data: null, error: { message: "Unable to load global board issues" } };
  }
}
