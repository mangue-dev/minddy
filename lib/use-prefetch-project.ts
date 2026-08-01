"use client";

import { useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { issuesQueryFn } from "./issues-api";
import { fetchCategoriesApi } from "./categories-api";
import { fetchMembersApi } from "./members-api";
import { objectivesQueryFn } from "./objectives-api";
import { fetchIssueRelationsApi } from "./issue-relations-api";

/**
 * Préchauffe les caches d'un board projet à l'intention de navigation (MIN-89).
 *
 * Ouvrir un projet enchaînait : chargement du chunk de la route, montage, PUIS
 * cinq requêtes en éventail. Les déclencher au survol (ou au focus clavier)
 * recouvre ce délai avec le temps que met l'utilisateur à cliquer — à l'arrivée,
 * le board est le plus souvent déjà peuplé.
 *
 * `prefetchQuery` respecte le `staleTime` : un cache frais n'entraîne AUCUNE
 * requête, donc survoler dix cartes d'affilée ne déclenche pas dix salves.
 * Un garde-fou par projet évite en plus de reposer la question à chaque
 * entrée/sortie du curseur sur la même carte.
 */
export function usePrefetchProject() {
  const queryClient = useQueryClient();
  // Un survol = une tentative, quel que soit le nombre d'aller-retours du
  // curseur sur la carte (les `mouseenter` se rallument à chaque enfant survolé).
  const attempted = useRef(new Set<string>());

  return useCallback(
    (projectId: string) => {
      if (!projectId || attempted.current.has(projectId)) return;
      attempted.current.add(projectId);

      // Les cinq lectures que monte app/(app)/projects/[id]/page.tsx. Les vues
      // et intégrations sont laissées de côté : elles sont légères et ne
      // bloquent pas le premier rendu du board.
      void queryClient.prefetchQuery({
        queryKey: ["issues", projectId],
        queryFn: issuesQueryFn(projectId),
      });
      void queryClient.prefetchQuery({
        queryKey: ["categories", projectId],
        queryFn: () => fetchCategoriesApi(projectId),
      });
      void queryClient.prefetchQuery({
        queryKey: ["members", projectId],
        queryFn: () => fetchMembersApi(projectId),
      });
      void queryClient.prefetchQuery({
        queryKey: ["objectives", projectId],
        queryFn: objectivesQueryFn(projectId),
      });
      void queryClient.prefetchQuery({
        queryKey: ["issue-relations", projectId],
        queryFn: () => fetchIssueRelationsApi(projectId),
      });
    },
    [queryClient]
  );
}
