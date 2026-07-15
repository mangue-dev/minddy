import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getAppConfigValue } from "@/lib/server/app-config";
import { AGENT_MODEL_CONFIG_KEY, AGENT_ROOT_MODEL_FALLBACK } from "@/lib/agent-models";
import {
  DEFAULT_AGENT_PROVIDER,
  getProviderDefaultModel,
  resolveProviderBaseUrl,
  type AgentProviderId,
} from "@/lib/agent-providers";
import { decryptUserAiKey } from "./byok-credentials";

/**
 * Résolution du modèle et de l'endpoint de l'agent de code (MIN-46).
 *
 * MODÈLE — cascade à 3 niveaux, précédence run > user > racine :
 *   1. override du run (choisi au lancement, ou forcé par numo),
 *   2. défaut perso de l'user (user_agent_preferences.default_model),
 *   3. défaut frontier du provider BYOK (openai/anthropic/google),
 *   4. défaut racine OpenRouter (app_config.agent_model / fallback code) —
 *      utilisé par le quota minddy ET par OpenRouter BYOK (même endpoint).
 * Seul le provider « generic » n'a aucun défaut fiable (namespace inconnu) :
 * sans (1) ni (2), on lève `AgentModelRequiredError` — l'utilisateur doit
 * choisir un modèle (le picker liste ceux de son provider).
 *
 * ENDPOINT — un seul BYOK actif par compte : provider + base URL + clé de l'user
 * si présent (usage illimité, à ses frais), sinon la clé plateforme OpenRouter
 * OPENROUTER_API_KEY (plafonnée mensuellement, cf. quota.ts).
 */

/** Défaut racine (admin) : app_config.agent_model ou le fallback code. */
export async function getRootDefaultModel(): Promise<string> {
  return (await getAppConfigValue(AGENT_MODEL_CONFIG_KEY)) ?? AGENT_ROOT_MODEL_FALLBACK;
}

/** Défaut perso de l'utilisateur, ou null s'il n'en a pas défini. */
export async function getUserDefaultModel(userId: string): Promise<string | null> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("user_agent_preferences")
    .select("default_model")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as { default_model: string | null } | null)?.default_model ?? null;
}

/** Levée quand un provider BYOK non-OpenRouter n'a aucun modèle résolu. */
export class AgentModelRequiredError extends Error {
  code = "noModelForProvider" as const;
  constructor(public provider: string) {
    super(`No default model for provider ${provider}; a model must be selected`);
    this.name = "AgentModelRequiredError";
  }
}

/**
 * Résout le modèle à figer sur un run. `perRunModel` (override/forçage) gagne,
 * sinon le défaut perso, sinon le défaut frontier du provider BYOK, sinon —
 * quota minddy ou OpenRouter BYOK — le défaut racine. Lève
 * `AgentModelRequiredError` seulement pour un BYOK générique sans modèle.
 */
export async function resolveAgentModel(opts: {
  perRunModel?: string | null;
  userId: string;
}): Promise<string> {
  const perRun = opts.perRunModel?.trim();
  if (perRun) return perRun;
  const userDefault = await getUserDefaultModel(opts.userId);
  if (userDefault) return userDefault;
  const byok = await getUserByok(opts.userId);
  // Défaut frontier du provider (openai/anthropic/google).
  const providerDefault = byok ? getProviderDefaultModel(byok.provider) : undefined;
  if (providerDefault) return providerDefault;
  // Générique BYOK : aucun défaut fiable → l'utilisateur doit choisir.
  if (byok && byok.provider !== "openrouter") {
    throw new AgentModelRequiredError(byok.provider);
  }
  // Quota minddy (plateforme) ou OpenRouter BYOK : défaut racine app_config.
  return getRootDefaultModel();
}

// ── Endpoint (provider + base URL + clé) ─────────────────────────────────────

export interface UserByok {
  provider: AgentProviderId;
  apiKey: string;
  /** Base URL effective (registre, ou custom pour 'generic'). */
  baseUrl: string;
}

/**
 * BYOK actif de l'utilisateur (un seul), déchiffré et résolu en endpoint, ou
 * null. Ignore une ligne dont la base URL n'est pas résoluble (generic sans URL)
 * ou dont la clé ne déchiffre plus (secret tourné → « reconfigure ta clé »).
 */
export async function getUserByok(userId: string): Promise<UserByok | null> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("user_ai_keys")
    .select("provider, key_encrypted, base_url")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = data as { provider: string; key_encrypted: string; base_url: string | null } | null;
  if (!row) return null;
  const apiKey = decryptUserAiKey(row.key_encrypted);
  if (!apiKey) return null;
  const baseUrl = resolveProviderBaseUrl(row.provider, row.base_url);
  if (!baseUrl) return null;
  return { provider: row.provider as AgentProviderId, apiKey, baseUrl };
}

/** True si l'utilisateur a un BYOK utilisable (→ usage illimité). */
export async function userHasByokKey(userId: string): Promise<boolean> {
  return (await getUserByok(userId)) != null;
}

// ── Fenêtre de contexte par modèle (pour dimensionner la compaction) ─────────
const contextWindowCache = new Map<string, number>();
let orModelsLoaded = false;

/**
 * Fenêtre de contexte (tokens) d'un modèle, pour dimensionner le seuil de
 * compaction (~75 %). Uniquement en provider OpenRouter (index /models qui porte
 * `context_length`) ; null sinon → l'appelant retombe sur le seuil par défaut.
 * Best-effort, caché au niveau process.
 */
export async function getModelContextWindow(
  model: string,
  provider: AgentProviderId,
  apiKey: string,
): Promise<number | null> {
  if (provider !== "openrouter") return null;
  if (!orModelsLoaded) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (res.ok) {
        const body = (await res.json()) as { data?: Array<{ id: string; context_length?: number }> };
        for (const m of body.data ?? []) {
          if (m.context_length && m.context_length > 0) contextWindowCache.set(m.id, m.context_length);
        }
        orModelsLoaded = true;
      }
    } catch {
      // best-effort — l'appelant retombe sur le seuil par défaut
    }
  }
  return contextWindowCache.get(model) ?? null;
}

export type AgentKeyMode = "platform" | "byok";

export interface ResolvedAgentEndpoint {
  apiKey: string;
  mode: AgentKeyMode;
  provider: AgentProviderId;
  /** Base URL OpenAI-compatible (sans /chat/completions). */
  baseUrl: string;
}

/**
 * Résout l'endpoint effectif : BYOK de l'user si présent (provider + base URL +
 * clé), sinon la clé plateforme OpenRouter. Lève si aucune clé plateforme.
 */
export async function resolveAgentApiKey(userId: string): Promise<ResolvedAgentEndpoint> {
  const byok = await getUserByok(userId);
  if (byok) {
    return { apiKey: byok.apiKey, mode: "byok", provider: byok.provider, baseUrl: byok.baseUrl };
  }
  const platform = process.env.OPENROUTER_API_KEY;
  if (!platform) throw new Error("OPENROUTER_API_KEY not configured");
  const baseUrl = resolveProviderBaseUrl(DEFAULT_AGENT_PROVIDER);
  return { apiKey: platform, mode: "platform", provider: DEFAULT_AGENT_PROVIDER, baseUrl: baseUrl! };
}
