import "server-only";

import { getAppConfigValues } from "@/lib/server/app-config";
import {
  aiModelFallback,
  applyModelSuffix,
  modelSuffixKey,
  stripModelSuffix,
} from "@/lib/ai-model-config";

/**
 * Résolution d'un réglage de modèle : l'id choisi côté admin, plus son
 * raccourci de routage OpenRouter s'il en porte un (MIN-263).
 *
 * Un seul endroit lit les DEUX lignes `app_config` — le modèle et son suffixe —
 * et les recolle. Les appelants n'ont donc jamais à connaître l'existence du
 * suffixe : ils demandent un modèle par sa clé, et reçoivent l'id à envoyer.
 *
 * Ce que le suffixe change : rien au modèle, tout à l'ORDRE des providers qui
 * le servent (`nitro` = le plus rapide, `floor` = le moins cher, `exacto` = le
 * plus fiable en tool-calling). D'où le repli de `withModelSuffixFallback` :
 * quand aucun provider ne satisfait l'ordre demandé, OpenRouter refuse l'appel
 * entier — mieux vaut alors le modèle nu qu'une fonctionnalité éteinte.
 */

export interface ResolvedModel {
  /** L'id à ENVOYER : la base plus son suffixe, quand il y en a un. */
  model: string;
  /** L'id nu, sans suffixe — pour un affichage ou une recherche au catalogue. */
  base: string;
  /** Le raccourci retenu, ou `null` quand l'admin n'en a posé aucun. */
  suffix: string | null;
}

/**
 * Le modèle d'un réglage, suffixe compris. Une ligne absente ou vide retombe
 * sur le `fallback` du registre (`lib/ai-model-config.ts`) — qui suit les
 * évolutions du défaut produit, contrairement à une valeur figée en base.
 *
 * UNE seule requête pour les deux clés, et le cache 60 s d'`app-config` par
 * dessus : lire le suffixe ne coûte pas un aller-retour de plus.
 */
export async function resolveConfiguredModel(key: string): Promise<ResolvedModel> {
  const suffixKey = modelSuffixKey(key);
  const cfg = await getAppConfigValues([key, suffixKey]).catch(() => ({}) as Record<
    string,
    string | null
  >);
  return resolveFromValues(key, cfg);
}

/**
 * La même résolution, sur des valeurs DÉJÀ lues — pour les appelants qui
 * chargent plusieurs clés d'un coup (un drapeau et son modèle, par exemple) et
 * n'ont pas à repasser par la base. Penser à inclure `modelSuffixKey(key)` dans
 * le lot demandé, sans quoi le suffixe passera pour absent.
 */
export function resolveFromValues(
  key: string,
  values: Record<string, string | null | undefined>,
): ResolvedModel {
  const base = values[key]?.trim() || aiModelFallback(key);
  const suffix = values[modelSuffixKey(key)]?.trim() || null;
  return { model: applyModelSuffix(base, suffix), base, suffix };
}

/**
 * Une CASCADE de réglages : le premier posé gagne, avec SON suffixe — celui de
 * `assistant_model` quand c'est lui qui répond, celui de `fallback_model`
 * quand c'est l'autre. Aucune ligne posée : le défaut code de la première clé.
 */
export function resolveCascadeFromValues(
  keys: string[],
  values: Record<string, string | null | undefined>,
): ResolvedModel {
  for (const key of keys) {
    if (values[key]?.trim()) return resolveFromValues(key, values);
  }
  return resolveFromValues(keys[0], values);
}

/** Les clés à demander à `getAppConfigValues` pour résoudre `key` en entier. */
export function modelConfigKeys(key: string): [string, string] {
  return [key, modelSuffixKey(key)];
}

/**
 * Un `fetch` vers OpenRouter qui REJOUE une fois sur le modèle nu quand la
 * requête est refusée et que le modèle portait un raccourci de routage.
 *
 * `request(model)` reconstruit l'objet de requête : c'est le seul endroit où le
 * modèle change entre les deux essais, et ça évite d'avoir à recopier un corps
 * de requête pour la seconde tentative.
 *
 * On rend AUSSI le modèle qui a servi, pour que les boucles à plusieurs rounds
 * (les dictées) collent au modèle qui a marché au lieu de re-tenter le suffixe
 * — et donc de payer deux requêtes à chaque tour.
 */
export async function fetchOpenRouterWithSuffixFallback(
  url: string,
  model: string,
  request: (model: string) => RequestInit,
  logPrefix: string,
): Promise<{ response: Response; model: string }> {
  const response = await fetch(url, request(model));
  const base = stripModelSuffix(model);
  if (response.ok || base === model) return { response, model };
  console.warn(`${logPrefix} ${model} refused (${response.status}), retrying on ${base}`);
  return { response: await fetch(url, request(base)), model: base };
}

/**
 * Joue `run` sur le modèle suffixé, et REJOUE UNE FOIS sur le modèle nu si
 * l'appel échoue.
 *
 * Le repli demandé par MIN-263 : un raccourci de routage peut ne trouver aucun
 * provider (`:exacto` sur un modèle qu'aucun fournisseur vérifié ne sert), et
 * OpenRouter répond alors 404 sur l'appel entier. Un réglage de confort ne doit
 * pas éteindre une fonctionnalité — on retombe sur le modèle de base.
 *
 * Rejouer ne double jamais une réponse déjà commencée : le refus arrive au
 * moment de la requête, avant le premier token. Et sans suffixe, `run` n'est
 * appelé qu'une fois — le repli n'est pas un retry générique.
 *
 * `ok` sert aux appelants qui ne LÈVENT pas en cas d'échec mais rendent une
 * valeur convenue (`forcedToolCall` rend `null`) : sans lui, leur échec passe
 * pour un succès et le repli ne se déclenche pas.
 */
export async function withModelSuffixFallback<T>(
  model: string,
  run: (model: string) => Promise<T>,
  options?: { ok?: (value: T) => boolean; logPrefix?: string },
): Promise<T> {
  const base = stripModelSuffix(model);
  if (base === model) return run(model);

  const logPrefix = options?.logPrefix ?? "[model-suffix]";
  try {
    const result = await run(model);
    if (!options?.ok || options.ok(result)) return result;
    console.warn(`${logPrefix} ${model} failed, retrying on ${base}`);
  } catch (err) {
    console.warn(`${logPrefix} ${model} threw, retrying on ${base}:`, (err as Error).message);
  }
  return run(base);
}
