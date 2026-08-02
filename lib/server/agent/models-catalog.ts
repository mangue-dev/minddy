import "server-only";

import { getRootDefaultModel, resolveAgentApiKey, resolveProviderDefaultModel } from "./model";
import { getModelPlanLimit, type ModelPlanLimit } from "./model-plan";
import { listOpenRouterIndex } from "./openrouter-index";
import { modelCostMultiplier, type ModelPricing } from "@/lib/model-multiplier";
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
 * On ne renvoie que `{ id, name, multiplier? }` par modèle (+ le slug provider,
 * le défaut effectif et le plafond du plan) : le picker reformate via
 * `formatModelName`, et Numo n'a besoin que de l'id exact pour forcer un modèle
 * au lancement. Cache process par `provider|baseUrl` (la liste est identique
 * pour tous les comptes d'un même endpoint) ; sur échec on sert le cache périmé,
 * sinon une liste vide (la saisie libre reste autorisée en aval).
 *
 * Le multiplicateur, lui, n'est JAMAIS caché avec la liste : il se recalcule à
 * chaque appel depuis le baseline du moment (`app_config.agent_model`, qu'un
 * admin change quand il veut). Figé dans le cache, il aurait continué une heure
 * durant à situer les modèles sur une échelle qui n'existe plus.
 */

export interface AgentModelEntry {
  id: string;
  name: string;
  /**
   * Coût d'usage relatif au modèle par défaut de minddy (cf.
   * lib/model-multiplier.ts). Absent quand il ne veut rien dire : provider BYOK
   * (prix inconnus de nous, et de toute façon payés par l'utilisateur), modèle
   * hors catalogue OpenRouter, ou baseline gratuit.
   */
  multiplier?: number;
}

export interface AgentModelsCatalog {
  provider: AgentProviderId;
  /** Modèle par défaut du provider actif (frontier BYOK ou défaut racine), ou null (générique). */
  defaultModel: string | null;
  models: AgentModelEntry[];
  /**
   * Plafond de multiplicateur du plan, ou `null` quand aucun ne s'applique :
   * BYOK (l'utilisateur paye ses tokens) et catalogue admin. `null` = le picker
   * n'affiche ni multiplicateur ni grisé.
   */
  maxMultiplier?: number | null;
  /** Plan du compte — pour nommer le plafond dans l'UI (« votre plan Go »). */
  planId?: string;
}

const TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, { at: number; models: AgentModelEntry[] }>();

/** Écarte les modèles non conversationnels (embeddings, audio, image…). */
const NON_CHAT_RE = /(embedding|whisper|tts|dall-e|moderation|audio|image|imagen|veo|realtime|transcribe|rerank)/i;

function sortById(models: AgentModelEntry[]): AgentModelEntry[] {
  return models.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * OpenRouter : le catalogue vient de l'index partagé (`openrouter-index.ts`),
 * filtré au tool-calling. Une seule lecture de `/models` sert ici, les capacités
 * de la boucle et les prix du plafond de plan.
 */
async function listOpenRouter(apiKey?: string): Promise<AgentModelEntry[]> {
  const index = await listOpenRouterIndex(apiKey);
  if (index.length === 0) throw new Error("empty index");
  return sortById(index.filter((m) => m.tools).map((m) => ({ id: m.id, name: m.name })));
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
      return listOpenRouter(apiKey);
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
 * Situe chaque modèle sur l'échelle du baseline et joint le plafond du plan.
 * `limit` absent (BYOK, admin) → la liste ressort telle quelle : ni
 * multiplicateur affiché, ni modèle grisé.
 */
async function withMultipliers(
  models: AgentModelEntry[],
  limit: ModelPlanLimit | null,
): Promise<Pick<AgentModelsCatalog, "models" | "maxMultiplier" | "planId">> {
  if (!limit?.baseline) return { models, maxMultiplier: null };
  const index = await listOpenRouterIndex();
  const pricing = new Map<string, ModelPricing | null>(index.map((m) => [m.id, m.pricing]));
  return {
    models: models.map((m) => {
      const multiplier = modelCostMultiplier(pricing.get(m.id), limit.baseline);
      return multiplier == null ? m : { ...m, multiplier };
    }),
    maxMultiplier: limit.maxMultiplier,
    planId: limit.planId,
  };
}

/**
 * Catalogue de modèles du provider ACTIF de l'utilisateur (BYOK ou clé
 * plateforme OpenRouter). Si aucune clé plateforme n'est configurée, on liste
 * quand même OpenRouter en public. Ne lève jamais : sur échec upstream, renvoie
 * le cache périmé s'il existe, sinon une liste vide.
 *
 * Les multiplicateurs et le plafond ne sont joints QU'en mode plateforme : en
 * BYOK, l'utilisateur paye ses propres tokens — lui afficher une échelle de coût
 * minddy et griser la moitié du catalogue serait faux deux fois.
 */
export async function getAgentModelsForUser(userId: string): Promise<AgentModelsCatalog> {
  // Provider actif : BYOK du compte, ou clé plateforme OpenRouter.
  let provider: AgentProviderId = DEFAULT_AGENT_PROVIDER;
  let baseUrl = resolveProviderBaseUrl(DEFAULT_AGENT_PROVIDER)!;
  let apiKey = "";
  let mode: "platform" | "byok" = "platform";
  try {
    const endpoint = await resolveAgentApiKey(userId);
    provider = endpoint.provider;
    baseUrl = normalizeBaseUrl(endpoint.baseUrl);
    apiKey = endpoint.apiKey;
    mode = endpoint.mode;
  } catch {
    // Pas de clé plateforme : liste OpenRouter publique (baseUrl déjà par défaut).
  }

  // Défaut effectif du provider actif : frontier du provider BYOK, sinon défaut
  // racine (quota minddy / OpenRouter BYOK) ; null pour un générique.
  const providerDefault = await resolveProviderDefaultModel(provider);
  const defaultModel =
    providerDefault ?? (provider === "generic" ? null : await getRootDefaultModel());

  const limit = mode === "platform" ? await getModelPlanLimit(userId) : null;

  const cacheKey = `${provider}|${baseUrl}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return { provider, defaultModel, ...(await withMultipliers(hit.models, limit)) };
  }
  try {
    const models = await loadModels(provider, baseUrl, apiKey);
    cache.set(cacheKey, { at: Date.now(), models });
    return { provider, defaultModel, ...(await withMultipliers(models, limit)) };
  } catch {
    return { provider, defaultModel, ...(await withMultipliers(hit?.models ?? [], limit)) };
  }
}

/**
 * Catalogue de la review de PR : celui de la clé PLATEFORME, plus le plafond du
 * compte. La review tourne toujours sur cette clé, donc toujours sur le quota
 * minddy — le plafond s'y applique même à un compte en BYOK, qui verra donc des
 * multiplicateurs ici alors que son picker d'agent n'en montre aucun. Ce n'est
 * pas une incohérence : ce sont deux dépenses différentes, l'une la sienne,
 * l'autre celle de minddy.
 */
export async function getPrReviewModelCatalog(userId: string): Promise<AgentModelsCatalog> {
  const [models, limit] = await Promise.all([
    getPlatformModelCatalog(),
    getModelPlanLimit(userId),
  ]);
  return {
    provider: DEFAULT_AGENT_PROVIDER,
    defaultModel: null,
    ...(await withMultipliers(models, limit)),
  };
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
    const models = await listOpenRouter(apiKey);
    cache.set(cacheKey, { at: Date.now(), models });
    return models;
  } catch {
    return hit?.models ?? [];
  }
}
