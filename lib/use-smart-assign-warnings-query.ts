"use client";

import { useQuery } from "@tanstack/react-query";
import type { SmartAssignWarningsResponse } from "./types";

/**
 * My projects where Smart Assign runs without being set (MIN-31).
 *
 * Mounted by the sidebar, therefore on ALL pages: hence a separate route,
 * deliberately lowercase (GET /api/me/smart-assign-warnings), rather than a
 * dashboard summary field — this one reconciles the cycles and counts
 * tickets, we don't pay for each navigation for a tablet.
 *
 * Freshness: the real-time bridge invalidates this key on any project
 * or member event (lib/realtime-provider.tsx), i.e. exactly what can
 * change it — enable Smart Assign, write a rule, add someone.
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
