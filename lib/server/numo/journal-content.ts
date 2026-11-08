import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { EncryptedRowCodec, type StoredRow } from "@/lib/server/encryption/row-codec";
import { getEncryptedStore } from "@/lib/server/encryption/registry";
import { isContentEncryptionEnabled } from "@/lib/server/encryption/content-config";

/**
 * Numo's journal (MIN-927): the codec and the only repository of
 * `numo_journal_entries`. Every call is bound to one user and filters on it,
 * since the table is service-only. The sentence and the closing reason are
 * sealed together under the user's key once content encryption is enabled,
 * like Numo's memory.
 *
 * An entry has no type, only a lifecycle: written, seen by the user on the
 * home page (`markJournalEntriesSeen`), closed by Numo when it no longer
 * applies (`closeJournalEntry`).
 */

/** Which kind of Numo turn wrote the entry. */
export type NumoJournalSource = "wake" | "conversation" | "routine" | "mention";

export interface NumoJournalEntry {
  id: string;
  /** Null: the entry concerns no single project. */
  project_id: string | null;
  content: string;
  source: NumoJournalSource;
  source_conversation_id: string | null;
  created_at: string;
  seen_at: string | null;
  closed_at: string | null;
  closed_reason: string | null;
}

/** Open entries one user can have. Past it, Numo must close settled ones. */
export const NUMO_JOURNAL_OPEN_LIMIT = 50;
/** Characters in one entry: one sentence. */
export const NUMO_JOURNAL_MAX_LENGTH = 500;
/** Characters in a closing reason. */
export const NUMO_JOURNAL_REASON_MAX_LENGTH = 300;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SOURCES: ReadonlySet<string> = new Set(["wake", "conversation", "routine", "mention"]);

type Row = Record<string, unknown>;

const COLUMNS = "id, user_id, project_id, content, closed_reason, encrypted_content, encryption_version, source, source_conversation_id, created_at, seen_at, closed_at";

const context = (userId: string) => ({
  table: "numo_journal_entries" as const,
  scope: { kind: "user" as const, id: userId },
});

/** Trimmed, with runs of blank space collapsed: an entry is one sentence. */
function normalizeText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  if (!text || text.length > max) return null;
  return text;
}

export function normalizeJournalContent(value: unknown): string | null {
  return normalizeText(value, NUMO_JOURNAL_MAX_LENGTH);
}

export function normalizeJournalReason(value: unknown): string | null {
  return normalizeText(value, NUMO_JOURNAL_REASON_MAX_LENGTH);
}

/** Seal a complete row before it is written, when content encryption is on. */
export async function encodeNumoJournalRow(row: Row, userId: string,
  options: { force?: boolean } = {}): Promise<Row> {
  if (row.user_id !== userId || typeof row.id !== "string" || !row.id ||
      typeof row.content !== "string" ||
      !(row.closed_reason === null || typeof row.closed_reason === "string")) {
    throw new Error("Incomplete Numo journal entry");
  }
  if (!options.force && !isContentEncryptionEnabled()) {
    return { ...row, encryption_version: 0, encrypted_content: null };
  }
  return new EncryptedRowCodec(getEncryptedStore()).encode({
    ...row, encryption_version: 0, encrypted_content: null,
  } as StoredRow, context(userId));
}

export async function decodeNumoJournalRow(row: Row, userId: string): Promise<NumoJournalEntry> {
  if (row.user_id !== userId) throw new Error("Invalid Numo journal owner");
  let content: unknown;
  let reason: unknown;
  if (row.encryption_version === 0) {
    if (row.encrypted_content != null) throw new Error("Invalid clear Numo journal entry");
    content = row.content;
    reason = row.closed_reason;
  } else {
    const decoded = await new EncryptedRowCodec(getEncryptedStore()).decode(
      row as StoredRow, context(userId), { actorId: userId, reason: "repository_read" });
    content = decoded.content;
    reason = decoded.closed_reason;
  }
  if (typeof content !== "string") throw new Error("Invalid Numo journal content");
  if (reason != null && typeof reason !== "string") throw new Error("Invalid Numo journal reason");
  if (typeof row.source !== "string" || !SOURCES.has(row.source)) {
    throw new Error("Invalid Numo journal source");
  }
  return {
    id: row.id as string,
    project_id: (row.project_id as string | null) ?? null,
    content,
    source: row.source as NumoJournalSource,
    source_conversation_id: (row.source_conversation_id as string | null) ?? null,
    created_at: row.created_at as string,
    seen_at: (row.seen_at as string | null) ?? null,
    closed_at: (row.closed_at as string | null) ?? null,
    closed_reason: (reason as string | null) ?? null,
  };
}

/**
 * The part of the journal a turn on a shared surface may read and close (an
 * @Numo mention, a routine): the entries about its project, and those about
 * no project. A conversation with the user has no scope: it sees everything.
 */
export interface JournalScope {
  projectId: string | null;
}

export function inJournalScope(projectId: string | null, scope: JournalScope | undefined): boolean {
  return !scope || projectId === null || projectId === scope.projectId;
}

export class NumoJournalError extends Error {
  constructor(
    readonly code: "invalid_content" | "invalid_reason" | "limit_reached" | "not_found" | "database",
    message: string,
  ) {
    super(message);
  }
}

/** Decode a page of rows. A row that fails to decode is left out and logged. */
async function decodeRows(rows: Row[], userId: string): Promise<NumoJournalEntry[]> {
  const entries: NumoJournalEntry[] = [];
  for (const row of rows) {
    try {
      entries.push(await decodeNumoJournalRow(row, userId));
    } catch {
      console.error("[numo-journal] decode_failed");
    }
  }
  return entries;
}

/** The user's open entries, newest first. */
export async function listOpenJournalEntries(service: SupabaseClient, userId: string,
  options: { limit?: number } = {}): Promise<NumoJournalEntry[]> {
  const { data, error } = await service.from("numo_journal_entries").select(COLUMNS)
    .eq("user_id", userId).is("closed_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    // Past the cap: two writes racing the count can leave a few more open
    // entries, and the oldest must stay reachable to be closed.
    .limit(options.limit ?? NUMO_JOURNAL_OPEN_LIMIT * 2);
  if (error) throw new NumoJournalError("database", "Unable to read Numo's journal");
  return decodeRows((data ?? []) as Row[], userId);
}

/**
 * The entries the user has not seen yet, newest first: the open ones, and the
 * closed ones too, so the home page can say once that something was settled.
 */
export async function listUnseenJournalEntries(service: SupabaseClient, userId: string,
  options: { limit?: number } = {}): Promise<NumoJournalEntry[]> {
  // Open entries first: settled ones, which pile up while the user is away,
  // must never push out what still waits for them.
  const { data, error } = await service.from("numo_journal_entries").select(COLUMNS)
    .eq("user_id", userId).is("seen_at", null)
    .order("closed_at", { ascending: false, nullsFirst: true })
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(options.limit ?? NUMO_JOURNAL_OPEN_LIMIT);
  if (error) throw new NumoJournalError("database", "Unable to read Numo's journal");
  return decodeRows((data ?? []) as Row[], userId);
}

/**
 * Every entry of the user, open or closed, newest first: the account export.
 * Retention keeps the table small (open entries are capped, closed ones leave
 * within 180 days), so one bounded read covers it.
 */
export async function listAllJournalEntries(service: SupabaseClient,
  userId: string): Promise<NumoJournalEntry[]> {
  const { data, error } = await service.from("numo_journal_entries").select(COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(10_000);
  if (error) throw new NumoJournalError("database", "Unable to read Numo's journal");
  return decodeRows((data ?? []) as Row[], userId);
}

async function countOpenJournalEntries(service: SupabaseClient, userId: string): Promise<number> {
  const { count, error } = await service.from("numo_journal_entries")
    .select("id", { count: "exact", head: true }).eq("user_id", userId).is("closed_at", null);
  if (error) throw new NumoJournalError("database", "Unable to read Numo's journal");
  return count ?? 0;
}

export async function writeJournalEntry(service: SupabaseClient, userId: string, input: {
  content: unknown;
  projectId: string | null;
  source: NumoJournalSource;
  sourceConversationId?: string | null;
}): Promise<NumoJournalEntry> {
  const content = normalizeJournalContent(input.content);
  if (!content) {
    throw new NumoJournalError("invalid_content",
      `A journal entry is one non-empty sentence of ${NUMO_JOURNAL_MAX_LENGTH} characters at most.`);
  }
  if (!SOURCES.has(input.source)) throw new Error("Invalid Numo journal source");
  if (await countOpenJournalEntries(service, userId) >= NUMO_JOURNAL_OPEN_LIMIT) {
    throw new NumoJournalError("limit_reached",
      `The journal already holds ${NUMO_JOURNAL_OPEN_LIMIT} open entries, the maximum.`);
  }
  const row = await encodeNumoJournalRow({
    id: randomUUID(), user_id: userId, project_id: input.projectId,
    content, closed_reason: null, source: input.source,
    source_conversation_id: input.sourceConversationId ?? null,
    created_at: new Date().toISOString(),
  }, userId);
  const { data, error } = await service.from("numo_journal_entries").insert(row)
    .select(COLUMNS).single();
  if (error || !data) throw new NumoJournalError("database", "Unable to save the journal entry");
  return decodeNumoJournalRow(data as Row, userId);
}

/**
 * Close one open entry with the reason it no longer applies. The sentence
 * and the reason are sealed again together. Closing an entry that is
 * already closed, or another user's, is `not_found`.
 */
export async function closeJournalEntry(service: SupabaseClient, userId: string,
  id: string, reason: unknown,
  options: { scope?: JournalScope } = {}): Promise<NumoJournalEntry> {
  const closedReason = normalizeJournalReason(reason);
  if (!closedReason) {
    throw new NumoJournalError("invalid_reason",
      `A closing reason is one non-empty sentence of ${NUMO_JOURNAL_REASON_MAX_LENGTH} characters at most.`);
  }
  const { data: current, error: readError } = await service.from("numo_journal_entries")
    .select(COLUMNS).eq("user_id", userId).eq("id", id).is("closed_at", null).maybeSingle();
  if (readError) throw new NumoJournalError("database", "Unable to read Numo's journal");
  if (!current || !inJournalScope((current as Row).project_id as string | null, options.scope)) {
    throw new NumoJournalError("not_found", "No open journal entry with this id.");
  }
  let entry: NumoJournalEntry;
  try {
    entry = await decodeNumoJournalRow(current as Row, userId);
  } catch {
    // Never listed to Numo either; the retention sweep removes it.
    console.error("[numo-journal] decode_failed");
    throw new NumoJournalError("not_found", "No open journal entry with this id.");
  }
  // A sealed entry stays sealed, even if content encryption was switched off.
  const encoded = await encodeNumoJournalRow({
    id, user_id: userId, content: entry.content, closed_reason: closedReason,
  }, userId, { force: (current as Row).encryption_version !== 0 });
  // Conditional on the entry still being open: two turns closing it at once
  // write one reason.
  const { data, error } = await service.from("numo_journal_entries").update({
    content: encoded.content,
    closed_reason: encoded.closed_reason,
    encrypted_content: encoded.encrypted_content,
    encryption_version: encoded.encryption_version,
    closed_at: new Date().toISOString(),
  }).eq("user_id", userId).eq("id", id).is("closed_at", null).select(COLUMNS).maybeSingle();
  if (error) throw new NumoJournalError("database", "Unable to close the journal entry");
  if (!data) throw new NumoJournalError("not_found", "No open journal entry with this id.");
  return decodeNumoJournalRow(data as Row, userId);
}

/** Record that the user saw these entries. Returns how many were newly seen. */
export async function markJournalEntriesSeen(service: SupabaseClient, userId: string,
  ids: readonly string[]): Promise<number> {
  // A malformed id would fail the whole statement in Postgres.
  const valid = ids.filter((id) => UUID_PATTERN.test(id));
  if (valid.length === 0) return 0;
  const { data, error } = await service.from("numo_journal_entries")
    .update({ seen_at: new Date().toISOString() })
    .eq("user_id", userId).in("id", valid).is("seen_at", null)
    .select("id");
  if (error) throw new NumoJournalError("database", "Unable to update Numo's journal");
  return (data ?? []).length;
}

/**
 * Retention (MIN-927): delete entries closed before `closedBefore` that the
 * user saw, entries closed before `unseenClosedBefore` that nobody will see
 * any more, and open entries written before `openBefore`. Numo closes what
 * it settles; an entry still open that long is one it can no longer reach
 * (its project was left, its row no longer decodes) and would hold a place
 * under the cap for good.
 */
export async function purgeJournalEntries(service: SupabaseClient, input: {
  closedBefore: string;
  unseenClosedBefore: string;
  openBefore: string;
}): Promise<number> {
  const closed = await service.from("numo_journal_entries")
    .delete({ count: "exact" })
    .not("closed_at", "is", null)
    .lt("closed_at", input.closedBefore)
    .or(`seen_at.not.is.null,closed_at.lt.${input.unseenClosedBefore}`);
  if (closed.error) throw new Error(closed.error.message);
  const stale = await service.from("numo_journal_entries")
    .delete({ count: "exact" })
    .is("closed_at", null)
    .lt("created_at", input.openBefore);
  if (stale.error) throw new Error(stale.error.message);
  return (closed.count ?? 0) + (stale.count ?? 0);
}

/**
 * Delete the user's open entries about projects they can no longer open:
 * Numo never sees them again, so it could never close them. Returns how
 * many left.
 */
export async function deleteOpenJournalEntriesOfProjects(service: SupabaseClient,
  userId: string, projectIds: readonly string[]): Promise<number> {
  if (projectIds.length === 0) return 0;
  const { data, error } = await service.from("numo_journal_entries").delete()
    .eq("user_id", userId).in("project_id", projectIds as string[]).is("closed_at", null)
    .select("id");
  if (error) throw new NumoJournalError("database", "Unable to update Numo's journal");
  return (data ?? []).length;
}
