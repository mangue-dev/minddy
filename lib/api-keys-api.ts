"use client";

import type { ApiKey } from "./types";

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const message =
      (data as { error?: string } | null)?.error || text.trim() || "Request failed";
    throw new Error(message);
  }
  return data as T;
}

export async function fetchApiKeysApi(): Promise<{ apiKeys: ApiKey[] }> {
  return parseJson(await fetch("/api/account/api-keys"));
}

/** Returns the plaintext key — shown once, never retrievable again. */
export async function createApiKeyApi(
  name: string
): Promise<{ apiKey: ApiKey; key: string }> {
  return parseJson(
    await fetch("/api/account/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    })
  );
}

export async function revokeApiKeyApi(keyId: string): Promise<void> {
  await parseJson(
    await fetch(`/api/account/api-keys/${encodeURIComponent(keyId)}`, {
      method: "DELETE",
    })
  );
}
