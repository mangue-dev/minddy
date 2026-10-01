import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReasoningLevel } from "@/lib/agent-reasoning";

/** Reserve the browser's private conversation identity without overwriting a race winner. */
export async function ensureNumoRequestConversation(input: {
  service: SupabaseClient;
  conversationId: string;
  userId: string;
  title?: string | null;
  model?: string | null;
  reasoningLevel?: ReasoningLevel | null;
}): Promise<{ created: boolean }> {
  const { service, conversationId, userId } = input;
  const { error } = await service.from("conversations").insert({
    id: conversationId,
    user_id: userId,
    project_id: null,
    title: input.title ?? null,
    ...(input.model != null ? { model: input.model } : {}),
    ...(input.reasoningLevel != null ? { reasoning_level: input.reasoningLevel } : {}),
  });
  if (!error) return { created: true };
  if (error.code !== "23505") throw new Error("Unable to reserve Numo conversation");
  const { data: existing, error: readError } = await service.from("conversations")
    .select("id").eq("id", conversationId).eq("user_id", userId).maybeSingle();
  if (readError || !existing) throw new Error("Numo conversation is unavailable");
  return { created: false };
}
