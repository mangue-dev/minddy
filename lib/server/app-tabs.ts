import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isAppTabId, normalizeAppTabPatch, type AppTab } from "@/lib/app-tabs";

export type AppTabResult = { tab?: AppTab; code?: "invalid" | "not_found" | "conflict" | "last_tab" | "database" };

export async function mutateAppTab(
  supabase: SupabaseClient,
  operation: "ensure" | "create" | "update" | "close",
  input: { id?: unknown; revision?: unknown; patch?: unknown } = {},
): Promise<AppTabResult> {
  if ((operation !== "ensure" || input.id !== undefined) && !isAppTabId(input.id)) return { code: "invalid" };
  if ((operation === "update" || operation === "close") &&
      (!Number.isSafeInteger(input.revision) || (input.revision as number) < 1)) return { code: "invalid" };
  const patch = operation === "update" ? normalizeAppTabPatch(input.patch) : {};
  if (!patch) return { code: "invalid" };
  const { data, error } = await supabase.rpc("mutate_app_tab", {
    p_operation: operation, p_id: input.id ?? null, p_revision: input.revision ?? null, p_patch: patch,
  });
  if (error) {
    console.error("[app-tabs] mutation failed:", error.code);
    return { code: "database" };
  }
  return data as AppTabResult;
}

/** Keyset pagination avoids the default database row limit. */
export async function listAppTabs(supabase: SupabaseClient): Promise<AppTab[]> {
  const rows: AppTab[] = [];
  let cursor: string | null = null;
  for (;;) {
    let query = supabase.from("app_tabs").select("*").order("id").limit(500);
    if (cursor) query = query.gt("id", cursor);
    const { data, error } = await query;
    if (error) throw new Error("Application tabs could not be loaded");
    rows.push(...(data as AppTab[]));
    if (data.length < 500) return rows;
    cursor = data[data.length - 1].id;
  }
}

export const appTabResultStatus = (result: AppTabResult): number =>
  result.code === "invalid" ? 400 : result.code === "not_found" ? 404 :
  result.code === "conflict" || result.code === "last_tab" ? 409 : result.code ? 500 : 200;
