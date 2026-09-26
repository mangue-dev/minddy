import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isAppTabId, normalizeAppTabPatch, type AppTab } from "@/lib/app-tabs";
import { decodeAppTab, encodeAppTabValue, shouldProtectAppTabs } from "./app-tabs-content";

export type AppTabResult = { tab?: AppTab; code?: "invalid" | "not_found" | "conflict" | "last_tab" | "database" };

export async function moveAppTab(supabase: SupabaseClient, input: {
  id: unknown; revision: unknown; beforeId: unknown;
}, userId?: string): Promise<AppTabResult & { tabs?: AppTab[] }> {
  if (!isAppTabId(input.id) || (input.beforeId !== null && !isAppTabId(input.beforeId)) ||
      !Number.isSafeInteger(input.revision) || (input.revision as number) < 1) return { code: "invalid" };
  const { data, error } = await supabase.rpc("move_app_tab", {
    p_id: input.id, p_revision: input.revision, p_before_id: input.beforeId,
  });
  if (error) return { code: "database" };
  if (userId && data?.tab) data.tab = await decodeAppTab(userId, data.tab);
  if (userId && data?.tabs) data.tabs = await Promise.all(data.tabs.map((tab: AppTab) => decodeAppTab(userId, tab)));
  return data;
}

export async function mutateAppTab(
  supabase: SupabaseClient,
  operation: "ensure" | "create" | "update" | "close",
  input: { id?: unknown; revision?: unknown; patch?: unknown } = {},
  userId?: string,
): Promise<AppTabResult> {
  if ((operation !== "ensure" || input.id !== undefined) && !isAppTabId(input.id)) return { code: "invalid" };
  if ((operation === "update" || operation === "close") &&
      (!Number.isSafeInteger(input.revision) || (input.revision as number) < 1)) return { code: "invalid" };
  const patch = operation === "update" ? normalizeAppTabPatch(input.patch) : {};
  if (!patch) return { code: "invalid" };
  const protect = userId ? await shouldProtectAppTabs() : false;
  const id = protect && (operation === "ensure" || operation === "create")
    ? (input.id as string | undefined) ?? crypto.randomUUID() : input.id ?? null;
  if (protect && userId && id) {
    if (operation === "ensure" || operation === "create") {
      patch.href = await encodeAppTabValue(userId, id, "href", "/home");
    } else if (operation === "update") {
      if (patch.href) patch.href = await encodeAppTabValue(userId, id as string, "href", patch.href);
      if (patch.custom_name) patch.custom_name = await encodeAppTabValue(userId, id as string, "custom_name", patch.custom_name);
    }
  }
  const { data, error } = await supabase.rpc("mutate_app_tab", {
    p_operation: operation, p_id: id, p_revision: input.revision ?? null, p_patch: patch,
  });
  if (error) {
    console.error("[app-tabs] mutation failed:", error.code);
    return { code: "database" };
  }
  const result = data as AppTabResult;
  if (userId && result?.tab) result.tab = await decodeAppTab(userId, result.tab);
  return result;
}

/** Keyset pagination avoids the default database row limit. */
export async function listAppTabs(supabase: SupabaseClient, userId?: string): Promise<AppTab[]> {
  const rows: AppTab[] = [];
  let cursor: string | null = null;
  for (;;) {
    let query = supabase.from("app_tabs").select("*").order("id").limit(500);
    if (cursor) query = query.gt("id", cursor);
    const { data, error } = await query;
    if (error) throw new Error("Application tabs could not be loaded");
    rows.push(...(userId ? await Promise.all((data as AppTab[]).map((tab) => decodeAppTab(userId, tab))) : data as AppTab[]));
    if (data.length < 500) return rows;
    cursor = data[data.length - 1].id;
  }
}

export const appTabResultStatus = (result: AppTabResult): number =>
  result.code === "invalid" ? 400 : result.code === "not_found" ? 404 :
  result.code === "conflict" || result.code === "last_tab" ? 409 : result.code ? 500 : 200;
