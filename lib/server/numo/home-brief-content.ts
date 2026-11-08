import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { EncryptedRowCodec, type StoredRow } from "@/lib/server/encryption/row-codec";
import { getEncryptedStore } from "@/lib/server/encryption/registry";
import { isContentEncryptionEnabled } from "@/lib/server/encryption/content-config";

/**
 * Numo's word on the home page (MIN-930): the codec and the only repository
 * of `numo_home_briefs`. Every call is bound to one user and filters on it,
 * since the table is service-only. The text and the suggestions are sealed
 * together under the user's key once content encryption is enabled, like the
 * journal they sum up.
 *
 * Each rewrite is a new version; the latest one is shown.
 */

export interface NumoHomeSuggestion {
  /** What the row shows: a few words. */
  label: string;
  /** What the row puts in the composer. */
  prompt: string;
}

export interface NumoHomeBrief {
  id: string;
  content: string;
  suggestions: NumoHomeSuggestion[];
  journal_entry_ids: string[];
  journal_digest: string;
  conversation_id: string | null;
  generated_at: string;
}

/** Versions kept per user. The oldest leave when a new one is written. */
export const NUMO_HOME_BRIEF_VERSIONS = 50;
/** Characters of the text, mentions included (a stored mention has no label). */
export const NUMO_HOME_BRIEF_MAX_LENGTH = 1_000;
/** Suggestions written with one version. */
export const NUMO_HOME_SUGGESTION_LIMIT = 4;
export const NUMO_HOME_SUGGESTION_LABEL_MAX = 80;
export const NUMO_HOME_SUGGESTION_PROMPT_MAX = 400;

type Row = Record<string, unknown>;

const COLUMNS = "id, user_id, content, suggestions, encrypted_content, encryption_version, journal_entry_ids, journal_digest, conversation_id, generated_at";

const context = (userId: string) => ({
  table: "numo_home_briefs" as const,
  scope: { kind: "user" as const, id: userId },
});

export class NumoHomeBriefError extends Error {
  constructor(readonly code: "invalid" | "database", message: string) {
    super(message);
  }
}

/** Suggestions as stored: an array of up to four complete `{ label, prompt }`. */
export function normalizeHomeSuggestions(value: unknown): NumoHomeSuggestion[] | null {
  if (!Array.isArray(value)) return null;
  const suggestions: NumoHomeSuggestion[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const { label, prompt } = item as Record<string, unknown>;
    if (typeof label !== "string" || typeof prompt !== "string") return null;
    const cleanLabel = label.replace(/\s+/g, " ").trim();
    const cleanPrompt = prompt.trim();
    if (!cleanLabel || !cleanPrompt || cleanLabel.length > NUMO_HOME_SUGGESTION_LABEL_MAX ||
        cleanPrompt.length > NUMO_HOME_SUGGESTION_PROMPT_MAX) return null;
    suggestions.push({ label: cleanLabel, prompt: cleanPrompt });
  }
  return suggestions.length <= NUMO_HOME_SUGGESTION_LIMIT ? suggestions : null;
}

/** Seal a complete row before it is written, when content encryption is on. */
export async function encodeNumoHomeBriefRow(row: Row, userId: string): Promise<Row> {
  if (row.user_id !== userId || typeof row.id !== "string" || !row.id ||
      typeof row.content !== "string" || !Array.isArray(row.suggestions)) {
    throw new Error("Incomplete Numo home brief");
  }
  if (!isContentEncryptionEnabled()) {
    return { ...row, encryption_version: 0, encrypted_content: null };
  }
  return new EncryptedRowCodec(getEncryptedStore()).encode({
    ...row, encryption_version: 0, encrypted_content: null,
  } as StoredRow, context(userId));
}

export async function decodeNumoHomeBriefRow(row: Row, userId: string): Promise<NumoHomeBrief> {
  if (row.user_id !== userId) throw new Error("Invalid Numo home brief owner");
  let content: unknown;
  let suggestions: unknown;
  if (row.encryption_version === 0) {
    if (row.encrypted_content != null) throw new Error("Invalid clear Numo home brief");
    content = row.content;
    suggestions = row.suggestions;
  } else {
    const decoded = await new EncryptedRowCodec(getEncryptedStore()).decode(
      row as StoredRow, context(userId), { actorId: userId, reason: "repository_read" });
    content = decoded.content;
    suggestions = decoded.suggestions;
  }
  if (typeof content !== "string") throw new Error("Invalid Numo home brief content");
  const normalized = normalizeHomeSuggestions(suggestions);
  if (!normalized) throw new Error("Invalid Numo home brief suggestions");
  return {
    id: row.id as string,
    content,
    suggestions: normalized,
    journal_entry_ids: Array.isArray(row.journal_entry_ids) ? row.journal_entry_ids as string[] : [],
    journal_digest: row.journal_digest as string,
    conversation_id: (row.conversation_id as string | null) ?? null,
    generated_at: row.generated_at as string,
  };
}

/**
 * The user's latest version, or `null` when Numo has written none or the
 * latest no longer decodes (logged; the next rewrite replaces it).
 */
export async function getLatestHomeBrief(service: SupabaseClient,
  userId: string): Promise<NumoHomeBrief | null> {
  const { data, error } = await service.from("numo_home_briefs").select(COLUMNS)
    .eq("user_id", userId)
    .order("generated_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(1).maybeSingle();
  if (error) throw new NumoHomeBriefError("database", "Unable to read Numo's home brief");
  if (!data) return null;
  try {
    return await decodeNumoHomeBriefRow(data as Row, userId);
  } catch {
    console.error("[numo-home-brief] decode_failed");
    return null;
  }
}

/** One version of the user, decoded, or `null` when it is not theirs or no longer decodes. */
export async function getHomeBrief(service: SupabaseClient, userId: string,
  id: string): Promise<NumoHomeBrief | null> {
  const { data, error } = await service.from("numo_home_briefs").select(COLUMNS)
    .eq("user_id", userId).eq("id", id).maybeSingle();
  if (error) throw new NumoHomeBriefError("database", "Unable to read Numo's home brief");
  if (!data) return null;
  try {
    return await decodeNumoHomeBriefRow(data as Row, userId);
  } catch {
    console.error("[numo-home-brief] decode_failed");
    return null;
  }
}

/** The digest of the latest version, without decoding it. */
export async function getLatestHomeBriefDigest(service: SupabaseClient,
  userId: string): Promise<string | null> {
  const { data, error } = await service.from("numo_home_briefs").select("journal_digest")
    .eq("user_id", userId)
    .order("generated_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(1).maybeSingle();
  if (error) throw new NumoHomeBriefError("database", "Unable to read Numo's home brief");
  return (data?.journal_digest as string | undefined) ?? null;
}

/** One version of the user, without its text: what the "seen" route needs. */
export async function getHomeBriefEntryIds(service: SupabaseClient, userId: string,
  id: string): Promise<string[] | null> {
  const { data, error } = await service.from("numo_home_briefs").select("journal_entry_ids")
    .eq("user_id", userId).eq("id", id).maybeSingle();
  if (error) throw new NumoHomeBriefError("database", "Unable to read Numo's home brief");
  if (!data) return null;
  return Array.isArray(data.journal_entry_ids) ? data.journal_entry_ids as string[] : [];
}

/** Every version of the user, newest first: the account export. */
export async function listAllHomeBriefs(service: SupabaseClient,
  userId: string): Promise<NumoHomeBrief[]> {
  const { data, error } = await service.from("numo_home_briefs").select(COLUMNS)
    .eq("user_id", userId)
    .order("generated_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(NUMO_HOME_BRIEF_VERSIONS * 2);
  if (error) throw new NumoHomeBriefError("database", "Unable to read Numo's home brief");
  const briefs: NumoHomeBrief[] = [];
  for (const row of (data ?? []) as Row[]) {
    try {
      briefs.push(await decodeNumoHomeBriefRow(row, userId));
    } catch {
      console.error("[numo-home-brief] decode_failed");
    }
  }
  return briefs;
}

/** Write a new version, then drop the versions past the kept ones. */
export async function writeHomeBrief(service: SupabaseClient, userId: string, input: {
  content: string;
  suggestions: NumoHomeSuggestion[];
  journalEntryIds: string[];
  journalDigest: string;
  conversationId: string | null;
}): Promise<NumoHomeBrief> {
  const content = input.content.trim();
  const suggestions = normalizeHomeSuggestions(input.suggestions);
  if (!content || content.length > NUMO_HOME_BRIEF_MAX_LENGTH || !suggestions) {
    throw new NumoHomeBriefError("invalid", "Invalid Numo home brief");
  }
  const row = await encodeNumoHomeBriefRow({
    id: randomUUID(), user_id: userId, content, suggestions,
    journal_entry_ids: input.journalEntryIds,
    journal_digest: input.journalDigest,
    conversation_id: input.conversationId,
    generated_at: new Date().toISOString(),
  }, userId);
  const { data, error } = await service.from("numo_home_briefs").insert(row)
    .select(COLUMNS).single();
  if (error || !data) throw new NumoHomeBriefError("database", "Unable to save Numo's home brief");
  const written = await decodeNumoHomeBriefRow(data as Row, userId);
  await pruneHomeBriefs(service, userId);
  return written;
}

/** Best effort: a failed prune leaves a few more versions until the next write. */
async function pruneHomeBriefs(service: SupabaseClient, userId: string): Promise<void> {
  const { data, error } = await service.from("numo_home_briefs").select("id")
    .eq("user_id", userId)
    .order("generated_at", { ascending: false })
    .order("id", { ascending: true })
    .range(NUMO_HOME_BRIEF_VERSIONS, NUMO_HOME_BRIEF_VERSIONS + 99);
  if (error || !data?.length) return;
  const { error: deleteError } = await service.from("numo_home_briefs").delete()
    .eq("user_id", userId).in("id", data.map((row) => row.id as string));
  if (deleteError) console.error("[numo-home-brief] prune_failed");
}
