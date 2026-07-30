import "server-only";

import { getRootDefaultModel, resolveAgentApiKey, resolveProviderDefaultModel } from "./model";
import {
  getAgentProvider,
  normalizeBaseUrl,
  resolveProviderBaseUrl,
  DEFAULT_AGENT_PROVIDER,
  type AgentProviderId,
} from "@/lib/agent-providers";

/**
 * Catalogue de modèles de l'agent de code (MIN-46), résolu selon le provider
 * ACTIF d'un compte (son BYOK unique, ou la clé plateforme OpenRouter). Source
 * unique partagée par la route `/api/agent/models` (picker UI) ET le tool
 * `list_agent_models` de Numo (assistant) — même liste, même cache, même défaut.
 *
 * On ne renvoie que `{ id, name }` par modèle (+ le slug provider et le défaut
 * effectif) : le picker reformate via `formatModelName`, et Numo n'a besoin que
 * de l'id exact pour forcer un modèle au lancement. Cache process par
 * `provider|baseUrl` (la liste est identique pour tous les comptes d'un même
 * endpoint) ; sur échec on sert le cache périmé, sinon une liste vide (la saisie
 * libre reste autorisée en aval).
 */

export interface AgentModelEntry {
  id: string;
  name: string;
}

export interface AgentModelsCatalog {
  provider: AgentProviderId;
  /** Modèle par défaut du provider actif (frontier BYOK ou défaut racine), ou null (générique). */
  defaultModel: string | null;
  models: AgentModelEntry[];
}

const TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, { at: number; models: AgentModelEntry[] }>();

/** Écarte les modèles non conversationnels (embeddings, audio, image…). */
const NON_CHAT_RE = /(embedding|whisper|tts|dall-e|moderation|audio|image|imagen|veo|realtime|transcribe|rerank)/i;

function sortById(models: AgentModelEntry[]): AgentModelEntry[] {
  return models.sort((a, b) => a.id.localeCompare(b.id));
}

/** OpenRouter : catalogue public (Bearer optionnel), filtré au tool-calling. */
async function listOpenRouter(baseUrl: string, apiKey?: string): Promise<AgentModelEntry[]> {
  const headers: Record<string, string> = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const res = await fetch(`${baseUrl}/models`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as {
    data?: Array<{ id: string; name?: string; supported_parameters?: string[] }>;
  };
  const models = (body.data ?? [])
    .filter((m) => {
      if (!m.id) return false;
      const params = m.supported_parameters;
      return !params?.length || params.includes("tools");
    })
    .map((m) => ({ id: m.id, name: m.name ?? m.id }));
  return sortById(models);
}

/** Endpoint OpenAI-compatible `/models` (OpenAI, Google, générique). */
async function listOpenAICompat(baseUrl: string, apiKey: string): Promise<AgentModelEntry[]> {
  const res = await fetch(`${baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as { data?: Array<{ id: string }> };
  const models = (body.data ?? [])
    .map((m) => m.id?.replace(/^models\//, "")) // Gemini préfixe `models/…`
    .filter((id): id is string => !!id && !NON_CHAT_RE.test(id))
    .map((id) => ({ id, name: id }));
  return sortById(models);
}

/** Anthropic : `/v1/models` natif (x-api-key + anthropic-version). */
async function listAnthropic(baseUrl: string, apiKey: string): Promise<AgentModelEntry[]> {
  const res = await fetch(`${baseUrl}/models?limit=1000`, {
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as { data?: Array<{ id: string; display_name?: string }> };
  const models = (body.data ?? [])
    .filter((m) => !!m.id)
    .map((m) => ({ id: m.id, name: m.display_name ?? m.id }));
  return sortById(models);
}

async function loadModels(
  provider: AgentProviderId,
  baseUrl: string,
  apiKey: string,
): Promise<AgentModelEntry[]> {
  const strategy = getAgentProvider(provider)?.listStrategy ?? "openrouter";
  switch (strategy) {
    case "openrouter":
      return listOpenRouter(baseUrl, apiKey);
    case "anthropic":
      return listAnthropic(baseUrl, apiKey);
    case "openai":
      return listOpenAICompat(baseUrl, apiKey);
    case "generic":
      // Endpoint arbitraire : peut ne pas exposer /models → l'échec est toléré.
      return listOpenAICompat(baseUrl, apiKey);
  }
}

/**
 * Catalogue de modèles du provider ACTIF de l'utilisateur (BYOK ou clé
 * plateforme OpenRouter). Si aucune clé plateforme n'est configurée, on liste
 * quand même OpenRouter en public. Ne lève jamais : sur échec upstream, renvoie
 * le cache périmé s'il existe, sinon une liste vide.
 */
export async function getAgentModelsForUser(userId: string): Promise<AgentModelsCatalog> {
  // Provider actif : BYOK du compte, ou clé plateforme OpenRouter.
  let provider: AgentProviderId = DEFAULT_AGENT_PROVIDER;
  let baseUrl = resolveProviderBaseUrl(DEFAULT_AGENT_PROVIDER)!;
  let apiKey = "";
  try {
    const endpoint = await resolveAgentApiKey(userId);
    provider = endpoint.provider;
    baseUrl = normalizeBaseUrl(endpoint.baseUrl);
    apiKey = endpoint.apiKey;
  } catch {
    // Pas de clé plateforme : liste OpenRouter publique (baseUrl déjà par défaut).
  }

  // Défaut effectif du provider actif : frontier du provider BYOK, sinon défaut
  // racine (quota minddy / OpenRouter BYOK) ; null pour un générique.
  const providerDefault = await resolveProviderDefaultModel(provider);
  const defaultModel =
    providerDefault ?? (provider === "generic" ? null : await getRootDefaultModel());

  const cacheKey = `${provider}|${baseUrl}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return { provider, defaultModel, models: hit.models };
  }
  try {
    const models = await loadModels(provider, baseUrl, apiKey);
    cache.set(cacheKey, { at: Date.now(), models });
    return { provider, defaultModel, models };
  } catch {
    return { provider, defaultModel, models: hit?.models ?? [] };
  }
}

/**
 * Catalogue de la clé PLATEFORME (OpenRouter), pour le dashboard admin.
 *
 * Différence assumée avec `getAgentModelsForUser` : on ignore le BYOK de l'admin
 * qui regarde. Les modèles d'`app_config` tournent tous sur la clé plateforme —
 * proposer le catalogue Anthropic d'un admin en BYOK ferait écrire des ids
 * inutilisables au runtime.
 *
 * Le filtre tool-calling est CONSERVÉ : presque tous les réglages admin
 * (Numo, assignation, classification, analyse) forcent un tool call et casseraient
 * sur un modèle qui n'en fait pas. Restent deux réglages non conversationnels —
 * transcription et embeddings — que le catalogue d'OpenRouter n'expose de toute
 * façon PAS (son `/models` ne liste que des modèles de chat) : ils se règlent par
 * la saisie libre du picker, et c'est le seul chemin possible.
 *
 * Même contrat de robustesse que le catalogue utilisateur : ne lève jamais.
 */
export async function getPlatformModelCatalog(): Promise<AgentModelEntry[]> {
  const baseUrl = normalizeBaseUrl(resolveProviderBaseUrl(DEFAULT_AGENT_PROVIDER)!);
  const apiKey = process.env.OPENROUTER_API_KEY;

  const cacheKey = `platform|${baseUrl}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.models;

  try {
    const models = await listOpenRouter(baseUrl, apiKey);
    cache.set(cacheKey, { at: Date.now(), models });
    return models;
  } catch {
    return hit?.models ?? [];
  }
}
