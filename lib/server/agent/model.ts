import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getAppConfigValue } from "@/lib/server/app-config";
import { AGENT_MODEL_CONFIG_KEY, AGENT_ROOT_MODEL_FALLBACK } from "@/lib/agent-models";
import { aiModelFallback, byokDefaultModelKey } from "@/lib/ai-model-config";
import {
  DEFAULT_AGENT_PROVIDER,
  getProviderDefaultModel,
  resolveProviderBaseUrl,
  type AgentProviderId,
} from "@/lib/agent-providers";
import {
  isReasoningLevel,
  DEFAULT_REASONING_LEVEL,
  type ReasoningLevel,
} from "@/lib/agent-reasoning";
import { decryptUserAiKey } from "./byok-credentials";
import { getOpenRouterModelInfo } from "./openrouter-index";

/**
 * Résolution du modèle et de l'endpoint de l'agent de code (MIN-46).
 *
 * MODÈLE — cascade à 3 niveaux, précédence run > user > racine :
 *   1. override du run (choisi au lancement, ou forcé par numo),
 *   2. défaut perso de l'user (user_agent_preferences.default_model),
 *   3. défaut frontier du provider BYOK (openai/anthropic/google) —
 *      app_config.byok_default_model_<provider> / registre des providers,
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
  return (await getAppConfigValue(AGENT_MODEL_CONFIG_KEY))?.trim() || AGENT_ROOT_MODEL_FALLBACK;
}

/**
 * Défaut frontier d'un provider BYOK — réglable depuis /admin
 * (`byok_default_model_<provider>`), sinon celui du registre des providers.
 *
 * C'est le modèle que tourne un compte qui a posé sa clé sans jamais en choisir un :
 * il change à chaque génération de modèles, donc il ne peut pas vivre uniquement
 * dans le code. `undefined` reste possible — OpenRouter (qui reprend le défaut
 * racine) et le générique (namespace inconnu) n'en ont pas.
 */
export async function resolveProviderDefaultModel(
  providerId: string | null | undefined,
): Promise<string | undefined> {
  const fallback = getProviderDefaultModel(providerId);
  if (!providerId || !fallback) return fallback;
  const configured = await getAppConfigValue(byokDefaultModelKey(providerId)).catch(() => null);
  return configured?.trim() || fallback;
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

/** Défaut de raisonnement de l'utilisateur, ou null s'il n'en a pas défini. */
export async function getUserDefaultReasoningLevel(
  userId: string,
): Promise<ReasoningLevel | null> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("user_agent_preferences")
    .select("default_reasoning_level")
    .eq("user_id", userId)
    .maybeSingle();
  const raw = (data as { default_reasoning_level: string | null } | null)?.default_reasoning_level;
  return isReasoningLevel(raw) ? raw : null;
}

/**
 * Résout le niveau de raisonnement à FIGER sur un run (MIN-122). Cascade
 * run > user > `DEFAULT_REASONING_LEVEL` (`medium`) — pas de défaut racine : aucun
 * réglage admin ici.
 *
 * Les quatre niveaux sont ouverts à TOUS, quota minddy compris : l'abonnement est
 * payé, il doit être utilisable en entier. Ce qui borne la dépense est le budget
 * lui-même (`checkAgentQuota` au lancement, et l'arrêt en cours de run quand il
 * est épuisé), pas une restriction sur le niveau.
 */
export async function resolveReasoningLevel(opts: {
  perRunLevel?: string | null;
  userId: string;
}): Promise<ReasoningLevel> {
  const perRun = isReasoningLevel(opts.perRunLevel) ? opts.perRunLevel : null;
  return perRun ?? (await getUserDefaultReasoningLevel(opts.userId)) ?? DEFAULT_REASONING_LEVEL;
}

/** Levée quand un provider BYOK non-OpenRouter n'a aucun modèle résolu. */
export class AgentModelRequiredError extends Error {
  code = "noModelForProvider" as const;
  constructor(public provider: string) {
    super(`No default model for provider ${provider}; a model must be selected`);
    this.name = "AgentModelRequiredError";
  }
}

/** Modèle figé sur un run, et de qui vient ce choix. */
export interface ResolvedAgentModel {
  model: string;
  /**
   * Vrai quand le modèle vient de QUELQU'UN — override de run (choisi au
   * lancement, ou forcé par Numo) ou défaut perso du compte. Faux quand il vient
   * d'un défaut de minddy (frontier du provider, ou défaut racine).
   *
   * C'est la distinction que le plafond de plan applique (`ensureModelInPlan`) :
   * minddy ne se refuse pas ses propres défauts.
   */
  chosenByUser: boolean;
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
}): Promise<ResolvedAgentModel> {
  const perRun = opts.perRunModel?.trim();
  if (perRun) return { model: perRun, chosenByUser: true };
  const userDefault = await getUserDefaultModel(opts.userId);
  if (userDefault) return { model: userDefault, chosenByUser: true };
  const byok = await getUserByok(opts.userId);
  // Défaut frontier du provider (openai/anthropic/google), réglable en /admin.
  const providerDefault = byok ? await resolveProviderDefaultModel(byok.provider) : undefined;
  if (providerDefault) return { model: providerDefault, chosenByUser: false };
  // Générique BYOK : aucun défaut fiable → l'utilisateur doit choisir.
  if (byok && byok.provider !== "openrouter") {
    throw new AgentModelRequiredError(byok.provider);
  }
  // Quota minddy (plateforme) ou OpenRouter BYOK : défaut racine app_config.
  return { model: await getRootDefaultModel(), chosenByUser: false };
}

// ── Modèle de RELECTURE (MIN-141, porté ici par MIN-168) ────────────────────
// Une session de review est un run comme les autres, mais son modèle ne se
// résout pas comme celui d'un run de code : `pr_review_model` est
// DÉLIBÉRÉMENT distinct d'`agent_model` — faire relire du code par le modèle qui
// vient de l'écrire donne un second avis identique, et c'est toute la raison
// d'être de la passe.

/** Clé `app_config` du modèle de review — le défaut de l'instance, réglable en /admin. */
export const PR_REVIEW_MODEL_CONFIG_KEY = "pr_review_model";

/**
 * Le modèle qui va relire, en trois temps : ce qui a été choisi POUR CETTE
 * SESSION, sinon le dernier choix du compte, sinon le défaut de l'instance.
 *
 * Le catalogue est celui de la clé plateforme OpenRouter dans les trois cas — la
 * review tourne dessus, y compris pour un compte en BYOK (un id natif `gpt-…` n'y
 * serait pas routable). Elle se paye donc TOUJOURS sur le quota minddy, ce qui la
 * soumet aussi au plafond de modèle du plan — d'où `chosenByUser` : le plafond
 * porte sur les deux premiers temps (un modèle nommé par quelqu'un), jamais sur
 * le troisième. Le défaut d'instance vaut délibérément un modèle cher, et s'y
 * heurter laisserait un compte Go sans aucun chemin vers une review.
 */
export async function resolvePrReviewModel(opts: {
  perCall?: string | null;
  userId: string;
  /** Vrai quand on vient de demander explicitement le défaut de l'instance. */
  ignoreRemembered?: boolean;
}): Promise<ResolvedAgentModel> {
  const perCall = opts.perCall?.trim();
  if (perCall) return { model: perCall, chosenByUser: true };
  if (!opts.ignoreRemembered) {
    const remembered = await getUserPrReviewModel(opts.userId);
    if (remembered) return { model: remembered, chosenByUser: true };
  }
  return { model: await getInstancePrReviewModel(), chosenByUser: false };
}

/** Le défaut de l'instance seul (sans le choix du compte) — ce que l'UI affiche
 *  en aparté sur l'option « modèle par défaut » du picker. */
export async function getInstancePrReviewModel(): Promise<string> {
  return (
    (await getAppConfigValue(PR_REVIEW_MODEL_CONFIG_KEY))?.trim() ||
    aiModelFallback(PR_REVIEW_MODEL_CONFIG_KEY)
  );
}

/** Dernier modèle de review choisi par ce compte, ou null. */
export async function getUserPrReviewModel(userId: string): Promise<string | null> {
  const { data } = await getServiceClient()
    .from("user_agent_preferences")
    .select("pr_review_model")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as { pr_review_model: string | null } | null)?.pr_review_model ?? null;
}

/**
 * Retient le modèle choisi : la fois d'après, « faire vérifier par Numo » repart
 * de là. `null` efface le choix — c'est ce que veut dire « revenir au défaut de
 * minddy » dans le picker, et sans ça le choix retenu gagnerait pour toujours.
 * Best-effort — un choix non mémorisé ne doit pas empêcher la review.
 */
export async function rememberPrReviewModel(
  userId: string,
  model: string | null,
): Promise<void> {
  try {
    await getServiceClient()
      .from("user_agent_preferences")
      .upsert({ user_id: userId, pr_review_model: model }, { onConflict: "user_id" });
  } catch (err) {
    console.error("[agent-model] remember review model failed:", (err as Error).message);
  }
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

// ── Capacités par modèle, lues dans l'index OpenRouter ──────────────────────
// L'index lui-même vit dans `openrouter-index.ts` : une seule lecture de
// /models pour le catalogue du picker, ces deux capacités et les prix (donc le
// multiplicateur de plan). Les deux fonctions ci-dessous restent ici parce que
// c'est ici que la boucle de l'agent va les chercher.

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
  return (await getOpenRouterModelInfo(model, apiKey))?.contextLength ?? null;
}

/**
 * Prix d'ENTRÉE du modèle (USD par million de tokens), pour dimensionner le seuil
 * de compaction : ce que le seuil borne est le coût de renvoyer l'historique à
 * chaque round, et ce coût-là n'a de sens qu'au prix du modèle
 * (`agentCompactThreshold`). Même source et mêmes limites que la fenêtre —
 * OpenRouter seulement ; `null` hors de là, et l'appelant retombe sur la valeur
 * calibrée plutôt que d'extrapoler sur une ignorance.
 */
export async function getModelInputPrice(
  model: string,
  provider: AgentProviderId,
  apiKey: string,
): Promise<number | null> {
  if (provider !== "openrouter") return null;
  return (await getOpenRouterModelInfo(model, apiKey))?.pricing?.inputUsdPerMTok ?? null;
}

/**
 * Le modèle du run accepte-t-il une image en entrée ? Décide si `read_resource`
 * RENVOIE la maquette au lieu d'en décrire les métadonnées (MIN-111), et si le
 * prompt annonce la capacité. Même source que la fenêtre de contexte : l'index
 * OpenRouter. Hors OpenRouter (BYOK direct openai/anthropic/google/generic), on
 * n'a pas d'index de capacités fiable → `false`, c.-à-d. le comportement d'avant
 * MIN-111 à l'octet près. Envoyer une image à un modèle qui n'en veut pas casse le
 * tour sur un 400 : le défaut conservateur est le bon.
 */
export async function supportsImageInput(
  model: string,
  provider: AgentProviderId,
  apiKey: string,
): Promise<boolean> {
  if (provider !== "openrouter") return false;
  return (await getOpenRouterModelInfo(model, apiKey))?.imageInput ?? false;
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
