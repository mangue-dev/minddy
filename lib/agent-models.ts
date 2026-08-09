/**
 * Registre partagé (client + serveur) des modèles et réglages de l'agent de
 * code cloud (MIN-46). AUCUN import server-only : le picker de modèle (UI) et la
 * résolution côté serveur (`lib/server/agent/model.ts`) l'importent tous deux.
 *
 * Cascade de résolution du modèle d'un run :
 *   override du run  >  défaut perso de l'user (user_agent_preferences)  >
 *   défaut racine (app_config.agent_model, fallback AGENT_ROOT_MODEL_FALLBACK).
 */
import { aiModelFallback } from "@/lib/ai-model-config";

export interface AgentModelOption {
  /** id OpenRouter au format `provider/model`. */
  id: string;
  /** libellé affiché dans le picker. */
  label: string;
  /** note courte (coût / usage). */
  hint?: string;
}

// ── Clés app_config (surcharge admin sans redeploy) ──────────────────────────
/** Défaut racine du modèle de l'agent. */
export const AGENT_MODEL_CONFIG_KEY = "agent_model";
// L'ancien plafond mensuel fixe (`agent_monthly_cap_usd`, 10 $) est remplacé
// depuis MIN-72 par le budget d'usage du PLAN (lib/billing-plans.ts).

/**
 * Défaut racine si `app_config.agent_model` est absent. L'id lui-même vit dans
 * le registre admin (`lib/ai-model-config.ts`), avec tous les autres — on ne le
 * réécrit pas ici. Miroir du seed de la migration 20260806090000_agent_runs.sql :
 * tenir les deux synchronisés.
 */
export const AGENT_ROOT_MODEL_FALLBACK = aiModelFallback(AGENT_MODEL_CONFIG_KEY);

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

// ── Réglages opérationnels (défauts ; surchargables plus tard) ────────────────
/**
 * PLAFOND de la soft-deadline d'un chunk : au-delà, on suspend au round suivant.
 *
 * 700 s, calé sur les 800 s du plan Pro sous Fluid Compute (cf. le `maxDuration` de
 * `app/api/cron/agent-drain`). Ce n'est qu'un PLAFOND : la soft-deadline effective
 * est `min(budget que l'appelant a annoncé, ceci)`, donc un drain lancé depuis une
 * route de 300 s reste borné par son propre budget. C'est ce qui permet d'avoir des
 * chunks longs au cron sans mettre en danger les chemins courts.
 */
export const AGENT_SOFT_DEADLINE_MS = 700_000;
/** Timeout dur d'un appel modèle dans la boucle agentique. */
export const AGENT_RUN_TIMEOUT_MS = 210_000;
/** Garde-fou anti-runaway : nombre max de reprises (suspend→resume) d'un run. */
export const AGENT_MAX_CONTINUATIONS = 20;

// ── Compaction du contexte (durcissement, runs très longs) ────────────────────
/** Au-delà de cette estimation de tokens, on résume le milieu de l'historique.
    Conservateur (proxy caractères/4 qui sous-estime le code) : sûr sur les modèles
    à large fenêtre (DeepSeek, Claude…). */
export const AGENT_COMPACT_TOKEN_THRESHOLD = 70_000;
/**
 * VALEUR CALIBRÉE du seuil de compaction : ce qu'il vaut au prix de référence, et
 * le PLANCHER sous lequel il ne descend jamais (cf. `agentCompactThreshold`, qui
 * le transpose au prix du modèle du run — c'était un plafond fixe jusqu'à MIN-248).
 *
 * Fenêtre ≠ budget. Le seuil valait 75 % de la fenêtre, et les modèles qu'on
 * utilise ont des fenêtres de 1 M à 1,05 M → seuil effectif ~787 000 tokens, soit
 * 5× notre plus gros checkpoint. Résultat : la compaction n'a jamais tourné une
 * seule fois en production (MIN-113). Ce qui plafonne une session longue n'est pas
 * la fenêtre, c'est le COÛT PAR ROUND : on renvoie tout l'historique à chaque appel
 * et — mesuré, pas supposé — le prompt caching ne l'amortit pas (les breakpoints de
 * `caching.ts` sont en tête d'historique, donc le bloc caché reste figé pendant que
 * l'historique grossit ; le coût observé colle au tarif input plein à 2 % près).
 *
 * 120 000 vient de la mesure sur les 814 appels `ai_usage` de l'agent
 * (docs/agent-harness-comparison.md §3.4) :
 *   • p90 du contexte réel = 86 815 tokens → une session normale ne le voit jamais ;
 *   • max observé = 158 301 → un plafond à 180 k ne se déclencherait JAMAIS, ce qui
 *     reproduirait le bug qu'on corrige ici ;
 *   • résumer est amorti en ~1,2 round dès 60 k, donc c'est la qualité (ne pas
 *     harceler les sessions courtes) qui fixe le plancher, pas la rentabilité.
 * À revoir si la distribution des contextes bouge — pas à l'aveugle.
 */
export const AGENT_COMPACT_BASELINE_TOKENS = 120_000;
/**
 * Prix d'entrée AUQUEL les 120 000 ci-dessus ont été calibrés : celui du modèle
 * par défaut de minddy au moment de la mesure (`deepseek/deepseek-v4-flash`,
 * 0,14 $/Mtok). C'est ce qui rend le plafond TRANSPOSABLE : à ce prix, le prompt
 * d'un round coûte 0,0168 $, et c'est ce COÛT PAR ROUND — pas le nombre de
 * tokens — que le plafond borne réellement.
 */
export const AGENT_COMPACT_REFERENCE_INPUT_USD_PER_MTOK = 0.14;
/**
 * Jusqu'où le plafond peut MONTER pour un modèle bon marché. Deux fois la valeur
 * calibrée, et la raison est celle de MIN-113 : le plus gros contexte jamais
 * observé sur l'agent est 158 301 tokens. Un seuil au-delà de 240 000 ne se
 * déclencherait donc jamais — c'est-à-dire n'existerait pas.
 */
export const AGENT_COMPACT_MAX_TOKENS_CEILING = 240_000;

/**
 * SEUIL DE COMPACTION du run, dérivé du modèle plutôt qu'écrit en dur.
 *
 * Le plafond de 120 000 disait une vraie chose — « un round ne doit pas coûter
 * plus que ça à renvoyer » — mais il la disait en TOKENS, ce qui ne veut dire la
 * même chose que pour un modèle au même prix. Entre `deepseek-v4-flash`
 * (0,14 $/Mtok) et `claude-opus-4.8` (5 $/Mtok), le même historique de 120 000
 * tokens coûte 0,017 $ ou 0,60 $ par round : trente-six fois l'écart, pour un
 * garde-fou censé borner une dépense.
 *
 * Le seuil se lit donc en dollars et se convertit en tokens au prix du modèle.
 * Trois bornes, et chacune répare une panne connue :
 *
 *  - **plancher à `AGENT_COMPACT_BASELINE_TOKENS`** — on ne DESCEND jamais
 *    sous la valeur calibrée, même pour un modèle très cher. Compacter plus tôt
 *    n'économise rien : le modèle rachète en relectures ce qu'on lui retire, et
 *    c'est exactement MIN-248. Un modèle cher garde donc le comportement
 *    d'aujourd'hui, à l'octet près.
 *  - **plafond à `AGENT_COMPACT_MAX_TOKENS_CEILING`** — un seuil que les runs
 *    n'atteignent jamais ne s'est jamais déclenché (MIN-113).
 *  - **et toujours ≤ 75 % de la fenêtre** : le budget ne peut pas dépasser ce que
 *    le modèle sait lire.
 *
 * `inputUsdPerMTok` inconnu (provider BYOK hors catalogue OpenRouter) ou nul
 * (modèle gratuit) → on retombe sur la valeur calibrée. Ignorer le prix n'est pas
 * une licence de monter : c'est une raison de ne pas bouger.
 */
export function agentCompactThreshold(opts: {
  contextWindow?: number | null;
  inputUsdPerMTok?: number | null;
}): number {
  const fromWindow = opts.contextWindow
    ? Math.floor(opts.contextWindow * 0.75)
    : AGENT_COMPACT_TOKEN_THRESHOLD;

  const price = opts.inputUsdPerMTok;
  const affordable =
    typeof price === "number" && Number.isFinite(price) && price > 0
      ? Math.floor(
          (AGENT_COMPACT_BASELINE_TOKENS * AGENT_COMPACT_REFERENCE_INPUT_USD_PER_MTOK) / price,
        )
      : AGENT_COMPACT_BASELINE_TOKENS;

  const budget = Math.min(
    Math.max(affordable, AGENT_COMPACT_BASELINE_TOKENS),
    AGENT_COMPACT_MAX_TOKENS_CEILING,
  );
  return Math.min(fromWindow, budget);
}
/** Taille (octets) de la queue récente préservée verbatim lors d'une compaction. */
export const AGENT_COMPACT_KEEP_RECENT_BYTES = 48_000;
/** On ne lance pas de compaction (appel LLM en plus) s'il reste moins que ça de budget. */
export const AGENT_COMPACT_MIN_BUDGET_MS = 60_000;
