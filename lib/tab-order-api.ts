"use client";

/** Client access to the per-user tab-strip order (MIN-34). scope = "global" or
    a project id. Reads are best-effort: a failure falls back to the default
    order rather than surfacing an error. */

export async function fetchTabOrderApi(scope: string): Promise<string[] | null> {
  const res = await fetch(`/api/me/tab-order?scope=${encodeURIComponent(scope)}`);
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as { keys?: unknown } | null;
  const keys = data?.keys;
  return Array.isArray(keys)
    ? keys.filter((k): k is string => typeof k === "string")
    : null;
}

export async function saveTabOrderApi(
  scope: string,
  keys: string[]
): Promise<void> {
  const res = await fetch(`/api/me/tab-order`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scope, keys }),
  });
  // Message technique : la route ne renvoie que des erreurs de validation
  // (inatteignables depuis l'UI) ou un message de base. Ce que l'utilisateur
  // voit est traduit par l'appelant (ApiErrors.tabOrderSaveFailed).
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error || `tab-order save failed (${res.status})`);
  }
}
