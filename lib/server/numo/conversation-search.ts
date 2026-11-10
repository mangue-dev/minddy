import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { decodeConversationTitle } from "./conversation-title-content";
import { hydrateNumoFinalMessages } from "./final-content";
import { hydrateNumoToolMessages } from "./tool-content";
import { hydrateNumoUserMessages } from "./user-message-content";

/**
 * Numo's search in the user's earlier conversations (MIN-956).
 *
 * Like Claude's chat search, and unlike ChatGPT's summaries injected in every
 * prompt, the history is read on demand: Numo's memory carries the lasting
 * facts in every turn, and Numo calls these when the user refers to something
 * said before.
 *
 * Messages and titles are encrypted at rest, so the search cannot run in SQL:
 * it decrypts a bounded window of the user's most recent conversations and
 * matches in memory. The conversations are the ones the user's history lists
 * (`numo_user_conversation_history`: no routine occurrence, no background
 * wake), read with the service client and always filtered on their owner.
 * Only what the user wrote and Numo's final answers are searched and read;
 * tool calls and their results stay out.
 */

/** Conversations decrypted by one search, the most recently active first. */
export const CONVERSATION_SEARCH_WINDOW = 100;
/** Messages decrypted by one search, across those conversations. */
export const CONVERSATION_SEARCH_MESSAGE_BUDGET = 2_000;
export const CONVERSATION_SEARCH_DEFAULT_LIMIT = 5;
export const CONVERSATION_SEARCH_MAX_LIMIT = 10;
/** Messages decrypted for one batch of ten conversations. */
const MESSAGES_PER_BATCH = 400;
/** Excerpts returned for one matching conversation. */
const SNIPPETS_PER_CONVERSATION = 3;
const SNIPPET_CHARS = 240;
const OPENING_CHARS = 200;
/** Messages returned by one read_conversation page. */
export const CONVERSATION_READ_PAGE = 40;
/** Characters kept of one message in a transcript page. */
const READ_MESSAGE_CHARS = 4_000;
/** Messages a transcript may span: a safety bound, far above a real thread. */
const READ_MESSAGE_LIMIT = 2_000;

type HistoryRow = {
  legacy_id: string;
  user_id: string;
  project_id: string | null;
  title: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  role: string;
  content: unknown;
  tool_calls: unknown;
  tool_call_id: string | null;
  tool_name: string | null;
  metadata: unknown;
  context: unknown;
  created_at: string;
};

export interface ConversationText {
  role: "user" | "assistant";
  text: string;
  created_at: string;
}

export interface ConversationSummary {
  conversation_id: string;
  title: string | null;
  project_id: string | null;
  archived: boolean;
  started_at: string;
  last_active_at: string;
}

export interface ConversationSearchMatch extends ConversationSummary {
  /** Where the terms appear, with the message they come from. */
  excerpts?: Array<{ role: "user" | "assistant"; created_at: string; text: string }>;
  /** The user's first message, when the search had no terms. */
  opening?: string | null;
}

export class ConversationSearchError extends Error {
  constructor(readonly code: "invalid_date" | "invalid_range" | "not_found", message: string) {
    super(message);
  }
}

/** Lowercase with accents removed, so a term matches whatever its case and accents. */
export function foldForSearch(value: string): string {
  return value.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase();
}

/** The query's terms: quoted phrases kept whole, other words one by one. */
export function searchTerms(query: string): string[] {
  const terms: string[] = [];
  const pattern = /"([^"]+)"|(\S+)/g;
  for (const match of query.matchAll(pattern)) {
    const term = foldForSearch((match[1] ?? match[2]).trim())
      .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    if (term.length >= 2 && !terms.includes(term)) terms.push(term);
  }
  return terms.slice(0, 12);
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  for (let at = haystack.indexOf(needle); at >= 0; at = haystack.indexOf(needle, at + needle.length)) {
    count += 1;
  }
  return count;
}

/** A window of the text around the first term it contains. */
export function excerptAround(text: string, terms: readonly string[], width = SNIPPET_CHARS): string {
  const flat = text.replace(/\s+/g, " ").trim();
  // Folding keeps one character per character for nearly every text; when it
  // does not (a rare ligature), the start of the message is a safe excerpt.
  const folded = foldForSearch(flat);
  const aligned = folded.length === flat.length;
  const first = aligned
    ? Math.min(...terms.map((term) => folded.indexOf(term)).filter((at) => at >= 0))
    : 0;
  const center = Number.isFinite(first) ? first : 0;
  const start = Math.max(0, center - Math.floor(width / 3));
  const end = Math.min(flat.length, start + width);
  return `${start > 0 ? "…" : ""}${flat.slice(start, end).trim()}${end < flat.length ? "…" : ""}`;
}

function clip(text: string, chars: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > chars ? `${flat.slice(0, chars).trimEnd()}…` : flat;
}

interface ScoredConversation {
  row: HistoryRow;
  title: string | null;
  distinct: number;
  hits: number;
  excerpts: NonNullable<ConversationSearchMatch["excerpts"]>;
}

/**
 * Rank the conversations against the terms: the most distinct terms first,
 * then the most occurrences, then the most recent activity. A conversation
 * matching no term is left out.
 */
export function rankConversations(
  conversations: ReadonlyArray<{ row: HistoryRow; title: string | null; messages: ConversationText[] }>,
  terms: readonly string[],
): ScoredConversation[] {
  const scored: ScoredConversation[] = [];
  for (const { row, title, messages } of conversations) {
    const matched = new Set<string>();
    let hits = 0;
    const foldedTitle = foldForSearch(title ?? "");
    for (const term of terms) {
      const count = countOccurrences(foldedTitle, term);
      if (count > 0) matched.add(term);
      // A term in the title says more about the subject than one in passing.
      hits += count * 3;
    }
    const excerpts: ScoredConversation["excerpts"] = [];
    for (const message of messages) {
      const folded = foldForSearch(message.text);
      const present = terms.filter((term) => folded.includes(term));
      if (present.length === 0) continue;
      for (const term of present) {
        matched.add(term);
        hits += countOccurrences(folded, term);
      }
      if (excerpts.length < SNIPPETS_PER_CONVERSATION) {
        excerpts.push({ role: message.role, created_at: message.created_at,
          text: excerptAround(message.text, present) });
      }
    }
    if (matched.size > 0) scored.push({ row, title, distinct: matched.size, hits, excerpts });
  }
  return scored.sort((a, b) => b.distinct - a.distinct || b.hits - a.hits
    || b.row.updated_at.localeCompare(a.row.updated_at));
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function dayBound(value: unknown, name: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !DAY.test(value.trim()) ||
      Number.isNaN(Date.parse(`${value.trim()}T00:00:00Z`))) {
    throw new ConversationSearchError("invalid_date", `${name} must be a date written YYYY-MM-DD.`);
  }
  return value.trim();
}

function nextDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

async function listHistory(service: SupabaseClient, userId: string, options: {
  excludeConversationId: string | null;
  after: string | null;
  before: string | null;
  limit: number;
}): Promise<HistoryRow[]> {
  let query = service.from("numo_user_conversation_history")
    .select("legacy_id, user_id, project_id, title, archived_at, created_at, updated_at")
    .eq("user_id", userId);
  if (options.excludeConversationId) query = query.neq("legacy_id", options.excludeConversationId);
  // A conversation counts in a period when it was active during it: started
  // before its end and still going after its start.
  if (options.after) query = query.gte("updated_at", `${options.after}T00:00:00Z`);
  if (options.before) query = query.lt("created_at", nextDay(options.before));
  const { data, error } = await query.order("updated_at", { ascending: false })
    .order("legacy_id", { ascending: true }).limit(options.limit);
  if (error) throw new Error("Unable to read the Numo conversation history");
  return (data ?? []) as HistoryRow[];
}

/** Decrypt what the user wrote and Numo's final answers, oldest first. */
export function conversationTexts(rows: readonly MessageRow[]): ConversationText[] {
  const texts: ConversationText[] = [];
  for (const row of rows) {
    if (row.role !== "user" && row.role !== "assistant") continue;
    if (row.role === "assistant" && Array.isArray(row.tool_calls) && row.tool_calls.length > 0) continue;
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    // The rows of a context compaction step and the hidden inputs of the
    // background worker are not part of what was said.
    if (metadata.context_compaction === true || Object.hasOwn(metadata, "worker_input") ||
        Object.hasOwn(metadata, "worker_steering")) continue;
    if (typeof row.content !== "string" || !row.content.trim()) continue;
    texts.push({ role: row.role, text: row.content, created_at: row.created_at });
  }
  return texts.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

async function hydrate(service: SupabaseClient, userId: string, rows: MessageRow[]) {
  return hydrateNumoToolMessages(service,
    await hydrateNumoFinalMessages(service,
      await hydrateNumoUserMessages(service, rows, userId), userId), userId);
}

const MESSAGE_COLUMNS =
  "id, conversation_id, role, content, tool_calls, tool_call_id, tool_name, metadata, context, created_at";

/** The messages of these conversations, within a budget, newest conversations first. */
async function loadMessages(service: SupabaseClient, userId: string,
  conversationIds: readonly string[], budget: number): Promise<Map<string, ConversationText[]>> {
  const byConversation = new Map<string, ConversationText[]>();
  let remaining = budget;
  for (let offset = 0; offset < conversationIds.length && remaining > 0; offset += 10) {
    const batch = conversationIds.slice(offset, offset + 10);
    const { data, error } = await service.from("assistant_messages")
      .select(MESSAGE_COLUMNS)
      .in("conversation_id", batch)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: false }).order("id", { ascending: false })
      // One very long conversation must not use up the whole budget: its
      // most recent messages are searched, and the next batches still run.
      .limit(Math.min(remaining, MESSAGES_PER_BATCH));
    if (error) throw new Error("Unable to read the Numo conversation messages");
    const rows = (data ?? []) as MessageRow[];
    remaining -= rows.length;
    const hydrated = await hydrate(service, userId, rows);
    for (const id of batch) {
      byConversation.set(id, conversationTexts(hydrated.filter((row) => row.conversation_id === id)));
    }
  }
  return byConversation;
}

/** The user's first message in a conversation, shortened. */
async function openingOf(service: SupabaseClient, userId: string,
  conversationId: string): Promise<string | null> {
  const { data, error } = await service.from("assistant_messages")
    .select(MESSAGE_COLUMNS)
    .eq("conversation_id", conversationId).eq("role", "user")
    .order("created_at", { ascending: true }).order("id", { ascending: true })
    .limit(5);
  if (error) throw new Error("Unable to read the Numo conversation messages");
  const first = conversationTexts(await hydrate(service, userId, (data ?? []) as MessageRow[]))[0];
  return first ? clip(first.text, OPENING_CHARS) : null;
}

async function titleOf(userId: string, row: HistoryRow): Promise<string | null> {
  return decodeConversationTitle(userId, row.legacy_id, row.title, userId);
}

function summary(row: HistoryRow, title: string | null): ConversationSummary {
  return {
    conversation_id: row.legacy_id,
    title,
    project_id: row.project_id,
    archived: row.archived_at !== null,
    started_at: row.created_at,
    last_active_at: row.updated_at,
  };
}

/**
 * Search the user's earlier conversations. With terms, the conversations that
 * contain them, best match first, with excerpts; without, the most recently
 * active ones, with the user's first message.
 */
export async function searchNumoConversations(service: SupabaseClient, userId: string, input: {
  query?: unknown;
  after?: unknown;
  before?: unknown;
  limit?: unknown;
  excludeConversationId?: string | null;
}): Promise<{
  conversations: ConversationSearchMatch[];
  searched: number;
  window_full: boolean;
}> {
  const after = dayBound(input.after, "after");
  const before = dayBound(input.before, "before");
  if (after && before && after > before) {
    throw new ConversationSearchError("invalid_range", "after must not be later than before.");
  }
  const requested = typeof input.limit === "number" && Number.isInteger(input.limit) ? input.limit
    : CONVERSATION_SEARCH_DEFAULT_LIMIT;
  const limit = Math.min(Math.max(requested, 1), CONVERSATION_SEARCH_MAX_LIMIT);
  const terms = typeof input.query === "string" ? searchTerms(input.query) : [];
  const history = await listHistory(service, userId, {
    excludeConversationId: input.excludeConversationId ?? null, after, before,
    limit: terms.length ? CONVERSATION_SEARCH_WINDOW : limit,
  });
  const titles = await Promise.all(history.map((row) => titleOf(userId, row)));

  if (terms.length === 0) {
    const openings = await Promise.all(history.map((row) => openingOf(service, userId, row.legacy_id)));
    return {
      conversations: history.map((row, index) => ({ ...summary(row, titles[index]), opening: openings[index] })),
      searched: history.length,
      window_full: false,
    };
  }

  const messages = await loadMessages(service, userId, history.map((row) => row.legacy_id),
    CONVERSATION_SEARCH_MESSAGE_BUDGET);
  const ranked = rankConversations(history.map((row, index) => ({
    row, title: titles[index], messages: messages.get(row.legacy_id) ?? [],
  })), terms);
  return {
    conversations: ranked.slice(0, limit).map((match) => ({
      ...summary(match.row, match.title), excerpts: match.excerpts,
    })),
    searched: history.length,
    // Older conversations were not searched: narrowing the dates reaches them.
    window_full: history.length >= CONVERSATION_SEARCH_WINDOW,
  };
}

/** One page of an earlier conversation: what the user wrote and Numo answered. */
export async function readNumoConversation(service: SupabaseClient, userId: string, input: {
  conversationId: string;
  offset?: unknown;
}): Promise<ConversationSummary & {
  messages: ConversationText[];
  total: number;
  next_offset: number | null;
}> {
  const { data, error } = await service.from("numo_user_conversation_history")
    .select("legacy_id, user_id, project_id, title, archived_at, created_at, updated_at")
    .eq("user_id", userId).eq("legacy_id", input.conversationId).maybeSingle();
  if (error) throw new Error("Unable to read the Numo conversation history");
  if (!data) {
    throw new ConversationSearchError("not_found",
      "No conversation of the user with this id. Take ids from search_conversations.");
  }
  const row = data as HistoryRow;
  const rows: MessageRow[] = [];
  for (let offset = 0; offset < READ_MESSAGE_LIMIT; offset += 500) {
    const { data: page, error: pageError } = await service.from("assistant_messages")
      .select(MESSAGE_COLUMNS)
      .eq("conversation_id", row.legacy_id)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: true }).order("id", { ascending: true })
      .range(offset, offset + 499);
    if (pageError) throw new Error("Unable to read the Numo conversation messages");
    rows.push(...((page ?? []) as MessageRow[]));
    if (!page || page.length < 500) break;
  }
  const texts = conversationTexts(await hydrate(service, userId, rows));
  const start = typeof input.offset === "number" && Number.isInteger(input.offset) && input.offset > 0
    ? input.offset : 0;
  const end = start + CONVERSATION_READ_PAGE;
  return {
    ...summary(row, await titleOf(userId, row)),
    messages: texts.slice(start, end).map((message) => ({
      ...message, text: message.text.length > READ_MESSAGE_CHARS
        ? `${message.text.slice(0, READ_MESSAGE_CHARS)}…` : message.text,
    })),
    total: texts.length,
    next_offset: end < texts.length ? end : null,
  };
}
