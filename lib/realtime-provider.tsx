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
 *   user:{userId}       — notifications, my project list, my invitations
 *   project:{projectId} — content of a project I'm a member of
 *
 * Un événement fait DEUX choses, dans cet ordre. La ligne diffusée est écrite
 * dans les caches de tickets tout de suite (lib/optimistic/remote-issue-echo.ts)
 * — la charge utile porte la ligne entière, il n'y a rien à demander au serveur
 * pour l'afficher ; puis les caches sont invalidés, ce qui réconcilie derrière
 * ce que la ligne ne dit pas. Sans le premier temps, un ticket créé par Numo
 * n'apparaissait qu'au retour du refetch, soit plusieurs secondes sur `/all`
 * (`/api/me/board` est une route agrégée). Le regroupement par clé absorbe les
 * rafales d'écritures (Numo/MCP) en un seul rafraîchissement.
 *
 * Subscriptions are gated on the restored session: joining with the anon token
 * would be refused on private channels (and was how the old postgres_changes
 * bridges silently died).
 *
 * Project topics are opened for ALL my projects, not just the one in the URL
 * (MIN-89). The cross-project surfaces — the dashboard, /all, /inbox, the
 * palette index, the project cards' counters — read caches that no single
 * project topic feeds, so scoping the subscription to the URL left every one of
 * them frozen until its staleTime expired. The set is bounded (see
 * MAX_PROJECT_CHANNELS) and reconciled, never torn down wholesale.
 *
 * Le pont porte aussi la REPRISE après absence (onglet caché, veille) : voir
 * l'effet de reprise en bas de fichier et lib/realtime-resume.ts. Une socket
 * morte met des dizaines de secondes à l'apprendre ; le rattrapage des caches,
 * lui, part tout de suite.
 *
 * CE QUI N'EST PLUS ICI : la table d'aiguillage « quel événement rafraîchit
 * quoi » vit dans lib/realtime-keys.ts, pure et testée (MIN-346). Ce fichier ne
 * garde que le cycle de vie des canaux — ce que vitest ne peut pas monter.
 */

// broadcast_changes names its events after TG_OP; no wildcard, so bind all three.
const BROADCAST_EVENTS = ["INSERT", "UPDATE", "DELETE"] as const;

const INVALIDATE_COALESCE_MS = 200;

/**
 * Ce qu'un événement de projet écrit dans les caches AVANT toute invalidation.
 *
 * Une diffusion porte la ligne : l'écrire tout de suite, c'est la seule façon
 * qu'un ticket créé par Numo (ou par le MCP, ou par un coéquipier) apparaisse
 * *à l'instant* plutôt qu'au retour du refetch — et pour `/all` ce refetch est
 * `/api/me/board`, plusieurs secondes. L'invalidation qui suit reste : elle
 * réconcilie ce que la ligne ne dit pas (catégories liées, pièces jointes, vues
 * dérivées calculées en SQL). Voir lib/optimistic/remote-echo.ts.
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
      // La clé EXACTE, pas son préfixe. C'est `["projects"]` qu'on relit, et une
      // seconde clé commençant par « projects » (react-query en pose une au
      // MONTAGE de son observateur, donc pendant le rendu d'un autre composant)
      // faisait alors remonter un `setState` ici — React le refuse à voix haute :
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
   * Rattrapage : tout ce qui est monté dans ces périmètres repart au serveur.
   *
   * Un seul parcours du cache, pas un par clé : le détail du pourquoi est dans
   * lib/realtime-catch-up.ts. La couverture est identique à la boucle qu'il
   * remplace — mêmes préfixes, requêtes inactives comprises —, ce qui change est
   * le nombre de balayages (MIN-300), et le fait que la volée de rejoins qui
   * suit une coupure n'en déclenche qu'un pour tout le monde (MIN-305).
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
      // Point d'appel de la trace (MIN-307) : une ligne `catchUp` suivie d'un
      // `longtask` est LA signature de la vague d'invalidation, et `cache` dit
      // combien de requêtes ont été parcourues. No-op trace éteinte.
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
      /** Écriture immédiate dans les caches, jouée avant l'invalidation. */
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
            // La ligne d'abord (elle est dans la charge utile, c'est ce que
            // l'utilisateur voit), le rafraîchissement ensuite.
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
   * Reprise après une absence — l'onglet revient au premier plan, la machine
   * sort de veille.
   *
   * C'est le seul chemin qui remet la page à jour dans ce cas : le refetch au
   * focus est désactivé, et l'événement `online` que guette `refetchOnReconnect`
   * ne part pas d'une veille. Restait la socket, qui est justement ce qui vient
   * de mourir et qui met des dizaines de secondes à s'en apercevoir — le détail
   * est dans lib/realtime-resume.ts. On rattrape donc les caches SANS l'attendre
   * (c'est ce que l'utilisateur voit), et on la réveille en parallèle.
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

    // Retour par le cache aller-retour du navigateur (Safari surtout) : la page
    // reparaît telle quelle, sockets mortes comprises, sans forcément repasser
    // par `visibilitychange`. Un retour de bfcache est par nature une absence.
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
