import type { QueryKey } from "@tanstack/react-query";

/**
 * Le direct d'UNE pull request — le vocabulaire partagé entre le serveur qui
 * pousse (`lib/server/agent/pr-live.ts`) et l'écran qui écoute
 * (`lib/use-pr-live.ts`).
 *
 * Module PUR : aucun import serveur, il traverse la frontière.
 *
 * Le message ne transporte JAMAIS de contenu, seulement les PARTIES qui ont
 * bougé. Ce n'est pas une économie d'octets : le contenu d'une PR se lit avec le
 * token du LECTEUR, et il n'est pas le même pour tout le monde — une réaction
 * porte un `viewerIsActor`, les gestes offerts dépendent de `viewer.capability`
 * (MIN-144). Pousser ce qu'un autre a lu serait faux chez celui qui reçoit. Le
 * message dit donc « telle partie a bougé », et chaque client va relire avec ses
 * propres yeux.
 *
 * C'est aussi ce qui rend le topic sûr : y être abonné ne donne accès à rien
 * qu'on ne puisse déjà lire par la route.
 */

/** Topic privé du direct d'une PR (migration 20260929090000_pull_request_realtime). */
export function pullRequestTopic(prId: string): string {
  return `pull-request:${prId}`;
}

/**
 * Les surfaces d'une PR, telles que l'écran les charge — une par cache :
 *
 *   `pr`             — l'en-tête : état, checks CI, approbations, méthodes de merge ;
 *   `conversation`   — le fil (messages, activité, réactions du fil) ;
 *   `commits`        — l'onglet Commits ;
 *   `reviewComments` — les remarques de ligne, leurs fils et leurs réactions.
 */
export type PrLivePart = "pr" | "conversation" | "commits" | "reviewComments";

/** Charge utile du message `changed`. */
export interface PrLiveChanged {
  parts: PrLivePart[];
  /** Horodatage d'émission (ms) — sert au diagnostic, pas à l'ordre : une
   *  invalidation n'est pas un delta, la rejouer dans le désordre est sans effet. */
  at: number;
}

/**
 * Caches React Query à invalider pour ces parties (cf. `lib/use-agent-runs.ts`).
 *
 * `reviewComments` rend une clé PRÉFIXE, sans son endpoint : la vue diff sert
 * deux surfaces — la page Pull Requests (`prEndpoint(prId)`) et la vue diff
 * d'une session d'agent (`runPrEndpoint(runId)`) —, qui lisent les MÊMES
 * commentaires sous deux clés différentes. Le préfixe les attrape toutes les
 * deux ; nommer l'une des deux formes en laisserait une périmée.
 *
 * Les doublons sont écartés : deux parties peuvent viser la même clé (une review
 * bouge le fil ET l'en-tête), et invalider deux fois déclencherait deux refetch.
 */
export function prLiveQueryKeys(prId: string, parts: PrLivePart[]): QueryKey[] {
  const keys: QueryKey[] = [];
  const seen = new Set<string>();
  const push = (key: QueryKey) => {
    const hash = JSON.stringify(key);
    if (seen.has(hash)) return;
    seen.add(hash);
    keys.push(key);
  };
  for (const part of parts) {
    switch (part) {
      case "pr":
        push(["pull-request", prId]);
        break;
      case "conversation":
        push(["pr-comments", prId]);
        break;
      case "commits":
        push(["pr-commits", prId]);
        break;
      case "reviewComments":
        push(["pr-review-comments"]);
        break;
    }
  }
  return keys;
}

/** Les parties d'un message reçu, filtrées de ce qui n'en est pas une. */
export function parsePrLiveParts(raw: unknown): PrLivePart[] {
  const known: PrLivePart[] = ["pr", "conversation", "commits", "reviewComments"];
  if (!Array.isArray(raw)) return [];
  return raw.filter((p): p is PrLivePart => known.includes(p as PrLivePart));
}
