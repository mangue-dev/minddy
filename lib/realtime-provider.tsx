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
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";
import { useAuth } from "./auth-context";
import { projectIdFromPath } from "./project-id-from-path";
import { projectTopicIds } from "./realtime-topics";
import type { Project } from "./types";

/**
 * Single realtime bridge for the whole app. The DB broadcasts every relevant
 * write (triggers → realtime.broadcast_changes, see the realtime_broadcast
 * migration) on two private topics, and this provider is the only subscriber:
 *
 *   user:{userId}       — notifications, my project list, my invitations
 *   project:{projectId} — content of a project I'm a member of
 *
 * Events only invalidate React Query caches (reads stay on the REST routes);
 * per-key coalescing absorbs write bursts (Numo/MCP) into a single refetch.
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
 */

/** Payload emitted by realtime.broadcast_changes(). */
interface BroadcastChange {
  operation: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: Record<string, unknown> | null;
  old_record: Record<string, unknown> | null;
}

// broadcast_changes names its events after TG_OP; no wildcard, so bind all three.
const BROADCAST_EVENTS = ["INSERT", "UPDATE", "DELETE"] as const;

const INVALIDATE_COALESCE_MS = 200;

// Caches that aggregate several projects. A project event has to reach them too
// or /home, /all, /statistics and the palette stay stale (MIN-89). Kept as
// literals like every other key in this file; the owning modules are named.
const GLOBAL_BOARD_KEY: QueryKey = ["me", "board"]; // lib/use-global-board-query.ts
const HOME_SUMMARY_KEY: QueryKey = ["me", "summary"]; // lib/use-home-summary-query.ts
const SEARCH_INDEX_KEY: QueryKey = ["me", "search-index"]; // lib/use-search-index.ts
// Smart Assign mal réglé : la sidebar en porte la marque sur toutes les pages.
const SMART_ASSIGN_WARNINGS_KEY: QueryKey = ["me", "smart-assign-warnings"]; // lib/use-smart-assign-warnings-query.ts
const STATS_KEY: QueryKey = ["stats"]; // lib/use-stats-query.ts — ["stats", tz]
// Listes GLOBALES de l'agent de code : la barre latérale les lit sur toutes les
// pages, un run de n'importe quel projet les bouge. lib/use-agent-runs.ts.
const ALL_AGENT_SESSIONS_KEY: QueryKey = ["agent-sessions", "all"];
const ALL_PULL_REQUESTS_KEY: QueryKey = ["pull-requests", "all"];

/**
 * Aggregates fed by any issue-shaped change, with the refetch policy each one
 * wants. The palette index is marked stale but NOT refetched: it is a 4 000-row
 * snapshot fetched once per tab on purpose, and it already revalidates itself
 * on open when stale (lib/use-search-index.ts). Refetching it on every write
 * would undo that design. The others are refetched only while mounted —
 * `invalidateQueries` leaves observer-less queries stale without a request.
 */
const ISSUE_AGGREGATE_KEYS: { key: QueryKey; refetch: RefetchMode }[] = [
  { key: GLOBAL_BOARD_KEY, refetch: "active" },
  { key: HOME_SUMMARY_KEY, refetch: "active" },
  { key: STATS_KEY, refetch: "active" },
  { key: SEARCH_INDEX_KEY, refetch: "none" },
];

type RefetchMode = "active" | "none";

/** A cache to invalidate, and whether a mounted observer should refetch it. */
interface Invalidation {
  key: QueryKey;
  refetch: RefetchMode;
}

const active = (key: QueryKey): Invalidation => ({ key, refetch: "active" });

function issueIdOf(change: BroadcastChange): string | null {
  const issueId = (change.record ?? change.old_record)?.issue_id;
  return typeof issueId === "string" ? issueId : null;
}

function objectiveIdOf(change: BroadcastChange): string | null {
  const objectiveId = (change.record ?? change.old_record)?.objective_id;
  return typeof objectiveId === "string" ? objectiveId : null;
}

function feedbackPostIdOf(change: BroadcastChange): string | null {
  const postId = (change.record ?? change.old_record)?.feedback_post_id;
  return typeof postId === "string" ? postId : null;
}

function keysForUserEvent(change: BroadcastChange): Invalidation[] {
  switch (change.table) {
    case "notifications":
      return [active(["notifications"])];
    // Ces deux tables sont exactement ce dont dépend l'avertissement Smart
    // Assign (réglage du projet, liste des membres) : la marque de la sidebar
    // et la bannière de l'accueil s'effacent donc dès que les règles sont
    // enregistrées, sans attendre une navigation.
    case "projects":
      return [active(["projects"]), active(SMART_ASSIGN_WARNINGS_KEY)];
    // Mon adhésion à moi a changé (rejoint / retiré) : ce n'est pas seulement
    // une ligne de plus ou de moins dans la barre latérale, c'est le PÉRIMÈTRE
    // de tous mes agrégats — le board cross-projet, le tableau de bord et
    // l'index de la palette portent encore les tickets d'un projet auquel je
    // n'ai plus accès (ou pas encore les siens).
    case "project_members":
      return [
        active(["projects"]),
        active(SMART_ASSIGN_WARNINGS_KEY),
        active(GLOBAL_BOARD_KEY),
        active(HOME_SUMMARY_KEY),
        { key: SEARCH_INDEX_KEY, refetch: "none" },
      ];
    case "project_invitations":
      return [active(["my-invitations"]), active(["projects"])];
    case "views": // global (project-less) views broadcast on the user topic
      return [active(["views", "global"])];
    case "cycles": // my cycle timeline moved (fill, capture, rollover — MIN-32)
      return [
        active(GLOBAL_BOARD_KEY),
        active(HOME_SUMMARY_KEY),
        active(["me", "cycle"]),
      ];
    case "user_scratchpad": // agent (MCP) or another tab edited my notes
      return [active(["me", "scratchpad"])];
    case "ai_usage": // une action IA vient d'être comptée → jauge du header (MIN-72)
      return [active(["billing", "usage"])];
    case "billing_accounts": // sync Stripe / override admin → plan effectif
      return [active(["billing", "status"]), active(["billing", "usage"])];
    default:
      return [];
  }
}

function keysForProjectEvent(
  change: BroadcastChange,
  projectId: string
): Invalidation[] {
  switch (change.table) {
    // Issue-shaped changes also move every cross-project aggregate: the
    // dashboard counters, the /all board, the statistics page and the palette
    // index all derive from issues (MIN-89). Plan progress on the cards and in
    // the side panel rides the same ["issues", projectId] cache.
    case "issues":
    case "issue_categories": // issues are cached hydrated with category_ids
      return [active(["issues", projectId]), ...ISSUE_AGGREGATE_KEYS];
    case "issue_relations":
      return [active(["issue-relations", projectId]), active(GLOBAL_BOARD_KEY)];
    case "objectives":
      return [
        active(["objectives", projectId]),
        { key: SEARCH_INDEX_KEY, refetch: "none" },
      ];
    case "categories": // renames/deletes also affect chips on cached issues
      return [
        active(["categories", projectId]),
        active(["issues", projectId]),
        { key: SEARCH_INDEX_KEY, refetch: "none" },
      ];
    case "views":
      return [active(["views", projectId])];
    // Une adhésion qui change ne bouge pas que l'onglet Membres : la liste des
    // membres est RECOPIÉE dans deux caches agrégés — la carte `members` du
    // board cross-projet (filtre et sélecteur d'assigné, panneau d'un ticket,
    // personnes mentionnables de Numo — lib/use-numo-mentionables.ts) et l'index
    // de la palette. Sans les invalider ici, quelqu'un qui vient d'être retiré
    // restait proposé partout ailleurs jusqu'au prochain montage périmé, cinq
    // minutes plus tard — et un rechargement n'y changeait rien, le cache étant
    // réhydraté depuis le disque (lib/query-provider.tsx).
    case "project_members":
      return [
        active(["members", projectId]),
        active(GLOBAL_BOARD_KEY),
        { key: SEARCH_INDEX_KEY, refetch: "none" },
        // L'équipe change de taille → l'avertissement Smart Assign aussi.
        active(SMART_ASSIGN_WARNINGS_KEY),
      ];
    // Une invitation en attente n'est encore membre de rien : seule la vue
    // Membres, qui liste les deux, la montre.
    case "project_invitations":
      return [active(["members", projectId])];
    // Feedback (MIN-89): the team board, the open-feedback badge in the sidebar
    // and the home section all move when a post is created, voted or triaged.
    // The dashboard summary is in that list since MIN-104 — the home "to triage"
    // section reads its undecided posts from ["me","summary"], which until then
    // only moved on issue and cycle events.
    case "feedback_posts":
    case "feedback_votes":
    case "feedback_post_categories":
      return [
        active(["feedback", projectId]),
        active(["feedback-detail", projectId]),
        active(["feedback-count", projectId]),
        active(HOME_SUMMARY_KEY),
      ];
    case "comments": {
      // A comment hangs off an issue OR an objective OR a feedback post — route
      // to the right cache. Feedback comment keys carry the project id.
      const issueId = issueIdOf(change);
      if (issueId) return [active(["comments", issueId])];
      const objectiveId = objectiveIdOf(change);
      if (objectiveId) return [active(["objective-comments", objectiveId])];
      const postId = feedbackPostIdOf(change);
      return postId ? [active(["feedback-comments", projectId, postId])] : [];
    }
    case "attachments": {
      // Comment attachments ride the comments cache; entity-level ones have
      // their own query.
      const issueId = issueIdOf(change);
      if (issueId) {
        return [
          active(["comments", issueId]),
          active(["issue-attachments", issueId]),
        ];
      }
      const objectiveId = objectiveIdOf(change);
      if (objectiveId) {
        return [
          active(["objective-comments", objectiveId]),
          active(["objective-attachments", objectiveId]),
        ];
      }
      const postId = feedbackPostIdOf(change);
      return postId ? [active(["feedback-comments", projectId, postId])] : [];
    }
    // Runs de l'agent de code : le spinner « Numo travaille » de la barre
    // latérale, la liste de la page Agents et le compteur de PR. Ces caches ne
    // POLLENT que si une session travaille DÉJÀ — sans cet événement, un run
    // lancé hors du composer (assistant Numo, @numo, coéquipier, autre onglet)
    // n'apparaissait qu'au rechargement de la page. Le trigger ne diffuse que
    // les transitions visibles (voir 20260907090000_agent_runs_broadcast).
    case "agent_runs": {
      const issueId = issueIdOf(change);
      return [
        active(ALL_AGENT_SESSIONS_KEY),
        active(ALL_PULL_REQUESTS_KEY),
        ...(issueId ? [active(["agent-runs", "issue", issueId])] : []),
      ];
    }
    case "issue_events": {
      const issueId = issueIdOf(change);
      if (issueId) return [active(["events", issueId])];
      const objectiveId = objectiveIdOf(change);
      if (objectiveId) return [active(["objective-events", objectiveId])];
      const postId = feedbackPostIdOf(change);
      return postId ? [active(["feedback-events", projectId, postId])] : [];
    }
    default:
      return [];
  }
}

// Everything a scope can feed, for the catch-up refetch after a dropped
// connection (events missed while offline). Prefix keys: ["comments"] matches
// every ["comments", issueId] query.
const USER_SCOPE_KEYS: QueryKey[] = [
  ["notifications"],
  ["projects"],
  ["my-invitations"],
  ["views", "global"],
  ["me", "board"],
  ["me", "cycle"],
  ["me", "scratchpad"],
  ["billing"],
];
const projectScopeKeys = (projectId: string): QueryKey[] => [
  ["issues", projectId],
  ["issue-relations", projectId],
  ["objectives", projectId],
  ["categories", projectId],
  ["views", projectId],
  ["members", projectId],
  ["comments"],
  ["events"],
  ["issue-attachments"],
  ["objective-comments"],
  ["objective-events"],
  ["objective-attachments"],
  ["feedback", projectId],
  ["feedback-detail", projectId],
  ["feedback-count", projectId],
  ["feedback-comments", projectId],
  ["feedback-events", projectId],
  ["agent-runs"],
  // The aggregates this project feeds — missed events while offline would
  // otherwise leave the dashboard and /all stale until their staleTime.
  GLOBAL_BOARD_KEY,
  HOME_SUMMARY_KEY,
  STATS_KEY,
  ALL_AGENT_SESSIONS_KEY,
  ALL_PULL_REQUESTS_KEY,
];

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
      if (event.query.queryKey[0] === "projects") read();
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

  const openScope = useCallback(
    (
      topic: string,
      keysFor: (change: BroadcastChange) => Invalidation[],
      scopeKeys: QueryKey[]
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
            for (const invalidation of keysFor(payload as BroadcastChange)) {
              invalidateCoalesced(invalidation);
            }
          });
        }
        channel.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            if (dropped) {
              dropped = false;
              for (const key of scopeKeys) {
                void queryClient.invalidateQueries({ queryKey: key });
              }
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
    [queryClient, invalidateCoalesced]
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
          projectScopeKeys(id)
        )
      );
    }
  }, [userId, topicIds, openScope]);

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
