/**
 * Registre partagé (client + serveur) des modèles et réglages de l'agent de
 * code cloud (MIN-46). AUCUN import server-only : le picker de modèle (UI) et la
 * résolution côté serveur (`lib/server/agent/model.ts`) l'importent tous deux.
 *
 * Cascade de résolution du modèle d'un run :
 *   override du run  >  défaut perso de l'user (user_agent_preferences)  >
 *   défaut racine (app_config.agent_model, fallback AGENT_ROOT_MODEL_FALLBACK).
 */

export interface AgentModelOption {
  /** id OpenRouter au format `provider/model`. */
  id: string;
  /** libellé affiché dans le picker. */
  label: string;
  /** note courte (coût / usage). */
  hint?: string;
}

/**
 * Défaut racine si `app_config.agent_model` est absent — miroir du seed de la
 * migration 20260806090000_agent_runs.sql. Tenir les deux synchronisés.
 */
export const AGENT_ROOT_MODEL_FALLBACK = "deepseek/deepseek-v4-flash";

/**
 * Modèles proposés dans le picker (utilisateur + numo). L'admin change le défaut
 * racine via `app_config.agent_model` ; un modèle explicite (override d'un run
 * ou forçage numo) peut viser HORS de cette liste — l'allowlist ne régit que le
 * picker. Ids à confirmer contre l'index OpenRouter `/models`.
 */
export const AGENT_ALLOWED_MODELS: AgentModelOption[] = [
  { id: "deepseek/deepseek-v4-flash", label: "DeepSeek V4 Flash", hint: "Économique · défaut" },
  { id: "anthropic/claude-sonnet-5", label: "Claude Sonnet 5", hint: "Équilibré, fort en code" },
  { id: "anthropic/claude-opus-4.8", label: "Claude Opus 4.8", hint: "Qualité maximale" },
];

export function isAllowedAgentModel(id: string): boolean {
  return AGENT_ALLOWED_MODELS.some((m) => m.id === id);
}

// ── Clés app_config (surcharge admin sans redeploy) ──────────────────────────
/** Défaut racine du modèle de l'agent. */
export const AGENT_MODEL_CONFIG_KEY = "agent_model";
/** Plafond mensuel (USD) d'usage de l'agent sur la clé plateforme. */
export const AGENT_MONTHLY_CAP_CONFIG_KEY = "agent_monthly_cap_usd";

// ── Réglages opérationnels (défauts ; surchargables plus tard) ────────────────
/** Plafond mensuel par défaut (USD) quand la clé plateforme est utilisée. */
export const AGENT_MONTHLY_CAP_USD_DEFAULT = 10;
/** Soft-deadline d'un chunk : au-delà, on suspend au round suivant (< 300s maxDuration). */
export const AGENT_SOFT_DEADLINE_MS = 250_000;
/** Timeout dur d'un appel modèle dans la boucle agentique. */
export const AGENT_RUN_TIMEOUT_MS = 210_000;
/** Garde-fou anti-runaway : nombre max de reprises (suspend→resume) d'un run. */
export const AGENT_MAX_CONTINUATIONS = 20;
