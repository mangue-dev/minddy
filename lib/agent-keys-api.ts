"use client";

import type { SandboxPreferences } from "./agent-sandbox-config";
import type { ReasoningLevel } from "./agent-reasoning";
import type { AiSurface, ByokFeatureModels } from "./ai-surfaces";
import type { ModelCatalogCapability } from "./model-catalog-capability";
import type { AgentProviderId } from "./agent-providers";
import { trackEvent } from "./analytics";

/**
 * Code Agent Client Fetchers (MIN-46): BYOK OpenRouter keys of the account,
 * default model, default reasoning level (MIN-122), and branch prefix of the
 * user. The plaintext key is never returned.
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
      (data as { error?: string } | null)?.error ||
      text.trim() ||
      "Request failed";
    throw new Error(message);
  }
  return data as T;
}

export interface AiKey {
  id: string;
  provider: AgentProviderId;
  key_prefix: string | null;
  base_url: string | null;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
  /**
   * Time when the provider recognized the key (MIN-344). `null` = never
   * confirmed: the key is saved, but it does not raise any cap — the
   * account remains on the minddy quota as long as she does not respond.
   */
  validated_at: string | null;
  enabled_surfaces: AiSurface[];
  feature_models: ByokFeatureModels;
  /** Model families automatically covered by the active provider. */
  supported_capabilities: readonly ModelCatalogCapability[];
  /** Model families currently routed through this credential. */
  assigned_capabilities: readonly ModelCatalogCapability[];
  /** Effective admin/provider defaults, secrets excluded. */
  resolved_feature_models?: ByokFeatureModels;
}

export async function fetchAiKeysApi(): Promise<{ keys: AiKey[] }> {
  return parseJson(await fetch("/api/account/ai-keys"));
}

/** Adds or updates one provider credential. Local providers may not have a key. */
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
      body: JSON.stringify({
        provider: input.provider,
        key: input.key ?? "",
        base_url: input.baseUrl,
      }),
    }),
  );
}

/** Removes one provider credential. Its assignments fall back to managed Minddy. */
export async function deleteAiKeyApi(keyId: string): Promise<void> {
  trackEvent("ai_key_removed", {});
  await parseJson(
    await fetch(`/api/account/ai-keys?id=${encodeURIComponent(keyId)}`, {
      method: "DELETE",
    }),
  );
}

/** Updates the surfaces and/or models of the active key, never its secret. */
export async function updateAiKeyPreferencesApi(patch: {
  key_id: string;
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

/** Routes one model family through a configured key, or null for managed Minddy. */
export async function assignAiCapabilityApi(
  capability: ModelCatalogCapability,
  keyId: string | null,
): Promise<void> {
  await parseJson(
    await fetch("/api/account/ai-keys", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ capability, assigned_key_id: keyId }),
    }),
  );
}

export interface AgentPreferences extends SandboxPreferences {
  default_model: string | null;
  /** null = `off` (MIN-122). */
  default_reasoning_level: ReasoningLevel | null;
  branch_prefix: string;
}

export type AgentPreferencesPatch = Partial<
  Omit<AgentPreferences, "branch_prefix"> & { branch_prefix: string | null }
>;

export async function fetchAgentPreferencesApi(): Promise<AgentPreferences> {
  return parseJson(await fetch("/api/account/agent-preferences"));
}

/**
 * PARTIAL write: only passed fields are sent (the PUT only writes
 * what it receives) — the settings share a row, so one must not clear the
 * others.
 */
export async function saveAgentPreferencesApi(
  patch: AgentPreferencesPatch,
): Promise<AgentPreferences> {
  return parseJson(
    await fetch("/api/account/agent-preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),
  );
}
