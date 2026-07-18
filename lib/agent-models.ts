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
 * Libellés curatés d'une poignée de modèles phares. Le picker (lancement +
 * défaut perso) n'est PLUS limité à cette liste : il recherche tout l'index
 * OpenRouter (`/api/agent/models`) et formate les noms via `formatModelName`.
 * Cette liste ne sert qu'à fournir de jolis labels connus (cf. `model-display`)
 * pour ces ids précis. Ids à confirmer contre l'index OpenRouter `/models`.
 */
export const AGENT_ALLOWED_MODELS: AgentModelOption[] = [
  { id: "deepseek/deepseek-v4-flash", label: "DeepSeek V4 Flash", hint: "Économique · défaut" },
  { id: "anthropic/claude-sonnet-5", label: "Claude Sonnet 5", hint: "Équilibré, fort en code" },
  { id: "anthropic/claude-opus-4.8", label: "Claude Opus 4.8", hint: "Qualité maximale" },
];

// ── Clés app_config (surcharge admin sans redeploy) ──────────────────────────
/** Défaut racine du modèle de l'agent. */
export const AGENT_MODEL_CONFIG_KEY = "agent_model";
// L'ancien plafond mensuel fixe (`agent_monthly_cap_usd`, 10 $) est remplacé
// depuis MIN-72 par le budget d'usage du PLAN (lib/billing-plans.ts).

// ── Réglages opérationnels (défauts ; surchargables plus tard) ────────────────
/** Soft-deadline d'un chunk : au-delà, on suspend au round suivant (< 300s maxDuration). */
export const AGENT_SOFT_DEADLINE_MS = 250_000;
/** Timeout dur d'un appel modèle dans la boucle agentique. */
export const AGENT_RUN_TIMEOUT_MS = 210_000;
/** Garde-fou anti-runaway : nombre max de reprises (suspend→resume) d'un run. */
export const AGENT_MAX_CONTINUATIONS = 20;

// ── Compaction du contexte (durcissement, runs très longs) ────────────────────
/** Au-delà de cette estimation de tokens, on résume le milieu de l'historique.
    Conservateur (proxy caractères/4 qui sous-estime le code) : sûr sur les modèles
    à large fenêtre (DeepSeek, Claude…). */
export const AGENT_COMPACT_TOKEN_THRESHOLD = 70_000;
/** Taille (octets) de la queue récente préservée verbatim lors d'une compaction. */
export const AGENT_COMPACT_KEEP_RECENT_BYTES = 48_000;
/** On ne lance pas de compaction (appel LLM en plus) s'il reste moins que ça de budget. */
export const AGENT_COMPACT_MIN_BUDGET_MS = 60_000;
