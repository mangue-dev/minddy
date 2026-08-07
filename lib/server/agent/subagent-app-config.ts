import "server-only";

import os from "node:os";

import { getAppConfigValue } from "@/lib/server/app-config";
import {
  DEFAULT_SUBAGENT_FAVORITES,
  parseSubagentFavorites,
  type FavoriteSubagentModel,
} from "@/lib/subagent-favorites";

/**
 * Les DEUX réglages de sous-agents qui se lisent en base (MIN-112) — la liste de
 * favoris et le plafond de parallélisme.
 *
 * Séparés de [subagent-config.ts](subagent-config.ts) par MIN-224 : celui-ci est
 * importé par la boucle, qui tourne maintenant dans la microVM, et un module que
 * la boucle importe ne doit pas pouvoir atteindre le client Supabase en clé de
 * service. Ces deux fonctions-ci se lisent donc AVANT, côté fonction, et leurs
 * résultats descendent dans le job du tour.
 *
 * Les deux passent par `app_config`, PAS par l'env — même mécanique que
 * `agent_model` (`getAppConfigValue`, cache 60 s) : réglable sans déploiement.
 */

/** Bornes du plafond calculé. Un seul sous-agent ne servirait à rien ; au-delà de
 *  six, ce n'est plus la VM qui limite mais le fournisseur (429) et la sandbox. */
const MIN_PARALLEL = 2;
const MAX_PARALLEL = 6;

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
    console.error(`[subagent-app-config] ${SUBAGENT_FAVORITES_CONFIG_KEY} is unusable, using defaults`);
  }
  return favorites ?? DEFAULT_SUBAGENT_FAVORITES;
}

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
