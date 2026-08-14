"use client";

import type { ReasoningLevel } from "./agent-reasoning";
import { trackEvent } from "./analytics";

/**
 * Fetchers client de l'agent de code (MIN-46) : clés BYOK OpenRouter du compte,
 * modèle par défaut et niveau de raisonnement par défaut (MIN-122) de
 * l'utilisateur. La clé en clair n'est jamais renvoyée.
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
   * Instant où le fournisseur a reconnu la clé (MIN-344). `null` = jamais
   * confirmée : la clé est enregistrée, mais elle ne lève aucun plafond — le
   * compte reste sur le quota minddy tant qu'elle ne répond pas.
   */
  validated_at: string | null;
}

export async function fetchAiKeysApi(): Promise<{ keys: AiKey[] }> {
  return parseJson(await fetch("/api/account/ai-keys"));
}

/** Enregistre le BYOK actif (remplace l'existant). `baseUrl` requis pour 'generic'. */
export async function addAiKeyApi(input: {
  provider: string;
  key: string;
  baseUrl?: string;
}): Promise<{ key: AiKey }> {
  // Jamais la clé, évidemment — seulement le fournisseur choisi.
  trackEvent("ai_key_added", { provider: input.provider });
  return parseJson(
    await fetch("/api/account/ai-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: input.provider, key: input.key, base_url: input.baseUrl }),
    }),
  );
}

/** Retire le BYOK actif (single-active : pas de provider à préciser). */
export async function deleteAiKeyApi(): Promise<void> {
  trackEvent("ai_key_removed", {});
  await parseJson(await fetch("/api/account/ai-keys", { method: "DELETE" }));
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
 * Écriture PARTIELLE : seuls les champs passés sont envoyés (le PUT n'écrit que
 * ce qu'il reçoit) — les deux réglages partagent une ligne, l'un ne doit pas
 * effacer l'autre.
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
