/**
 * Le rattrapage des caches : ce qu'on invalide quand la page a raté des
 * événements — retour d'une absence, canal tombé puis rejoint.
 *
 * Le périmètre à rattraper est une liste de clés-PRÉFIXES (`["comments"]` vise
 * toutes les requêtes `["comments", issueId]`). Le geste naïf est de les jouer
 * une par une :
 *
 * ```ts
 * for (const key of keys) queryClient.invalidateQueries({ queryKey: key });
 * ```
 *
 * Chaque appel balaie le cache DEUX fois — le `findAll` d'`invalidateQueries`,
 * puis celui du `refetchQueries` qu'il enchaîne. Le périmètre d'une reprise fait
 * 9 clés utilisateur + 32 clés par projet, plafonné à 25 canaux : ~85 appels
 * (~170 parcours) sur un compte à cinq projets, ~300 (~600 parcours) au plafond.
 * Le tout dans une boucle synchrone, à l'instant du retour au premier plan —
 * c'est-à-dire pile au moment du premier geste (MIN-300).
 *
 * Restreindre la portée n'était pas une option : `type: "active"` casserait le
 * marquage des requêtes inactives, et borner aux projets à l'écran casserait les
 * agrégats que la barre latérale lit sur toutes les pages. Ce qu'on change est
 * donc le NOMBRE DE PARCOURS, pas la couverture : un seul `invalidateQueries`
 * avec un prédicat qui reconnaît les mêmes requêtes.
 *
 * Et comme une coupure de socket fait tomber tous les canaux d'un coup — une
 * seule WebSocket porte les 26 topics —, les rejoins arrivent au fil des ACK,
 * chacun avec son propre rattrapage, étalés sur plusieurs images (MIN-305). D'où
 * la file : on empile les préfixes et on ne balaie qu'une fois, à la fin.
 *
 * Séparé du provider pour être testable : vitest tourne sur node nu, sans React
 * (même raison que lib/realtime-topics.ts).
 */

import type { QueryKey } from "@tanstack/react-query";

/**
 * Fenêtre de regroupement des rattrapages. Assez large pour couvrir la volée de
 * rejoins qui suit une reconnexion (les ACK arrivent en quelques images), assez
 * courte pour que le retour au premier plan reste immédiat à l'œil.
 */
export const CATCH_UP_COALESCE_MS = 120;

/** L'identité d'une clé dans la file — la même que celle de react-query. */
const hash = (key: readonly unknown[]): string => JSON.stringify(key);

/**
 * Une requête est-elle visée par ce périmètre ?
 *
 * Reproduit exactement la sémantique de préfixe d'`invalidateQueries({ queryKey })` :
 * `["comments"]` vise `["comments", issueId]`, et une clé vise aussi la requête
 * qui lui est identique. On remonte les préfixes du plus long au plus court,
 * parce que les clés du périmètre sont courtes et que le premier essai qui
 * matche est presque toujours l'un des derniers.
 */
export function matchesCatchUpScope(
  queryKey: readonly unknown[],
  wanted: ReadonlySet<string>
): boolean {
  for (let n = queryKey.length; n > 0; n--) {
    if (wanted.has(hash(queryKey.slice(0, n)))) return true;
  }
  return false;
}

export interface CatchUpQueue {
  /** Empile un périmètre. Le balayage part au plus tard {@link CATCH_UP_COALESCE_MS} après. */
  push(keys: QueryKey[]): void;
  /** Oublie ce qui est en attente (démontage). */
  cancel(): void;
}

/**
 * La file de rattrapage.
 *
 * ⚠ Volontairement SÉPARÉE de la coalescence par clé des événements courants
 * (`invalidateCoalesced` dans le provider). Cette map-là porte le mode de
 * refetch dans son identité (`${refetch}:${hash}`) pour qu'un `"none"` n'avale
 * pas un `"active"` en attente ; partager les deux réintroduirait ce bug exact.
 *
 * @param flush  reçoit le prédicat à passer à `invalidateQueries`.
 * @param delayMs fenêtre de regroupement.
 */
export function createCatchUpQueue(
  flush: (matches: (queryKey: readonly unknown[]) => boolean) => void,
  delayMs: number = CATCH_UP_COALESCE_MS
): CatchUpQueue {
  let pending: Set<string> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  return {
    push(keys) {
      if (keys.length === 0) return;
      if (!pending) pending = new Set<string>();
      for (const key of keys) pending.add(hash(key));
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        const wanted = pending;
        pending = null;
        if (!wanted) return;
        flush((queryKey) => matchesCatchUpScope(queryKey, wanted));
      }, delayMs);
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
      pending = null;
    },
  };
}
