import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getRootDefaultModel, resolveAgentApiKey } from "@/lib/server/agent/model";
import {
  getAgentProvider,
  getProviderDefaultModel,
  normalizeBaseUrl,
  resolveProviderBaseUrl,
  DEFAULT_AGENT_PROVIDER,
  type AgentProviderId,
} from "@/lib/agent-providers";

/**
 * Index des modèles pour le picker de l'agent (MIN-46), résolu selon le provider
 * ACTIF du compte (BYOK unique, ou clé plateforme OpenRouter). On ne renvoie que
 * `{ id, name }` (le client reformate via `formatModelName`) + le slug provider
 * (pour les logos). Cache process par `provider|baseUrl` (la liste est la même
 * pour tous les comptes d'un même endpoint) ; sur échec on sert le cache périmé,
 * sinon une liste vide (le combobox autorise la saisie libre).
 */

export const runtime = "nodejs";

export interface AgentModelEntry {
  id: string;
  name: string;
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

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  // Provider actif : BYOK du compte, ou clé plateforme OpenRouter. Si aucune clé
  // plateforme n'est configurée, on liste quand même OpenRouter en public.
  let provider: AgentProviderId = DEFAULT_AGENT_PROVIDER;
  let baseUrl = resolveProviderBaseUrl(DEFAULT_AGENT_PROVIDER)!;
  let apiKey = "";
  try {
    const endpoint = await resolveAgentApiKey(auth.user.id);
    provider = endpoint.provider;
    baseUrl = normalizeBaseUrl(endpoint.baseUrl);
    apiKey = endpoint.apiKey;
  } catch {
    // Pas de clé plateforme : liste OpenRouter publique (baseUrl déjà par défaut).
  }

  // Défaut effectif du provider actif : frontier du provider BYOK, sinon défaut
  // racine (quota minddy / OpenRouter BYOK) ; null pour un générique.
  const providerDefault = getProviderDefaultModel(provider);
  const defaultModel =
    providerDefault ?? (provider === "generic" ? null : await getRootDefaultModel());

  const cacheKey = `${provider}|${baseUrl}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json({ provider, defaultModel, models: hit.models });
  }
  try {
    const models = await loadModels(provider, baseUrl, apiKey);
    cache.set(cacheKey, { at: Date.now(), models });
    return NextResponse.json({ provider, defaultModel, models });
  } catch {
    return NextResponse.json({ provider, defaultModel, models: hit?.models ?? [] });
  }
}
