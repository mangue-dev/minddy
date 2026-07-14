import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getAppConfigValue } from "@/lib/server/app-config";
import { AGENT_MODEL_CONFIG_KEY, AGENT_ROOT_MODEL_FALLBACK } from "@/lib/agent-models";
import { decryptUserAiKey } from "./byok-credentials";

/**
 * Résolution du modèle et de la clé API de l'agent de code (MIN-46).
 *
 * MODÈLE — cascade à 3 niveaux, précédence run > user > racine :
 *   1. override du run (choisi au lancement, ou forcé par numo),
 *   2. défaut perso de l'user (user_agent_preferences.default_model),
 *   3. défaut racine (app_config.agent_model, fallback AGENT_ROOT_MODEL_FALLBACK).
 *
 * CLÉ — BYOK de l'user si présente (usage illimité, à ses frais), sinon la clé
 * plateforme OPENROUTER_API_KEY (plafonnée mensuellement, cf. quota.ts).
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

/**
 * Résout le modèle à figer sur un run. `perRunModel` (override/forçage) gagne, sinon
 * le défaut perso de l'user, sinon le défaut racine.
 */
export async function resolveAgentModel(opts: {
  perRunModel?: string | null;
  userId: string;
}): Promise<string> {
  const perRun = opts.perRunModel?.trim();
  if (perRun) return perRun;
  const userDefault = await getUserDefaultModel(opts.userId);
  if (userDefault) return userDefault;
  return getRootDefaultModel();
}

/** Clé BYOK OpenRouter déchiffrée de l'utilisateur, ou null. */
export async function getUserByokKey(userId: string): Promise<string | null> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("user_ai_keys")
    .select("key_encrypted")
    .eq("user_id", userId)
    .eq("provider", "openrouter")
    .maybeSingle();
  const encrypted = (data as { key_encrypted: string } | null)?.key_encrypted;
  return encrypted ? decryptUserAiKey(encrypted) : null;
}

/** True si l'utilisateur a une clé BYOK utilisable (→ usage illimité). */
export async function userHasByokKey(userId: string): Promise<boolean> {
  return (await getUserByokKey(userId)) != null;
}

export type AgentKeyMode = "platform" | "byok";

export interface ResolvedAgentApiKey {
  apiKey: string;
  mode: AgentKeyMode;
}

/**
 * Résout la clé OpenRouter effective : BYOK de l'user si présente, sinon la clé
 * plateforme. Lève si aucune clé n'est disponible.
 */
export async function resolveAgentApiKey(userId: string): Promise<ResolvedAgentApiKey> {
  const byok = await getUserByokKey(userId);
  if (byok) return { apiKey: byok, mode: "byok" };
  const platform = process.env.OPENROUTER_API_KEY;
  if (!platform) throw new Error("OPENROUTER_API_KEY not configured");
  return { apiKey: platform, mode: "platform" };
}
