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
import {
  GLOBAL_BOARD_KEY,
  issueWrites,
  objectiveWrites,
} from "./optimistic/issue-writes";
import { shouldCatchUpOnResume, wakeRealtime } from "./realtime-resume";
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
 *
 * Le pont porte aussi la REPRISE après absence (onglet caché, veille) : voir
 * l'effet de reprise en bas de fichier et lib/realtime-resume.ts. Une socket
 * morte met des dizaines de secondes à l'apprendre ; le rattrapage des caches,
 * lui, part tout de suite.
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
// (GLOBAL_BOARD_KEY vient de lib/optimistic/issue-writes.ts — c'est le module
// qui sait aussi si l'événement est l'écho de notre propre écriture.)
const HOME_SUMMARY_KEY: QueryKey = ["me", "summary"]; // lib/use-home-summary-query.ts
const SEARCH_INDEX_KEY: QueryKey = ["me", "search-index"]; // lib/use-search-index.ts
// Smart Assign mal réglé : la sidebar en porte la marque sur toutes les pages.
const SMART_ASSIGN_WARNINGS_KEY: QueryKey = ["me", "smart-assign-warnings"]; // lib/use-smart-assign-warnings-query.ts
// Ce qui attend d'être trié par projet : le chiffre des lignes de projet de la
// sidebar, lu lui aussi sur toutes les pages. lib/use-triage-counts-query.ts.
const TRIAGE_COUNTS_KEY: QueryKey = ["me", "triage-counts"];
const STATS_KEY: QueryKey = ["stats"]; // lib/use-stats-query.ts — ["stats", tz]
// Listes GLOBALES de l'agent de code : la barre latérale les lit sur toutes les
// pages, un run de n'importe quel projet les bouge. lib/use-agent-runs.ts.
const ALL_AGENT_SESSIONS_KEY: QueryKey = ["agent-sessions", "all"];
const ALL_PULL_REQUESTS_KEY: QueryKey = ["pull-requests", "all"];

/**
 * Vues DÉRIVÉES d'un ticket : leur appartenance aux listes est calculée en SQL,
 * donc rien ne les patche localement — elles doivent être rafraîchies même sur
 * l'écho de notre propre écriture (MIN-156). Le palier de la palette est marqué
 * périmé mais PAS rafraîchi : c'est un instantané de 4 000 lignes chargé une
 * fois par onglet, qui se revalide déjà à l'ouverture quand il est périmé
 * (lib/use-search-index.ts). Les autres ne repartent au serveur que si elles
 * sont montées — `invalidateQueries` laisse périmées les requêtes sans
 * observateur, sans requête.
 */
const ISSUE_DERIVED_KEYS: { key: QueryKey; refetch: RefetchMode }[] = [
  { key: HOME_SUMMARY_KEY, refetch: "active" },
  { key: STATS_KEY, refetch: "active" },
  { key: TRIAGE_COUNTS_KEY, refetch: "active" },
  { key: SEARCH_INDEX_KEY, refetch: "none" },
];

/** Tout ce qu'un changement de ticket bouge, board agrégé compris. */
const ISSUE_AGGREGATE_KEYS: { key: QueryKey; refetch: RefetchMode }[] = [
  { key: GLOBAL_BOARD_KEY, refetch: "active" },
  ...ISSUE_DERIVED_KEYS,
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
        active(TRIAGE_COUNTS_KEY),
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
      // L'écho de NOTRE propre écriture (MIN-156) : les deux caches de tickets
      // portent déjà la ligne serveur, fusionnée au retour du PATCH. Les
      // rafraîchir ne pourrait rien apprendre — mais ouvrirait la fenêtre de
      // course qu'on vient de fermer. Les événements des autres clients (Numo,
      // MCP, coéquipiers) ne matchent aucune écriture locale et passent donc
      // inchangés, comme les vues dérivées qu'on ne patche pas.
      return issueWrites.wasJustWritten(
        // La ligne du TICKET : c'est `id` sur `issues`, `issue_id` sur la table
        // de liaison des catégories.
        change.table === "issues"
          ? (change.record ?? change.old_record)?.id
          : issueIdOf(change),
        change.record
      )
        ? ISSUE_DERIVED_KEYS
        : [active(["issues", projectId]), ...ISSUE_AGGREGATE_KEYS];
    case "issue_relations":
      return [active(["issue-relations", projectId]), active(GLOBAL_BOARD_KEY)];
    // Un objectif est recopié dans DEUX caches : celui de son projet et la
    // tranche `objectives` du board cross-projet (puces des cartes, facette
    // « Objectif », sélecteur du panneau d'un ticket). L'écho de notre propre
    // écriture n'a rien à leur apprendre — les deux portent déjà la ligne
    // serveur (MIN-156) ; celui d'un autre client (coéquipier, Numo, MCP), ou
    // d'une création / suppression, doit atteindre les deux, sans quoi `/all`
    // gardait un objectif renommé sous son ancien nom.
    case "objectives":
      return objectiveWrites.wasJustWritten(
        (change.record ?? change.old_record)?.id,
        change.record
      )
        ? [{ key: SEARCH_INDEX_KEY, refetch: "none" }]
        : [
            active(["objectives", projectId]),
            active(GLOBAL_BOARD_KEY),
            { key: SEARCH_INDEX_KEY, refetch: "none" },
          ];
    case "categories": // renames/deletes also affect chips on cached issues
      return [
        active(["categories", projectId]),
        active(["issues", projectId]),
        // Une catégorie est recopiée dans le board cross-projet, comme un
        // objectif : sans ça, celle qu'un coéquipier (ou Numo, ou l'ajout
        // rapide d'un autre onglet) vient de créer n'existait pas sur `/all`.
        active(GLOBAL_BOARD_KEY),
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
        // Le chiffre des lignes de projet de la sidebar compte les retours
        // ouverts avec les tickets en triage : un retour publié, promu ou
        // fusionné le bouge, exactement comme le badge de l'onglet Feedback.
        active(TRIAGE_COUNTS_KEY),
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
    // Chaînes d'automatisation (MIN-147). C'est la seule surface du produit où
    // la péremption est CERTAINE : une chaîne avance toute seule pendant
    // plusieurs minutes, sans que personne ne touche à rien — sans cet
    // événement, sa barre d'état est fausse dès la seconde qui suit son
    // ouverture. Le trigger ne diffuse que les transitions visibles (statut,
    // étape, dépense, motif d'arrêt — voir la migration).
    case "agent_chains": {
      const issueId = issueIdOf(change);
      return issueId
        ? [active(["agent-chain", "issue", issueId]), active(["agent-runs", "issue", issueId])]
        : [];
    }
    // Pull requests (MIN-161). Le trigger ne diffuse que les colonnes VISIBLES
    // (état, titre, url, tête, ticket, fusion — voir la migration) : un balayage
    // qui retamponne `synced_at` sur tout un dépôt reste muet.
    //
    // Trois caches, et ce ne sont pas les mêmes lecteurs : la LISTE (page Pull
    // Requests, compteur de la barre latérale), l'EN-TÊTE d'un panneau dont la
    // PR n'est pas celle que ce lecteur regarde — le topic `pull-request:{id}`
    // ne l'atteint pas, il n'y est pas abonné —, et le panneau du TICKET, qui
    // lit sa PR et son état dans `["agent-runs","issue",id]`
    // (`useIssueAgentRunsQuery`).
    case "pull_requests": {
      const record = change.record ?? change.old_record;
      const prId = typeof record?.id === "string" ? record.id : null;
      const issueId = issueIdOf(change);
      return [
        active(ALL_PULL_REQUESTS_KEY),
        ...(prId ? [active(["pull-request", prId])] : []),
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
  ["me", "triage-counts"],
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
  // La chaîne d'automatisation d'un ticket (MIN-147) : en préfixe, comme les
  // runs — un onglet qui a dormi pendant qu'une chaîne se déroulait doit
  // retrouver son étape réelle, pas celle d'avant la coupure.
  ["agent-chain"],
  // Le panneau d'une PR, ses quatre surfaces (MIN-161). En préfixe, et les
  // quatre : les messages du topic `pull-request:{id}` sont ÉPHÉMÈRES — un
  // onglet dormant ne les rejoue pas, il ne les a simplement pas eus. C'est donc
  // ce rattrapage-ci qui remet le fil, les commits et les remarques à jour au
  // retour au premier plan, et rien d'autre. Seules les requêtes MONTÉES
  // repartent au serveur (cf. `catchUp`), soit un panneau au plus.
  ["pull-request"],
  ["pr-comments"],
  ["pr-commits"],
  ["pr-review-comments"],
  // The aggregates this project feeds — missed events while offline would
  // otherwise leave the dashboard and /all stale until their staleTime.
  GLOBAL_BOARD_KEY,
  HOME_SUMMARY_KEY,
  STATS_KEY,
  TRIAGE_COUNTS_KEY,
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

  /**
   * Rattrapage : tout ce qui est monté dans ces périmètres repart au serveur.
   * Les doublons sont ignorés — deux projets partagent des clés-préfixes
   * (["comments"], ["events"]…) et la même invalidation n'a pas à être jouée
   * une fois par projet.
   */
  const catchUp = useCallback(
    (keys: QueryKey[]) => {
      const seen = new Set<string>();
      for (const key of keys) {
        const hash = JSON.stringify(key);
        if (seen.has(hash)) continue;
        seen.add(hash);
        void queryClient.invalidateQueries({ queryKey: key });
      }
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
          projectScopeKeys(id)
        )
      );
    }
  }, [userId, topicIds, openScope]);

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
      const realtime = getSupabase().realtime;
      if (
        !shouldCatchUpOnResume({
          hiddenForMs,
          socketConnected: realtime.isConnected(),
        })
      ) {
        return;
      }
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
