"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./auth-context";
import { resolveCyclePrefs } from "./cycle-prefs";
import { browserTimeZone } from "./global-board-api";
import type { CycleInfo } from "./types";

/** Cache key for the current-cycle slice — invalidated by the realtime bridge
    on any `cycles` row change (user topic). */
export const MY_CYCLE_KEY = ["me", "cycle"] as const;

interface MyCycleResponse {
  enabled: boolean;
  current: CycleInfo | null;
  /** The first upcoming window — null when none is created ahead. */
  next: CycleInfo | null;
}

async function fetchMyCycleApi(): Promise<MyCycleResponse> {
  const response = await fetch(`/api/me/cycle?tz=${encodeURIComponent(browserTimeZone())}`);
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const message =
      (data as { error?: string } | null)?.error || text.trim() || "Request failed";
    throw new Error(message);
  }
  return (data ?? { enabled: false, current: null, next: null }) as MyCycleResponse;
}

/**
 * The user's current cycle and the next one (MIN-32) for surfaces outside the
 * global board — today the project boards' and the issue panel's right-click
 * "Add to cycle", whose submenu targets either window (MIN-137). Skips the
 * request entirely while cycles are disabled (the pref lives in auth metadata,
 * so the gate is known client-side).
 */
export function useMyCycleQuery() {
  const { user } = useAuth();
  const enabled = resolveCyclePrefs(user?.user_metadata).enabled;

  const { data } = useQuery({
    queryKey: MY_CYCLE_KEY,
    queryFn: fetchMyCycleApi,
    // The topic `user:` already broadcasts each change from `cycles` to this key
    // (lib/use-my-cycle-query header): the global default of 5 min is enough, the
    // catch-up at 30 s only served to cover an incomplete bridge (MIN-89).
    enabled,
  });

  return {
    cyclesEnabled: enabled && data?.enabled === true,
    currentCycle: data?.current ?? null,
    nextCycle: data?.next ?? null,
  };
}
