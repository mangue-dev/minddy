"use client";

import type { AiSurface, ByokFeatureModels } from "./ai-surfaces";
import type { ModelCatalogCapability } from "./model-catalog-capability";
import type { AgentProviderId } from "./agent-providers";
import { trackEvent } from "./analytics";

/**
 * AI key client fetchers (MIN-46): the account's BYOK keys and their routing.
 * The plaintext key is never returned.
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
