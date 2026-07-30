import "server-only";

import os from "node:os";

import { getAppConfigValue } from "@/lib/server/app-config";
import {
  DEFAULT_SUBAGENT_FAVORITES,
  parseSubagentFavorites,
  type FavoriteSubagentModel,
} from "@/lib/subagent-favorites";

/**
 * Réglages des sous-agents (MIN-112) : la liste « Favorites for sub-agents » et le
 * plafond de parallélisme.
 *
 * Les deux passent par `app_config`, PAS par l'env — même mécanique que
 * `agent_model` (`getAppConfigValue`, cache 60 s) : réglable sans déploiement, comme
 * demandé, et sans variable Vercel de plus. Une config cassée retombe sur le repli
 * écrit en code : un JSON mal formé ne doit pas tuer un run.
 *
 * Les favoris s'éditent depuis /admin (registre `lib/ai-model-config.ts`), donc la
 * FORME de la liste — type, repli produit, parseur — vit dans un module partagé
 * client/serveur : `lib/subagent-favorites.ts`.
 */

/** Clé `app_config` de la liste de favoris (JSON : tableau de FavoriteSubagentModel). */
export const SUBAGENT_FAVORITES_CONFIG_KEY = "agent_subagent_favorites";
/** Clé `app_config` du plafond de sous-agents simultanés (entier). */
export const SUBAGENT_MAX_PARALLEL_CONFIG_KEY = "agent_subagent_max_parallel";

/**
 * Favoris servis au prompt système du parent. Surchargeables par `app_config` ;
 * un JSON illisible, un tableau vide ou une liste dont aucune entrée n'est valide
 * retombe sur le repli — le run garde une liste utilisable dans tous les cas.
 */
export async function getSubagentFavorites(): Promise<FavoriteSubagentModel[]> {
  const raw = await getAppConfigValue(SUBAGENT_FAVORITES_CONFIG_KEY).catch(() => null);
  const favorites = parseSubagentFavorites(raw);
  if (!favorites && raw?.trim()) {
    console.error(`[subagent-config] ${SUBAGENT_FAVORITES_CONFIG_KEY} is unusable, using defaults`);
  }
  return favorites ?? DEFAULT_SUBAGENT_FAVORITES;
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
