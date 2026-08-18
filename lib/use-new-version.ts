"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BUILD_COMMIT,
  readDismissedCommit,
  shouldShowNewVersion,
  writeDismissedCommit,
} from "./new-version";

/**
 * “A new version is available” (MIN-157): loop compares the SHA
 * of the deployment which meets the one fixed in this bundle.
 *
 * It is a `useQuery` and not a `setInterval`, for a specific reason: at
 * TanStack timers are controlled by `focusManager`, which listens to
 * `visibilitychange`, and `refetchIntervalInBackground` is `false` by default.
 * The background tab therefore suspends polling without a line to write.
 *
 * The key is excluded from disk persistence (lib/query-provider.tsx): a SHA
 * server rehydrated from localStorage would turn the banner back on just after
 * the reload which has just updated the app.
 */
export const NEW_VERSION_KEY = ["version"] as const;

/** One minute: absorbs the ~30 s of propagation of the Vercel
 environment after a deployment, for ~30 bytes per active tab. */
const POLL_INTERVAL_MS = 60_000;

export function useNewVersion() {
  const { data } = useQuery({
    queryKey: NEW_VERSION_KEY,
    queryFn: async (): Promise<{ commit: string }> => {
      const response = await fetch("/api/version");
      if (!response.ok) return { commit: "" };
      return (await response.json()) as { commit: string };
    },
    // Without build SHA (local dev, system variables unchecked) there is nothing to
    // compare: we don't even issue the request.
    enabled: BUILD_COMMIT !== "",
    refetchInterval: POLL_INTERVAL_MS,
    // The deposit default is `false`: here we want verification upon return
    // on the tab, and `staleTime: 0` for this refetch to take place — the
    // global staleTime of 5 min would neutralize it.
    refetchOnWindowFocus: true,
    staleTime: 0,
    // A cut network is not a deployment: we will try again at the next tick.
    retry: false,
  });

  // Read after editing only: reading the localStorage when rendered would diverge
  // l'hydratation (cf. CookieBanner).
  const [dismissedCommit, setDismissedCommit] = useState<string | null>(null);
  useEffect(() => {
    setDismissedCommit(readDismissedCommit());
  }, []);

  const serverCommit = data?.commit;

  const dismiss = useCallback(() => {
    if (!serverCommit) return;
    writeDismissedCommit(serverCommit);
    setDismissedCommit(serverCommit);
  }, [serverCommit]);

  // A full reload takes a second or two to repaint, and during that
  // time the page remains EXACTLY in the state where the click left it: without
  // in this state, the button looks dead and we click again. The state does not go down
  // never to `false` — what turns it off is the new document.
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(() => {
    setRefreshing(true);
    window.location.reload();
  }, []);

  return {
    visible: shouldShowNewVersion({
      buildCommit: BUILD_COMMIT,
      serverCommit,
      dismissedCommit,
    }),
    dismiss,
    refresh,
    refreshing,
  };
}
