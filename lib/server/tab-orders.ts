import "server-only";

import { getServiceClient } from "@/lib/supabase-service";

/**
 * Per-user, per-scope tab-strip order (MIN-34). Persisted in Supabase Auth
 * `user_metadata` under `tab_orders` — a map `{ <scope>: string[] }` where scope
 * is "global" or a project id, and each entry is the ordered list of tab keys
 * (a view id, or the "cycle" sentinel). This is where minddy keeps per-user
 * state (mirrors lib/server/account-settings.ts); no dedicated table.
 *
 * Writes read-modify-write the WHOLE metadata object so the rest of the user's
 * prefs are preserved — the same pattern account-settings uses.
 */

const TAB_ORDERS_META_KEY = "tab_orders";

/** Extract the scope→keys map, tolerating a missing/corrupt shape. */
function readOrders(meta: Record<string, unknown>): Record<string, string[]> {
  const raw = meta[TAB_ORDERS_META_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string[]> = {};
  for (const [scope, value] of Object.entries(raw as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      out[scope] = value.filter((k): k is string => typeof k === "string");
    }
  }
  return out;
}

export async function getTabOrder(
  userId: string,
  scope: string
): Promise<string[] | null> {
  const service = getServiceClient();
  const { data, error } = await service.auth.admin.getUserById(userId);
  if (error || !data.user) return null;
  const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
  return readOrders(meta)[scope] ?? null;
}

export async function setTabOrder(
  userId: string,
  scope: string,
  keys: string[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const service = getServiceClient();
  const { data: current, error: readErr } =
    await service.auth.admin.getUserById(userId);
  if (readErr || !current.user) {
    return { ok: false, error: readErr?.message ?? "Account not found." };
  }
  const meta = (current.user.user_metadata ?? {}) as Record<string, unknown>;
  const orders = readOrders(meta);
  orders[scope] = keys.filter((k) => typeof k === "string");
  const next = { ...meta, [TAB_ORDERS_META_KEY]: orders };

  const { error: writeErr } = await service.auth.admin.updateUserById(userId, {
    user_metadata: next,
  });
  if (writeErr) {
    console.error("[tab-orders] update failed:", writeErr.message);
    return { ok: false, error: writeErr.message };
  }
  return { ok: true };
}
