"use client";

import { useQuery } from "@tanstack/react-query";
import type { ProjectTriageCount, TriageCountsResponse } from "./types";

/**
 * Ce qui attend d'être trié dans chacun de mes projets (tickets en triage +
 * retours ouverts), pour les chiffres portés par les lignes de projet de la
 * sidebar quand on est HORS d'un projet — accueil, board global, inbox…
 *
 * Une route à part et minuscule (GET /api/me/triage-counts) plutôt qu'un champ
 * de /api/me/summary, pour la même raison que l'avertissement Smart Assign : la
 * sidebar est montée sur toutes les pages, le résumé du tableau de bord ne doit
 * pas l'être. Cf. lib/use-smart-assign-warnings-query.ts.
 *
 * Fraîcheur : le pont temps réel invalide cette clé sur tout événement de
 * ticket, de retour et d'adhésion (lib/realtime-provider.tsx) — c'est-à-dire
 * tout ce qui peut la bouger, périmètre compris. Pas de staleTime, donc.
 */
export const TRIAGE_COUNTS_KEY = ["me", "triage-counts"] as const;

/** Identité stable : sans elle, chaque rendu rendrait une table neuve et
    relancerait les mémos de la sidebar qui en dépendent. */
const NO_COUNTS: Record<string, ProjectTriageCount> = {};

export function useTriageCountsQuery() {
  const { data } = useQuery({
    queryKey: TRIAGE_COUNTS_KEY,
    queryFn: async (): Promise<TriageCountsResponse> => {
      const response = await fetch("/api/me/triage-counts");
      if (!response.ok) return { counts: {} };
      return (await response.json()) as TriageCountsResponse;
    },
  });

  return { counts: data?.counts ?? NO_COUNTS };
}

/** Le chiffre affiché : les deux moitiés de la file ne font qu'un badge. */
export function triageCountTotal(count: ProjectTriageCount | undefined): number {
  return count ? count.triage + count.feedback : 0;
}
