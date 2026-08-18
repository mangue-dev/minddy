import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parsePlan,
  planProgress,
  setTaskState,
  type PlanProgress,
  type PlanTaskState,
} from "@/lib/plan";
import { MAX_SCRATCHPAD_LENGTH, tasksCheckedOff } from "@/lib/scratchpad";
import { insertStatEvents } from "@/lib/server/stat-events";
import { getServiceClient } from "@/lib/supabase-service";

/**
 * Core of the personal scratchpad (Notes) — the user's UNIQUE markdown note.
 * Shared by the API route (`/api/me/scratchpad`, user's RLS client)
 * and MCP tools (client service). No notion of project: it's personal.
 *
 * Two writers (the WYSIWYG editor + the agent via the MCP) → each line carries a
 * `rev` (version counter). Writes go through a compare-and-swap on
 * this `rev`: a write based on a stale version is REJECTED (conflicted)
 * rather than silently overwritten. The client merges 3-way (lib/scratchpad.ts)
 * and tries again; MCP agent rereads and reapplies.
 */

export interface ScratchpadState {
  content: string;
  updated_at: string | null;
  /** Monotonic version — bumped on every write; the CAS token. */
  rev: number;
  progress: PlanProgress;
}

export interface ScratchpadWrite extends ScratchpadState {
  /** True when the write was refused because `expectedRev` was stale: nothing
      was written and `content`/`rev` are the CURRENT server state. */
  conflicted: boolean;
}

function toState(row: {
  content?: unknown;
  updated_at?: unknown;
  rev?: unknown;
}): ScratchpadState {
  const content = typeof row.content === "string" ? row.content : "";
  return {
    content,
    updated_at: (row.updated_at as string | null) ?? null,
    rev: Number(row.rev ?? 0),
    progress: planProgress(content),
  };
}

const EMPTY: ScratchpadState = {
  content: "",
  updated_at: null,
  rev: 0,
  progress: planProgress(""),
};

export async function getScratchpad(
  client: SupabaseClient,
  userId: string
): Promise<ScratchpadState> {
  const { data, error } = await client
    .from("user_scratchpad")
    .select("content, updated_at, rev")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toState(data) : EMPTY;
}

/** Max length of the label snapshotted in the stats ledger. */
const MAX_TASK_TEXT = 500;

/**
 * Trace in `stat_events` each task that has just been CHECKED in the note.
 *
 * The notebook is a free note - you add, check and delete tasks in
 * continuously, and "Remove completed tasks" erases them at once - so the
 * counter cannot be derived from the current content: only an append-only trace
 * survives a cleanup. Best-effort like `insertStatEvents` :
 * never blocking for saving the note.
 */
async function recordTaskCompletions(
  userId: string,
  before: string,
  after: string
): Promise<void> {
  const checked = tasksCheckedOff(before, after);
  if (checked.length === 0) return;
  const occurredAt = new Date().toISOString();
  try {
    // The ledger is only written by customer service (no policy insert);
    // if not configured, `getServiceClient` throws — out of the question
    // fail to save the note for a statistic.
    await insertStatEvents(
      getServiceClient(),
      checked.map((text) => ({
        user_id: userId,
        kind: "scratchpad_task_completed" as const,
        occurred_at: occurredAt,
        project_id: null,
        project_name: null,
        issue_id: null,
        issue_number: null,
        issue_title: null,
        task_text: text.slice(0, MAX_TASK_TEXT),
      }))
    );
  } catch (err) {
    console.error("[scratchpad] stat events failed:", (err as Error).message);
  }
}

/**
 * Write the note under compare-and-swap: it only lands if the row's `rev` still
 * equals `expectedRev` (the version the caller edited from). On a stale base the
 * write is refused and the CURRENT state is returned with `conflicted: true` —
 * the caller reconciles (client-side 3-way merge + retry, or MCP re-read). The
 * new rev is the literal `expectedRev + 1`, so no RPC/procedure is needed.
 *
 * The pre-read is what makes the stats ledger possible: the DB only ever holds
 * the note's CURRENT text, so the before/after pair needed to spot a newly
 * ticked task exists nowhere else. It is only trusted when it is the very
 * version the CAS then landed on (`rev === expectedRev`) — otherwise someone
 * else wrote in between and the write conflicts anyway.
 */
export async function setScratchpad(
  client: SupabaseClient,
  userId: string,
  content: string,
  expectedRev: number
): Promise<ScratchpadWrite> {
  const clipped =
    content.length > MAX_SCRATCHPAD_LENGTH
      ? content.slice(0, MAX_SCRATCHPAD_LENGTH)
      : content;

  const before = await getScratchpad(client, userId);

  const { data, error } = await client
    .from("user_scratchpad")
    .update({ content: clipped, rev: expectedRev + 1 })
    .eq("user_id", userId)
    .eq("rev", expectedRev)
    .select("content, updated_at, rev")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) {
    if (before.rev === expectedRev) {
      await recordTaskCompletions(userId, before.content, clipped);
    }
    return { ...toState(data), conflicted: false };
  }

  // No row matched the CAS: either there is no row yet, or its rev advanced.
  const current = await getScratchpad(client, userId);
  if (current.updated_at === null) {
    // First write ever → insert (rev starts at 1). A lost insert race surfaces
    // as a conflict so the caller reconciles against whoever won.
    const { data: inserted, error: insertError } = await client
      .from("user_scratchpad")
      .insert({ user_id: userId, content: clipped, rev: 1 })
      .select("content, updated_at, rev")
      .maybeSingle();
    if (!insertError && inserted) {
      return { ...toState(inserted), conflicted: false };
    }
    return { ...(await getScratchpad(client, userId)), conflicted: true };
  }
  return { ...current, conflicted: true };
}

export type MutateResult =
  | { status: "ok"; state: ScratchpadState }
  | { status: "aborted" } // transform returned null (e.g. section not found)
  | { status: "conflict" }; // exhausted CAS retries under sustained contention

/**
 * Read → transform → write under CAS, re-reading fresh content and re-applying
 * on conflict. For POSITION-INDEPENDENT edits (appends) this makes an MCP write
 * merge with concurrent user edits automatically — the new tasks land on top of
 * the latest note. `transform` returns the new content, or null to abort.
 */
export async function mutateScratchpad(
  client: SupabaseClient,
  userId: string,
  transform: (content: string) => string | null,
  maxAttempts = 5
): Promise<MutateResult> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const current = await getScratchpad(client, userId);
    const next = transform(current.content);
    if (next === null) return { status: "aborted" };
    const write = await setScratchpad(client, userId, next, current.rev);
    if (!write.conflicted) return { status: "ok", state: write };
  }
  return { status: "conflict" };
}

/** A requested state change: `task_index` 0-based in document order
 (the `tasks` of a notebook reading). */
export interface ScratchpadTaskChange {
  task_index: number;
  state: PlanTaskState;
}

export type ScratchpadTaskChangeResult =
  | { status: "ok"; state: ScratchpadState }
  /** `expectedRev` exceeded: the caller's indexes may point elsewhere. */
  | { status: "stale_rev"; rev: number }
  /** An out-of-bounds index rejects the ENTIRE batch (all-or-nothing). */
  | { status: "out_of_range"; index: number; total: number }
  /** Concurrent editing while writing (CAS lost): reread and try again. */
  | { status: "conflict" };

/**
 * Toggles the state of one or more EXISTING tasks in the notebook without rewriting the
 * doc — the precise way to check. Shared by the MCP
 * `minddy_update_scratchpad_task` tool and the agent
 * tool
 * code (MIN-84): same indexes, same guards. `setTaskState` only rewrites the
 * marker of a line (addressed via `task.line`), the text remains intact;
 * the writing goes under CAS on the `rev` reread here.
 */
export async function applyScratchpadTaskChanges(
  client: SupabaseClient,
  userId: string,
  changes: ScratchpadTaskChange[],
  expectedRev?: number
): Promise<ScratchpadTaskChangeResult> {
  const current = await getScratchpad(client, userId);
  // Anti-expired index guard: if the note has advanced since the reading of which
  // come the indexes, the same index can designate another task — we refuse
  // rather than switching the wrong line.
  if (expectedRev !== undefined && current.rev !== expectedRev) {
    return { status: "stale_rev", rev: current.rev };
  }
  const parsed = parsePlan(current.content);
  for (const change of changes) {
    if (change.task_index >= parsed.tasks.length) {
      return {
        status: "out_of_range",
        index: change.task_index,
        total: parsed.tasks.length,
      };
    }
  }
  let next = current.content;
  for (const change of changes) {
    next = setTaskState(next, parsed.tasks[change.task_index].line, change.state);
  }
  const saved = await setScratchpad(client, userId, next, current.rev);
  if (saved.conflicted) return { status: "conflict" };
  return { status: "ok", state: saved };
}
