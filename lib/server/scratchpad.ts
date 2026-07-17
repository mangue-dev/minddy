import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { planProgress, type PlanProgress } from "@/lib/plan";
import { MAX_SCRATCHPAD_LENGTH } from "@/lib/scratchpad";

/**
 * Cœur du scratchpad perso (Notes) — la note markdown UNIQUE de l'utilisateur.
 * Partagé par la route API (`/api/me/scratchpad`, client RLS de l'utilisateur)
 * et les tools MCP (client service). Aucune notion de projet : c'est personnel.
 */

export interface ScratchpadState {
  content: string;
  updated_at: string | null;
  progress: PlanProgress;
}

export async function getScratchpad(
  client: SupabaseClient,
  userId: string
): Promise<ScratchpadState> {
  const { data, error } = await client
    .from("user_scratchpad")
    .select("content, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const content = typeof data?.content === "string" ? data.content : "";
  return {
    content,
    updated_at: (data?.updated_at as string | null) ?? null,
    progress: planProgress(content),
  };
}

export async function setScratchpad(
  client: SupabaseClient,
  userId: string,
  content: string
): Promise<ScratchpadState> {
  const clipped =
    content.length > MAX_SCRATCHPAD_LENGTH
      ? content.slice(0, MAX_SCRATCHPAD_LENGTH)
      : content;
  // Upsert sur la clé user_id : insert la première fois, update ensuite (le
  // trigger set_updated_at rafraîchit updated_at sur l'update).
  const { data, error } = await client
    .from("user_scratchpad")
    .upsert({ user_id: userId, content: clipped }, { onConflict: "user_id" })
    .select("content, updated_at")
    .maybeSingle();
  if (error) throw new Error(error.message);
  const saved = typeof data?.content === "string" ? data.content : clipped;
  return {
    content: saved,
    updated_at: (data?.updated_at as string | null) ?? null,
    progress: planProgress(saved),
  };
}
