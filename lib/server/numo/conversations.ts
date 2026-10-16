import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NumoConversation, NumoConversationDetail } from "@/lib/assistant-types";
import { isReasoningLevel } from "@/lib/agent-reasoning";
import { publicSkillsMetadata } from "@/lib/server/assistant/skills";
import { hydrateNumoUserMessages } from "./user-message-content";
import { hydrateNumoToolMessages } from "./tool-content";
import { decodeNumoTurnOutcome, hydrateNumoFinalMessages,
  isEncryptedNumoTurnOutcome } from "./final-content";
import { decodeConversationTitle } from "./conversation-title-content";
import { decodeNumoError } from "./error-content";

export const NUMO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const NUMO_CONVERSATIONS_PAGE_SIZE = 50;
export const MAX_NUMO_CONVERSATIONS_PAGE_SIZE = 500;

async function hydrateAssistantTitles<T extends NumoConversation>(rows: T[]):
  Promise<T[]> {
  return Promise.all(rows.map(async (row) => {
    if (!row.user_id || !row.legacy_id) {
      throw new Error("Numo conversation owner is unavailable");
    }
    return { ...row, title: await decodeConversationTitle(row.user_id,
      row.legacy_id, row.title),
      error_message: await decodeNumoError(row.user_id, "conversations",
        row.legacy_id, row.error_message) };
  }));
}

/** Always pass the request's RLS client. */
export async function listNumoConversations(
  supabase: SupabaseClient,
  projectId?: string | null,
  limit = NUMO_CONVERSATIONS_PAGE_SIZE,
) {
  let query = supabase.from("numo_user_conversation_history").select("*")
    .order("updated_at", { ascending: false }).order("id", { ascending: true })
    // Fetch one extra row so the UI can disclose that older history exists.
    .range(0, limit);
  if (projectId) query = query.eq("project_id", projectId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = await hydrateAssistantTitles((data ?? []) as NumoConversation[]);
  return { conversations: rows.slice(0, limit), hasMore: rows.length > limit };
}

export async function getNumoConversation(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase.from("numo_conversation_history")
    .select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return (await hydrateAssistantTitles([data as NumoConversation]))[0];
}

/** Read the assistant-only persisted choices through the caller's RLS client. */
export async function getNumoConversationConfig(
  supabase: SupabaseClient,
  id: string,
): Promise<{ model: string | null; reasoningLevel: string | null } | null> {
  const conversation = await getNumoConversation(supabase, id);
  if (!conversation) return null;
  const { data, error } = await supabase
    .from("conversations")
    .select("model, reasoning_level")
    .eq("id", conversation.legacy_id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return {
    model: typeof data?.model === "string" ? data.model : null,
    reasoningLevel: isReasoningLevel(data?.reasoning_level) ? data.reasoning_level : null,
  };
}

async function collection(supabase: SupabaseClient, table: string, id: string) {
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += 500) {
    let query = supabase.from(table).select("*").eq("conversation_id", id)
      .order("created_at", { ascending: true }).order("id", { ascending: true });
    const { data, error } = await query.range(offset, offset + 499);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 500) return rows;
  }
}

export async function getNumoConversationDetail(
  supabase: SupabaseClient, id: string, actorId: string | null = null,
): Promise<NumoConversationDetail | null> {
  const conversation = await getNumoConversation(supabase, id);
  if (!conversation) return null;
  const [config, messages, turns, occurrenceResult] = await Promise.all([
    getNumoConversationConfig(supabase, id),
    collection(supabase, "numo_messages", id),
    collection(supabase, "numo_turns", id),
    supabase.from("numo_routine_occurrences")
      .select("id, routine_id, origin, scheduled_for, created_at, event_id, subject_id, subject_type")
      .eq("conversation_id", conversation.legacy_id)
      .maybeSingle(),
  ]);
  if (occurrenceResult.error) throw new Error(occurrenceResult.error.message);
  const hydratedMessages = await hydrateNumoToolMessages(supabase,
    await hydrateNumoFinalMessages(supabase,
      await hydrateNumoUserMessages(supabase, messages, actorId), actorId), actorId);
  const safeMessages: Record<string, unknown>[] = hydratedMessages.map((m) =>
    ({ ...m, metadata: publicSkillsMetadata(m.metadata) }));
  return {
    conversation: {
      ...conversation,
      ...(config ? { model: config.model, reasoning_level: config.reasoningLevel } : {}),
    },
    messages: safeMessages.filter((m) => m.kind !== "action"),
    actions: safeMessages.filter((m) => m.kind === "action"),
    turns: await hydrateNumoAssistantTurnOutcomes(turns, actorId),
    routine_occurrence: occurrenceResult.data ?? null,
  } as unknown as NumoConversationDetail;
}

async function hydrateNumoAssistantTurnOutcomes(
  turns: Record<string, unknown>[], actorId: string | null,
) {
  return Promise.all(turns.map(async (turn) => {
    const outcome = turn.outcome as string | null;
    if (!isEncryptedNumoTurnOutcome(outcome) &&
        !String(turn.error_message ?? "").startsWith("mdye3:")) return turn;
    const userId = turn.initiated_by as string | null;
    if (!userId || actorId && actorId !== userId) {
      throw new Error("Numo turn outcome owner changed");
    }
    return { ...turn,
      outcome: await decodeNumoTurnOutcome(userId,
        turn.id as string, outcome, actorId),
      error_message: await decodeNumoError(userId, "numo_assistant_turns",
        turn.id as string, turn.error_message as string | null, actorId) };
  }));
}

export function validNumoPatch(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return entries.length > 0 && entries.every(([key, v]) => {
    if (key === "title") return v === null || (typeof v === "string" && v.length <= 200);
    if (key === "model") return v === null || (typeof v === "string" && v.length <= 300);
    if (key === "reasoningLevel") return v === null || isReasoningLevel(v);
    return ["archived", "pinned", "read"].includes(key) && typeof v === "boolean";
  });
}
