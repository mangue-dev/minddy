"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import {
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";
import { useAuth } from "./auth-context";
import { projectIdFromPath } from "./project-id-from-path";
import { projectTopicIds } from "./realtime-topics";
import { adoptRemoteRow, remoteEchoOf } from "./optimistic/remote-echo";
import {
  isOwnEcho,
  keysForProjectEvent,
  keysForUserEvent,
  projectScopeKeys,
  USER_SCOPE_KEYS,
  type BroadcastChange,
  type Invalidation,
} from "./realtime-keys";
import { shouldCatchUpOnResume, wakeRealtime } from "./realtime-resume";
import { createCatchUpQueue, type CatchUpQueue } from "./realtime-catch-up";
import { trace } from "./desktop/trace";
import type { Project } from "./types";

/**
 * Single realtime bridge for the whole app. The DB broadcasts every relevant
 * write (triggers → realtime.broadcast_changes, see the realtime_broadcast
 * migration) on two private topics, and this provider is the only subscriber:
 *
 * user:{userId} — notifications, my project list, my invitations
 * project:{projectId} — content of a project I'm a member of
 *
 * An event does TWO things, in that order. The broadcast line is written
 * to the ticket caches right away (lib/optimistic/remote-issue-echo.ts)
 * — the payload carries the entire line, there is nothing to ask the server
 * to display it; then the caches are invalidated, which reconciles behind
 * what the line doesn't say. Without the first time, a ticket created by Numo
 * only appeared when the refetch returned, i.e. several seconds on `/all`
 * (`/api/me/board` is an aggregate route). Grouping by key absorbs
 * bursts of writes (Numo/MCP) in a single refresh. postgres_changes
 * bridges silently died).
 *
 * Project topics are opened for ALL my projects, not just the one in the URL
 * (MIN-89). The cross-project surfaces — the dashboard, /all, /inbox, the
 * palette index, the project cards' counters — read caches that no single
 * project topic feeds, so scoping the subscription to the URL left every one of
 * them frozen until its staleTime expired. The set is bounded (see
 * MAX_PROJECT_CHANNELS) and reconciled, never torn down wholesale.
 *
 * The bridge also carries the RESUME after absence (hidden tab, standby): see
 * the effect of resumption at the bottom of the file and lib/realtime-resume.ts. A dead socket
 * takes tens of seconds to learn; catching up with caches,
 * he leaves immediately.
 *
 * WHAT IS NO LONGER HERE: the switching table “which event refreshes
 * what” lives in lib/realtime-keys.ts, pure and tested (MIN-346). This file does not
 * only keeps the lifecycle of the channels — which vites cannot mount.
 */

// broadcast_changes names its events after TG_OP; no wildcard, so bind all three.
const BROADCAST_EVENTS = ["INSERT", "UPDATE", "DELETE"] as const;

const INVALIDATE_COALESCE_MS = 200;

/**
 * What a project event writes to the caches BEFORE any invalidation.
 *
 * A broadcast carries the line: write it right away, it's the only way
 * that a ticket created by Numo (or by the MCP, or by a teammate) will appear
 * *right now* rather than when the refetch returns — and for `/all` this refetch is
 * `/api/me/board`, several seconds. The following invalidation remains: it
 * reconciles what the line does not say (related categories, attachments, derived views
 * calculated in SQL). See lib/optimistic/remote-echo.ts.
 */
function applyProjectEvent(
  queryClient: QueryClient,
  change: BroadcastChange,
  projectId: string
): void {
  if (isOwnEcho(change)) return;
  adoptRemoteRow(queryClient, projectId, remoteEchoOf(change));
}

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  // Stable primitive — the session/user objects change identity on every token
  // refresh and would tear the channels down for nothing.
  const userId = user?.id ?? null;
  const pathname = usePathname();
  const activeProjectId = projectIdFromPath(pathname ?? "");
  const queryClient = useQueryClient();

  // The project list drives which topics to join. ProjectsProvider owns that
  // fetch and sits BELOW this provider, so its context isn't reachable here —
  // and mounting a second `useQuery` on ["projects"] would register an observer
  // whose options (queryFn included) fight the real one for the shared query.
  // So: read the cache and subscribe to it, without ever becoming an observer.
  const [projects, setProjects] = useState<Project[] | undefined>(undefined);
  useEffect(() => {
    const read = () => setProjects(queryClient.getQueryData<Project[]>(["projects"]));
    read();
    return queryClient.getQueryCache().subscribe((event) => {
      // The EXACT key, not its prefix. It's `["projects"]` that we reread, and a
      // second key starting with “projects” (react-query sets one at the
      // MOUNTING its observer, therefore while rendering another component)
      // then raised a `setState` here — React refuses it out loud:
      // « Cannot update a component while rendering a different component ».
      const key = event.query.queryKey;
      if (key.length === 1 && key[0] === "projects") read();
    });
  }, [queryClient]);

  // Identity-stable while the ids don't change, so the reconciliation effect
  // below doesn't re-run on every refetch of the project list.
  const topicKey = projectTopicIds(projects, activeProjectId).join(",");
  const topicIds = useMemo(
    () => (topicKey ? topicKey.split(",") : []),
    [topicKey]
  );

  // Trailing per-key coalescing: the first event schedules the invalidation,
  // followers within the window ride along.
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const t of map.values()) clearTimeout(t);
      map.clear();
    };
  }, []);
  const invalidateCoalesced = useCallback(
    ({ key, refetch }: Invalidation) => {
      // The mode is part of the coalescing identity: a "none" event must never
      // swallow a pending "active" one for the same key.
      const k = `${refetch}:${JSON.stringify(key)}`;
      if (timers.current.has(k)) return;
      timers.current.set(
        k,
        setTimeout(() => {
          timers.current.delete(k);
          void queryClient.invalidateQueries({
            queryKey: key,
            refetchType: refetch,
          });
        }, INVALIDATE_COALESCE_MS)
      );
    },
    [queryClient]
  );

  /**
 * Catch-up: everything that is mounted in these perimeters returns to the server.
 *
 * Only one search of the cache, not one per key: the details of why are in
 * lib/realtime-catch-up.ts. The coverage is identical to the loop it
 * replaces—same prefixes, including inactive queries—what changes is
 * the number of scans (MIN-300), and the fact that the volley of rejoins that
 * follows a cut only triggers one for everyone (MIN-305).
 */
  const catchUpQueue = useRef<CatchUpQueue | null>(null);
  if (catchUpQueue.current === null) {
    catchUpQueue.current = createCatchUpQueue((matches) => {
      void queryClient.invalidateQueries({
        predicate: (query) => matches(query.queryKey),
      });
    });
  }
  useEffect(() => {
    const queue = catchUpQueue.current;
    return () => queue?.cancel();
  }, []);
  const catchUp = useCallback(
    (keys: QueryKey[]) => {
      // Trace call point (MIN-307): a `catchUp` line followed by a
      // `longtask` is THE signature of the invalidation wave, and `cache` says
      // how many queries have been searched. No-op trace off.
      trace("catchUp", {
        keys: keys.length,
        cache: queryClient.getQueryCache().getAll().length,
      });
      catchUpQueue.current?.push(keys);
    },
    [queryClient]
  );

  const openScope = useCallback(
    (
      topic: string,
      keysFor: (change: BroadcastChange) => Invalidation[],
      scopeKeys: QueryKey[],
      /** Immediate write to caches, played before invalidation. */
      apply?: (change: BroadcastChange) => void
    ) => {
      const supabase = getSupabase();
      let cancelled = false;
      let channel: RealtimeChannel | null = null;
      let dropped = false;

      // Deterministically push the session token to the socket before joining:
      // supabase-js only re-sends it on SIGNED_IN/TOKEN_REFRESHED, never on
      // INITIAL_SESSION, and a join carrying the anon token is refused on
      // private channels.
      void supabase.realtime.setAuth().then(() => {
        if (cancelled) return;
        channel = supabase.channel(topic, { config: { private: true } });
        for (const event of BROADCAST_EVENTS) {
          channel.on("broadcast", { event }, ({ payload }) => {
            const change = payload as BroadcastChange;
            // The line first (it's in the payload, that's what
            // the user sees), the refresh then.
            apply?.(change);
            for (const invalidation of keysFor(change)) {
              invalidateCoalesced(invalidation);
            }
          });
        }
        channel.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            if (dropped) {
              dropped = false;
              catchUp(scopeKeys);
            }
          } else if (
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT" ||
            status === "CLOSED"
          ) {
            dropped = true;
          }
        });
      });

      return () => {
        cancelled = true;
        if (channel) void getSupabase().removeChannel(channel);
      };
    },
    [catchUp, invalidateCoalesced]
  );

  useEffect(() => {
    if (!userId) return;
    return openScope(`user:${userId}`, keysForUserEvent, USER_SCOPE_KEYS);
  }, [userId, openScope]);

  // One channel per project, reconciled in place: joining a new project or
  // leaving one only opens/closes that channel, so navigating between projects
  // never re-joins the topics that were already live (and never drops the
  // events that arrive during a re-join).
  const projectChannels = useRef(new Map<string, () => void>());

  useEffect(() => {
    const channels = projectChannels.current;
    const wanted = userId ? new Set(topicIds) : new Set<string>();

    for (const [id, close] of channels) {
      if (wanted.has(id)) continue;
      close();
      channels.delete(id);
    }
    for (const id of wanted) {
      if (channels.has(id)) continue;
      channels.set(
        id,
        openScope(
          `project:${id}`,
          (change) => keysForProjectEvent(change, id),
          projectScopeKeys(id),
          (change) => applyProjectEvent(queryClient, change, id)
        )
      );
    }
  }, [userId, topicIds, openScope, queryClient]);

  /**
 * Resume after an absence — the tab returns to the foreground, the machine
 * wakes up.
 *
 * This is the only path that brings the page up to date in this case: the refetch at
 * focus is disabled, and the `online` event that `refetchOnReconnect`
 * is watching for does not start from a day before. There remained the socket, which is precisely what has just
 * died and which takes tens of seconds to notice - the details
 * are in lib/realtime-resume.ts. We therefore catch the caches WITHOUT waiting for it
 * (this is what the user sees), and we wake it up in parallel.
 */
  useEffect(() => {
    if (!userId) return;
    let hiddenSince: number | null =
      document.visibilityState === "hidden" ? Date.now() : null;
    let probe: ReturnType<typeof setTimeout> | null = null;

    const resume = (hiddenForMs: number) => {
      if (!shouldCatchUpOnResume({ hiddenForMs })) return;
      const realtime = getSupabase().realtime;
      catchUp([...USER_SCOPE_KEYS, ...topicIds.flatMap(projectScopeKeys)]);
      if (probe) clearTimeout(probe);
      probe = wakeRealtime(realtime);
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenSince = Date.now();
        return;
      }
      const hiddenForMs = hiddenSince === null ? 0 : Date.now() - hiddenSince;
      hiddenSince = null;
      resume(hiddenForMs);
    };

    // Return via the browser round-trip cache (Safari especially): the page
    // reappears as is, dead sockets included, without necessarily ironing
    // by `visibilitychange`. A bfcache return is by nature an absence.
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) resume(Number.POSITIVE_INFINITY);
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
      if (probe) clearTimeout(probe);
    };
  }, [userId, topicIds, catchUp]);

  // Close everything on unmount (sign-out unmounts the whole app shell).
  useEffect(() => {
    const channels = projectChannels.current;
    return () => {
      for (const close of channels.values()) close();
      channels.clear();
    };
  }, []);

  return <>{children}</>;
}
