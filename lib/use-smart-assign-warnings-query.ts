"use client";

import { useQuery } from "@tanstack/react-query";
import type { SmartAssignWarningsResponse } from "./types";

/**
 * Mes projets où Smart Assign tourne sans être réglé (MIN-31).
 *
 * Montée par la sidebar, donc sur TOUTES les pages : d'où une route à part,
 * volontairement minuscule (GET /api/me/smart-assign-warnings), plutôt qu'un
 * champ du résumé du tableau de bord — celui-là réconcilie les cycles et compte
 * les tickets, on ne le paie pas à chaque navigation pour une pastille.
 *
 * Fraîcheur : le pont temps réel invalide cette clé sur tout événement de projet
 * ou de membre (lib/realtime-provider.tsx), c'est-à-dire exactement ce qui peut
 * la changer — activer Smart Assign, écrire une règle, ajouter quelqu'un.
 */
export const SMART_ASSIGN_WARNINGS_KEY = ["me", "smart-assign-warnings"] as const;

export function useSmartAssignWarningsQuery() {
  const { data } = useQuery({
    queryKey: SMART_ASSIGN_WARNINGS_KEY,
    queryFn: async (): Promise<SmartAssignWarningsResponse> => {
      const response = await fetch("/api/me/smart-assign-warnings");
      if (!response.ok) return { warnings: [] };
      return (await response.json()) as SmartAssignWarningsResponse;
    },
  });

  return { warnings: data?.warnings ?? [] };
}
