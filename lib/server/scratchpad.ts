import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { planProgress, type PlanProgress } from "@/lib/plan";
import { MAX_SCRATCHPAD_LENGTH, tasksCheckedOff } from "@/lib/scratchpad";
import { insertStatEvents } from "@/lib/server/stat-events";
import { getServiceClient } from "@/lib/supabase-service";

/**
 * Cœur du scratchpad perso (Notes) — la note markdown UNIQUE de l'utilisateur.
 * Partagé par la route API (`/api/me/scratchpad`, client RLS de l'utilisateur)
 * et les tools MCP (client service). Aucune notion de projet : c'est personnel.
 *
 * Deux écrivains (l'éditeur WYSIWYG + l'agent via le MCP) → chaque ligne porte un
 * `rev` (compteur de version). Les écritures passent par un compare-and-swap sur
 * ce `rev` : une écriture basée sur une version périmée est REJETÉE (conflicted)
 * plutôt que d'écraser en silence. Le client fusionne 3-way (lib/scratchpad.ts)
 * et réessaie ; l'agent MCP relit et réapplique.
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

/** Longueur max du libellé snapshoté dans le ledger de stats. */
const MAX_TASK_TEXT = 500;

/**
 * Trace dans `stat_events` chaque tâche qui vient d'être COCHÉE dans la note.
 *
 * Le carnet est une note libre — on y ajoute, coche et supprime des tâches en
 * continu, et « Retirer les tâches terminées » les efface d'un coup — donc le
 * compteur ne peut PAS être dérivé du contenu courant : seule une trace
 * append-only survit à un nettoyage. Best-effort comme `insertStatEvents` :
 * jamais bloquant pour la sauvegarde de la note.
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
    // Le ledger n'est écrit que par le service client (aucune policy insert) ;
    // s'il n'est pas configuré, `getServiceClient` jette — hors de question de
    // faire échouer la sauvegarde de la note pour une statistique.
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
