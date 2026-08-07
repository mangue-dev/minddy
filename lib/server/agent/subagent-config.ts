import "server-only";

import os from "node:os";

import { getAppConfigValue } from "@/lib/server/app-config";
import { isMultiplierWithinPlan } from "@/lib/model-multiplier";
import {
  DEFAULT_SUBAGENT_FAVORITES,
  parseSubagentFavorites,
  type FavoriteSubagentModel,
} from "@/lib/subagent-favorites";
import type { AgentModelsCatalog } from "./models-catalog";

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

/**
 * Plafond de rounds d'une fille, CUMULÉ sur toutes ses reprises — et non par
 * chunk : une fille reprise trois fois n'a pas droit à quarante-cinq rounds.
 */
export const SUBAGENT_MAX_ROUNDS = 15;

/**
 * Ce qu'il reste de rounds à une fille qu'on s'apprête à (re)lancer. **Zéro ou
 * moins veut dire COUPER**, jamais « lui en rendre un ».
 *
 * Cette nuance a coûté deux passages de routine entiers (07/08/2026). Le
 * lanceur bornait la fille reprise à `Math.max(1, MAX - déjà joués)` : une fois
 * son plafond atteint, elle repartait avec UN round, le jouait, la boucle
 * suspendait aussitôt (`round >= maxRounds`), le parent se garait, le chunk se
 * re-queuait — et ça recommençait au chunk suivant. Dix-neuf chunks de 5 à 20 s
 * pendant lesquels le parent n'a pas dit un mot, chacun payant son réveil de
 * microVM, jusqu'à ce que le garde-fou des 20 continuations tue le tour.
 *
 * Le `max(1, …)` semblait prudent — « au moins un round, sinon la boucle
 * refuserait de tourner ». C'est exactement l'inverse : une boucle qui ne peut
 * pas tourner doit rendre la main, pas tourner à vide.
 */
export function subagentRoundsLeft(roundsSoFar: number | undefined): number {
  return SUBAGENT_MAX_ROUNDS - (roundsSoFar ?? 0);
}

/**
 * Ce qu'on GARDE au parent quand une fille tourne : de quoi recevoir le rapport,
 * relancer un round ou deux, faire le type-check de fin de tour et pousser. En
 * dessous, le tour se terminerait sur un rapport que personne n'a eu le temps de lire.
 */
export const SUBAGENT_PARENT_RESERVE_MS = 120_000;

/** Ce qu'une fille doit avoir POUR ELLE : en dessous, elle n'a pas le temps de
 *  produire un rapport utile, et un round payé pour rien est un round perdu.
 *  Ce n'est pas ce qu'on oppose au chunk — le chunk doit porter ça PLUS la réserve
 *  du parent, cf. `SUBAGENT_RESUME_MIN_SOFT_DEADLINE_MS`. */
export const SUBAGENT_MIN_MS = 30_000;

/**
 * Temps qu'un chunk doit avoir devant lui pour qu'y faire tourner une fille ait un
 * sens — la REPRENDRE à l'amorçage comme en LANCER une en cours de route : la
 * réserve du parent PLUS le minimum vital de la fille. C'est le pendant TEMPS de
 * `subagentRoundsLeft`, et il vient du même bug.
 *
 * Le budget d'une fille vaut `min(SUBAGENT_MAX_MS, restant du chunk − réserve)`, et
 * le lanceur le plancherait à 1 s (`Math.max(1_000, budget)`). Sur un chunk repris
 * en fin de fenêtre de drain — 40 à 150 s, la norme quand plusieurs runs se
 * partagent les 270 s — la fille repartait donc avec UNE SECONDE : elle jouait un
 * round, se re-suspendait, le parent garé rendait `suspended` sans dire un mot, le
 * chunk se re-queuait. Un round par chunk, chacun payant son réveil de microVM,
 * jusqu'à ce que le garde-fou des 20 continuations tue le tour (MIN-212).
 *
 * Baisser le plancher à 0 ne corrige rien : la fille rendrait la main sans jouer un
 * seul round, ce qui est le zombie à l'état pur. Ce qui corrige, c'est de refuser
 * l'ADMISSION du chunk — `executeAgentRun` re-queue le run tel quel, sans
 * incrémenter `continuations`, et le prochain drain à budget plein le reprend.
 *
 * Le LANCEMENT s'y oppose désormais aussi (`budgetGuard`). Il ne gardait que
 * `SUBAGENT_MIN_MS`, en l'opposant au restant du chunk au lieu du budget de la
 * fille : entre 30 s et 150 s de restant, un `spawn_agent` passait, et la fille
 * recevait la même seconde. Version étroite du même défaut, sur la voie sœur —
 * bornée par l'admission ci-dessus (le chunk suivant est différé jusqu'à une
 * fenêtre pleine), mais c'est un round joué dans la réserve du parent pour rien.
 */
export const SUBAGENT_RESUME_MIN_SOFT_DEADLINE_MS =
  SUBAGENT_PARENT_RESERVE_MS + SUBAGENT_MIN_MS;

/** Ce chunk peut-il faire tourner une fille pour de bon — la reprendre ou en lancer
 *  une —, plutôt que de lui payer un round pour rien ? */
export function chunkFitsSubagentResume(softDeadlineMs: number): boolean {
  return softDeadlineMs >= SUBAGENT_RESUME_MIN_SOFT_DEADLINE_MS;
}

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

/** Un favori, situé sur l'échelle de coût du run — `undefined` = non situable. */
export type ScopedFavorite = FavoriteSubagentModel & { multiplier?: number };

/**
 * Ce qu'un run a le droit de donner à ses filles : le catalogue et les favoris
 * PASSÉS AU PLAFOND DE PLAN du compte qui paye.
 *
 * Sans ce tri, `spawn_agent` était le trou dans la raquette : le picker grise
 * Opus pour un compte Go, mais l'agent parent, lui, se voyait offrir tout le
 * catalogue tool-calling et pouvait déléguer dessus — sur le quota minddy, et
 * sans que personne ne l'ait choisi. Le plafond doit valoir pour tout ce qui
 * dépense, y compris quand c'est un modèle qui décide.
 *
 * Le plafond ne s'applique évidemment qu'au quota minddy : en BYOK, le catalogue
 * ne porte pas de `maxMultiplier` et rien n'est retiré.
 */
export interface SubagentModelScope {
  /** Ids que la fille peut vraiment tourner. */
  allowedIds: string[];
  /** Ids connus du catalogue mais au-dessus du plafond : refusés en le DISANT. */
  abovePlanIds: string[];
  /** Favoris qui tiennent dans le plafond — ce que le prompt annonce. */
  favorites: ScopedFavorite[];
  /** Plafond du plan, ou null (BYOK) — pour l'expliquer au parent. */
  maxMultiplier: number | null;
}

export function scopeSubagentModels(opts: {
  favorites: FavoriteSubagentModel[];
  catalog: Pick<AgentModelsCatalog, "models" | "maxMultiplier">;
}): SubagentModelScope {
  const max = opts.catalog.maxMultiplier ?? null;
  const multipliers = new Map(
    opts.catalog.models.flatMap((m) => (m.multiplier == null ? [] : [[m.id, m.multiplier]] as const)),
  );
  const within = (id: string) => max == null || isMultiplierWithinPlan(multipliers.get(id), max);

  const allowedIds: string[] = [];
  const abovePlanIds: string[] = [];
  for (const m of opts.catalog.models) (within(m.id) ? allowedIds : abovePlanIds).push(m.id);

  return {
    allowedIds,
    abovePlanIds,
    // Un favori que le catalogue ne situe pas reste servi : on ne retire pas une
    // valeur sûre parce que l'index des prix était illisible ce jour-là.
    favorites: opts.favorites
      .filter((f) => within(f.id))
      .map((f) => {
        const multiplier = multipliers.get(f.id);
        return multiplier == null ? f : { ...f, multiplier };
      }),
    maxMultiplier: max,
  };
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
 * du provider — celui-ci brûlerait un round de la fille pour rien. Un modèle qui
 * existe mais dépasse le plafond du plan se refuse À PART, en le nommant : lui
 * répondre « inconnu du catalogue » serait faux, et l'agent le retenterait sous
 * une autre orthographe au lieu d'en choisir un autre.
 */
export function makeSubagentModelResolver(opts: {
  favorites: FavoriteSubagentModel[];
  /** Ids du catalogue du run PASSÉS AU PLAFOND (vide = catalogue indisponible). */
  catalogIds: string[];
  /** Ids du catalogue écartés par le plafond du plan. */
  abovePlanIds?: string[];
  /** Le plafond lui-même, pour le dire au parent. */
  maxMultiplier?: number | null;
}): (raw: string) => { ok: true; id: string } | { ok: false; error: string } {
  const catalog = new Set(opts.catalogIds);
  const abovePlan = new Set(opts.abovePlanIds ?? []);
  const byLabel = new Map(opts.favorites.map((f) => [f.label.toLowerCase(), f.id]));
  const favoriteIds = new Set(opts.favorites.map((f) => f.id));
  const list = () => opts.favorites.map((f) => `${f.id} (${f.label})`).join(", ");

  return (raw: string) => {
    const value = raw.trim();
    const byName = byLabel.get(value.toLowerCase());
    if (byName) return { ok: true, id: byName };
    if (favoriteIds.has(value) || catalog.has(value)) return { ok: true, id: value };
    if (abovePlan.has(value)) {
      return {
        ok: false,
        error:
          `${value} is above this account's plan ceiling` +
          (opts.maxMultiplier != null ? ` (×${opts.maxMultiplier} its default model)` : "") +
          `, so it cannot run on this account's usage budget. ` +
          `Available favorites: ${list()}. Omit \`model\` to run the sub-agent on your own model.`,
      };
    }
    return {
      ok: false,
      error:
        `Unknown model ${JSON.stringify(value)} — it is not in this session's model catalogue ` +
        `(models that cannot call tools are excluded from it, and a sub-agent needs tools). ` +
        `Favorites for sub-agents: ${list()}. Omit \`model\` to run the sub-agent on your own model.`,
    };
  };
}
