import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NumoConversation, NumoConversationDetail, NumoLegacySource } from "@/lib/assistant-types";
import { publicSkillsMetadata } from "@/lib/server/assistant/skills";

export const NUMO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Always pass the request's RLS client, including for legacy link resolution. */
export async function listNumoConversations(supabase: SupabaseClient, projectId?: string | null) {
  const conversations: NumoConversation[] = [];
  // PostgREST caps responses; page through the stable total order instead of
  // silently dropping older conversations from a merged history.
  for (let offset = 0; ; offset += 500) {
    let query = supabase.from("numo_conversation_history").select("*")
      .order("updated_at", { ascending: false }).order("id", { ascending: true })
      .range(offset, offset + 499);
    if (projectId) query = query.eq("project_id", projectId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    conversations.push(...(data ?? []) as NumoConversation[]);
    if (!data || data.length < 500) return conversations;
  }
}

export async function getNumoConversation(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase.from("numo_conversation_history")
    .select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as NumoConversation | null;
}

export async function resolveNumoConversation(
  supabase: SupabaseClient, source: NumoLegacySource, id: string,
): Promise<{ conversationId: string; workId: string | null; detailHref: string | null } | null> {
  if (source === "run") {
    const { data, error } = await supabase.from("numo_work")
      .select("id, conversation_id, detail_href").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? { conversationId: data.conversation_id, workId: data.id, detailHref: data.detail_href } : null;
  }
  if (source === "agent") {
    const { data: origin, error } = await supabase.from("numo_work_origins")
      .select("conversation_id").eq("agent_id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (origin) return { conversationId: origin.conversation_id, workId: null, detailHref: `/agents?run=${id}` };
  }
  const { data, error } = await supabase.from("numo_conversation_ids")
    .select("id").eq(source === "assistant" ? "assistant_id" : "agent_id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { conversationId: data.id, workId: null, detailHref: source === "agent" ? `/agents?run=${id}` : null } : null;
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
  const [messages, work, contexts, artifacts, turns] = await Promise.all([
    collection(supabase, "numo_messages", id), collection(supabase, "numo_work", id),
    collection(supabase, "numo_contexts", id), collection(supabase, "numo_artifacts", id),
    collection(supabase, "numo_turns", id),
  ]);
  const safeMessages: Record<string, unknown>[] = messages.map((m) => ({ ...m, metadata: publicSkillsMetadata(m.metadata) }));
  return {
    conversation,
    messages: safeMessages.filter((m) => m.kind !== "action"),
    actions: safeMessages.filter((m) => m.kind === "action"),
    work,
    contexts, artifacts, turns,
  } as unknown as NumoConversationDetail;
}

export function validNumoPatch(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return entries.length > 0 && entries.every(([key, v]) => key === "title"
    ? v === null || (typeof v === "string" && v.length <= 200)
    : ["archived", "pinned", "read"].includes(key) && typeof v === "boolean");
}
