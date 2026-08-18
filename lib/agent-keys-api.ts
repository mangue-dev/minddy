"use client";

import type { ReasoningLevel } from "./agent-reasoning";
import type { AiSurface, ByokFeatureModels } from "./ai-surfaces";
import { trackEvent } from "./analytics";

/**
 * Code Agent Client Fetchers (MIN-46): BYOK OpenRouter keys of the account,
 * default model and default reasoning level (MIN-122) of
 * the user. The plaintext key is never returned.
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
  base_url: string | null;
  created_at: string;
  last_used_at: string | null;
  /**
 * Time when the provider recognized the key (MIN-344). `null` = never
 * confirmed: the key is saved, but it does not raise any cap — the
 * account remains on the minddy quota as long as she does not respond.
 */
  validated_at: string | null;
  enabled_surfaces: AiSurface[];
  feature_models: ByokFeatureModels;
  /** Effective admin/provider defaults, secrets excluded. */
  resolved_feature_models?: ByokFeatureModels;
}

export async function fetchAiKeysApi(): Promise<{ keys: AiKey[] }> {
  return parseJson(await fetch("/api/account/ai-keys"));
}

/** Registers the active BYOK (replaces the existing one). Local providers may not have a key. */
export async function addAiKeyApi(input: {
  provider: string;
  key?: string;
  baseUrl?: string;
}): Promise<{ key: AiKey }> {
  // Never the key, obviously — only the chosen supplier.
  trackEvent("ai_key_added", { provider: input.provider });
  return parseJson(
    await fetch("/api/account/ai-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: input.provider, key: input.key ?? "", base_url: input.baseUrl }),
    }),
  );
}

/** Removes active BYOK (single-active: no provider to specify). */
export async function deleteAiKeyApi(): Promise<void> {
  trackEvent("ai_key_removed", {});
  await parseJson(await fetch("/api/account/ai-keys", { method: "DELETE" }));
}

/** Updates the surfaces and/or models of the active key, never its secret. */
export async function updateAiKeyPreferencesApi(patch: {
  enabled_surfaces?: AiSurface[];
  feature_models?: ByokFeatureModels;
}): Promise<{ key: AiKey }> {
  return parseJson(
    await fetch("/api/account/ai-keys", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),
  );
}

export interface AgentPreferences {
  default_model: string | null;
  /** null = `off` (MIN-122). */
  default_reasoning_level: ReasoningLevel | null;
}

export async function fetchAgentPreferencesApi(): Promise<AgentPreferences> {
  return parseJson(await fetch("/api/account/agent-preferences"));
}

/**
 * PARTIAL write: only passed fields are sent (the PUT only writes
 * what it receives) — the two settings share a line, one must not
 * clear the other.
 */
export async function saveAgentPreferencesApi(
  patch: Partial<AgentPreferences>,
): Promise<AgentPreferences> {
  return parseJson(
    await fetch("/api/account/agent-preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),
  );
}
