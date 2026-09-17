import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NumoConversation, NumoConversationDetail, NumoLegacySource } from "@/lib/assistant-types";
import { isReasoningLevel } from "@/lib/agent-reasoning";
import { publicSkillsMetadata } from "@/lib/server/assistant/skills";

export const NUMO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const NUMO_CONVERSATIONS_PAGE_SIZE = 50;
export const MAX_NUMO_CONVERSATIONS_PAGE_SIZE = 500;

/** Always pass the request's RLS client, including for legacy link resolution. */
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
  const rows = (data ?? []) as NumoConversation[];
  return { conversations: rows.slice(0, limit), hasMore: rows.length > limit };
}

export async function getNumoConversation(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase.from("numo_conversation_history")
    .select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as NumoConversation | null;
}

/** Read the assistant-only persisted choices through the caller's RLS client. */
export async function getNumoConversationConfig(
  supabase: SupabaseClient,
  id: string,
): Promise<{ model: string | null; reasoningLevel: string | null } | null> {
  const conversation = await getNumoConversation(supabase, id);
  if (!conversation || conversation.source !== "assistant") return null;
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

/**
 * Map a legacy reference (old assistant id, old worker run) onto the common
 * conversation identity, plus the delegated work to reveal when it is a run.
 */
export async function resolveNumoConversation(
  supabase: SupabaseClient, source: NumoLegacySource, id: string,
): Promise<{ conversationId: string; workId: string | null } | null> {
  if (source === "run") {
    const { data, error } = await supabase.from("numo_work")
      .select("id, conversation_id").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? { conversationId: data.conversation_id, workId: data.id } : null;
  }
  if (source === "agent") {
    const { data: origin, error } = await supabase.from("numo_work_origins")
      .select("conversation_id").eq("agent_id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (origin) return { conversationId: origin.conversation_id, workId: null };
  }
  const { data, error } = await supabase.from("numo_conversation_ids")
    .select("id").eq(source === "assistant" ? "assistant_id" : "agent_id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { conversationId: data.id, workId: null } : null;
}

async function collection(supabase: SupabaseClient, table: string, id: string) {
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += 500) {
    let query = supabase.from(table).select("*").eq("conversation_id", id)
      .order("created_at", { ascending: true }).order("id", { ascending: true });
    if (table === "numo_messages") query = query.order("source", { ascending: true });
    const { data, error } = await query.range(offset, offset + 499);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 500) return rows;
  }
}

export async function getNumoConversationDetail(supabase: SupabaseClient, id: string): Promise<NumoConversationDetail | null> {
  const conversation = await getNumoConversation(supabase, id);
  if (!conversation) return null;
  const [config, messages, work, contexts, artifacts, turns, occurrenceResult] = await Promise.all([
    getNumoConversationConfig(supabase, id),
    collection(supabase, "numo_messages", id), collection(supabase, "numo_work", id),
    collection(supabase, "numo_contexts", id), collection(supabase, "numo_artifacts", id),
    collection(supabase, "numo_turns", id),
    supabase.from("numo_routine_occurrences")
      .select("id, routine_id, origin, scheduled_for, created_at")
      .eq("conversation_id", conversation.legacy_id)
      .maybeSingle(),
  ]);
  if (occurrenceResult.error) throw new Error(occurrenceResult.error.message);
  const safeMessages: Record<string, unknown>[] = messages.map((m) => ({ ...m, metadata: publicSkillsMetadata(m.metadata) }));
  return {
    conversation: {
      ...conversation,
      ...(config ? { model: config.model, reasoning_level: config.reasoningLevel } : {}),
    },
    messages: safeMessages.filter((m) => m.kind !== "action"),
    actions: safeMessages.filter((m) => m.kind === "action"),
    work, contexts, artifacts, turns,
    routine_occurrence: occurrenceResult.data ?? null,
  } as unknown as NumoConversationDetail;
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
