import "server-only";

import os from "node:os";

import { getAppConfigValue } from "@/lib/server/app-config";
import { AGENT_ALLOWED_MODELS } from "@/lib/agent-models";
import type { FavoriteSubagentModel, SubagentThinkingEffort } from "./subagent";

/**
 * Réglages des sous-agents (MIN-112) : la liste « Favorites for sub-agents » et le
 * plafond de parallélisme.
 *
 * Les deux passent par `app_config`, PAS par l'env — même mécanique que
 * `agent_model` (`getAppConfigValue`, cache 60 s) : réglable sans déploiement, comme
 * demandé, et sans variable Vercel de plus. Une config cassée retombe sur le repli
 * écrit en code : un JSON mal formé ne doit pas tuer un run.
 */

/** Clé `app_config` de la liste de favoris (JSON : tableau de FavoriteSubagentModel). */
export const SUBAGENT_FAVORITES_CONFIG_KEY = "agent_subagent_favorites";
/** Clé `app_config` du plafond de sous-agents simultanés (entier). */
export const SUBAGENT_MAX_PARALLEL_CONFIG_KEY = "agent_subagent_max_parallel";

/**
 * Repli écrit EN CODE, en ANGLAIS — c'est du prompt, pas de l'UI. On reprend les
 * ids d'`AGENT_ALLOWED_MODELS` (source unique des modèles curatés) mais PAS leurs
 * `hint`, qui sont en français et écrits pour le picker de lancement : « Économique ·
 * défaut » ne dit rien à un agent qui choisit un modèle pour une exploration.
 */
const FALLBACK_FAVORITES: FavoriteSubagentModel[] = [
  {
    id: "deepseek/deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
    use_case:
      "Cheap and fast. Default choice for exploration, greps, reading a lot of files, and any mechanical task.",
    thinking_effort: "low",
  },
  {
    id: "anthropic/claude-sonnet-5",
    label: "Claude Sonnet 5",
    use_case:
      "Balanced and strong at code. Use it when the sub-agent has to WRITE code you will not re-read line by line.",
    thinking_effort: "medium",
  },
  {
    id: "anthropic/claude-opus-4.8",
    label: "Claude Opus 4.8",
    use_case:
      "Most capable, most expensive. Only for genuinely hard analysis or a change with subtle logic.",
    thinking_effort: "high",
  },
];

const EFFORTS: ReadonlySet<string> = new Set<SubagentThinkingEffort>(["low", "medium", "high"]);

/** Valide une entrée de la config (une entrée cassée est ignorée, pas fatale). */
function parseFavorite(raw: unknown): FavoriteSubagentModel | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  if (!id) return null;
  const label = typeof o.label === "string" && o.label.trim() ? o.label.trim() : id;
  const useCase = typeof o.use_case === "string" ? o.use_case.trim() : "";
  const effort = typeof o.thinking_effort === "string" ? o.thinking_effort.trim() : "";
  return {
    id,
    label,
    use_case: useCase,
    ...(EFFORTS.has(effort) ? { thinking_effort: effort as SubagentThinkingEffort } : {}),
  };
}

/**
 * Favoris servis au prompt système du parent. Surchargeables par `app_config` ;
 * un JSON illisible, un tableau vide ou une liste dont aucune entrée n'est valide
 * retombe sur le repli — le run garde une liste utilisable dans tous les cas.
 */
export async function getSubagentFavorites(): Promise<FavoriteSubagentModel[]> {
  const raw = await getAppConfigValue(SUBAGENT_FAVORITES_CONFIG_KEY).catch(() => null);
  if (!raw?.trim()) return FALLBACK_FAVORITES;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return FALLBACK_FAVORITES;
    const favorites = parsed
      .map(parseFavorite)
      .filter((f): f is FavoriteSubagentModel => f !== null);
    return favorites.length > 0 ? favorites : FALLBACK_FAVORITES;
  } catch {
    console.error(`[subagent-config] ${SUBAGENT_FAVORITES_CONFIG_KEY} is not valid JSON`);
    return FALLBACK_FAVORITES;
  }
}

/** Bornes du plafond calculé. Un seul sous-agent ne servirait à rien ; au-delà de
 *  six, ce n'est plus la VM qui limite mais le fournisseur (429) et la sandbox. */
const MIN_PARALLEL = 2;
const MAX_PARALLEL = 6;

/**
 * Plafond de sous-agents SIMULTANÉS, calculé au lancement d'après les ressources de
 * la VM (`os.availableParallelism()` — les vCPU réellement utilisables), borné à
 * [2, 6], surchargeable par `app_config`.
 *
 * Commentaire honnête sur ce que ce calcul vaut : un sous-agent est I/O-BOUND (des
 * appels LLM et des allers-retours vers la sandbox, presque pas de CPU local), donc
 * les vCPU ne sont qu'un PROXY — ils disent la taille de la machine, pas le nombre
 * de filles qu'elle peut nourrir. Les vrais goulots sont ailleurs, et tous deux déjà
 * traités : la sandbox partagée (un seul écrivain, cf. `Subagents`) et les 429 du
 * fournisseur (repris par `streamCompletion`). D'où les bornes serrées : le calcul
 * évite d'empiler vingt filles sur une petite VM, il ne prétend pas dimensionner.
 */
export async function maxParallelSubagents(): Promise<number> {
  const configured = await getAppConfigValue(SUBAGENT_MAX_PARALLEL_CONFIG_KEY).catch(() => null);
  if (configured?.trim()) {
    const n = Number.parseInt(configured.trim(), 10);
    if (Number.isInteger(n) && n >= 1) return Math.min(n, 32);
  }
  const cpus =
    typeof os.availableParallelism === "function"
      ? os.availableParallelism()
      : (os.cpus()?.length ?? MIN_PARALLEL);
  return Math.min(MAX_PARALLEL, Math.max(MIN_PARALLEL, cpus));
}

/**
 * Résolveur du champ `model` de `spawn_agent`, construit pour UN run.
 *
 * Validé contre le catalogue du run (`getAgentModelsForUser`) et NON contre l'index
 * privé de `model.ts` : le catalogue est déjà exporté, caché une heure, ne lève
 * jamais, et surtout il FILTRE sur le support du tool-calling — un sous-agent qui ne
 * sait pas appeler d'outil ne peut rien faire. Les favoris sont acceptés par id ET
 * par libellé (l'agent les lit par leur nom dans son prompt) même si le catalogue
 * n'a pas pu être chargé : un favori curaté est une valeur sûre.
 *
 * Un id inventé revient en ERREUR DE TOOL avec la liste des favoris, jamais en 400
 * du provider — celui-ci brûlerait un round de la fille pour rien.
 */
export function makeSubagentModelResolver(opts: {
  favorites: FavoriteSubagentModel[];
  /** Ids du catalogue du run (vide = catalogue indisponible). */
  catalogIds: string[];
}): (raw: string) => { ok: true; id: string } | { ok: false; error: string } {
  const catalog = new Set(opts.catalogIds);
  const byLabel = new Map(opts.favorites.map((f) => [f.label.toLowerCase(), f.id]));
  const favoriteIds = new Set(opts.favorites.map((f) => f.id));

  return (raw: string) => {
    const value = raw.trim();
    const byName = byLabel.get(value.toLowerCase());
    if (byName) return { ok: true, id: byName };
    if (favoriteIds.has(value) || catalog.has(value)) return { ok: true, id: value };
    const list = opts.favorites.map((f) => `${f.id} (${f.label})`).join(", ");
    return {
      ok: false,
      error:
        `Unknown model ${JSON.stringify(value)} — it is not in this session's model catalogue ` +
        `(models that cannot call tools are excluded from it, and a sub-agent needs tools). ` +
        `Favorites for sub-agents: ${list}. Omit \`model\` to run the sub-agent on your own model.`,
    };
  };
}
