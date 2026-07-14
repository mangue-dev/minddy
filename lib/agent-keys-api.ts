"use client";

/**
 * Fetchers client de l'agent de code (MIN-46) : clés BYOK OpenRouter du compte
 * et modèle par défaut de l'utilisateur. La clé en clair n'est jamais renvoyée.
 */

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

export interface AiKey {
  id: string;
  provider: string;
  key_prefix: string | null;
  created_at: string;
  last_used_at: string | null;
}

export async function fetchAiKeysApi(): Promise<{ keys: AiKey[] }> {
  return parseJson(await fetch("/api/account/ai-keys"));
}

export async function addAiKeyApi(
  key: string,
  provider = "openrouter",
): Promise<{ key: AiKey }> {
  return parseJson(
    await fetch("/api/account/ai-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, provider }),
    }),
  );
}

export async function deleteAiKeyApi(provider = "openrouter"): Promise<void> {
  await parseJson(
    await fetch(`/api/account/ai-keys?provider=${encodeURIComponent(provider)}`, {
      method: "DELETE",
    }),
  );
}

export async function fetchAgentPreferencesApi(): Promise<{ default_model: string | null }> {
  return parseJson(await fetch("/api/account/agent-preferences"));
}

export async function saveAgentPreferencesApi(
  defaultModel: string | null,
): Promise<{ default_model: string | null }> {
  return parseJson(
    await fetch("/api/account/agent-preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ default_model: defaultModel }),
    }),
  );
}
