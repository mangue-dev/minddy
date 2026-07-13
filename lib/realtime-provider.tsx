"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";
import { useAuth } from "./auth-context";
import { projectIdFromPath } from "./project-id-from-path";

/**
 * Single realtime bridge for the whole app. The DB broadcasts every relevant
 * write (triggers → realtime.broadcast_changes, see the realtime_broadcast
 * migration) on two private topics, and this provider is the only subscriber:
 *
 *   user:{userId}       — notifications, my project list, my invitations
 *   project:{projectId} — content of the project currently on screen
 *
 * Events only invalidate React Query caches (reads stay on the REST routes);
 * per-key coalescing absorbs write bursts (Numo/MCP) into a single refetch.
 * Subscriptions are gated on the restored session: joining with the anon token
 * would be refused on private channels (and was how the old postgres_changes
 * bridges silently died).
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

function keysForUserEvent(change: BroadcastChange): QueryKey[] {
  switch (change.table) {
    case "notifications":
      return [["notifications"]];
    case "projects":
    case "project_members": // my membership changed → my project list
      return [["projects"]];
    case "project_invitations":
      return [["my-invitations"], ["projects"]];
    case "views": // global (project-less) views broadcast on the user topic
      return [["views", "global"]];
    case "cycles": // my cycle timeline moved (fill, capture, rollover — MIN-32)
      return [
        ["me", "board"],
        ["me", "cycle"],
      ];
    default:
      return [];
  }
}

function keysForProjectEvent(
  change: BroadcastChange,
  projectId: string
): QueryKey[] {
  switch (change.table) {
    case "issues":
    case "issue_categories": // issues are cached hydrated with category_ids
      return [["issues", projectId]];
    case "issue_relations":
      return [["issue-relations", projectId]];
    case "objectives":
      return [["objectives", projectId]];
    case "categories": // renames/deletes also affect chips on cached issues
      return [
        ["categories", projectId],
        ["issues", projectId],
      ];
    case "views":
      return [["views", projectId]];
    case "project_members":
    case "project_invitations": // the members view lists both
      return [["members", projectId]];
    case "comments": {
      // A comment hangs off an issue OR an objective OR a feedback post — route
      // to the right cache. Feedback comment keys carry the project id.
      const issueId = issueIdOf(change);
      if (issueId) return [["comments", issueId]];
      const objectiveId = objectiveIdOf(change);
      if (objectiveId) return [["objective-comments", objectiveId]];
      const postId = feedbackPostIdOf(change);
      return postId ? [["feedback-comments", projectId, postId]] : [];
    }
    case "attachments": {
      // Comment attachments ride the comments cache; entity-level ones have
      // their own query.
      const issueId = issueIdOf(change);
      if (issueId) {
        return [
          ["comments", issueId],
          ["issue-attachments", issueId],
        ];
      }
      const objectiveId = objectiveIdOf(change);
      if (objectiveId) {
        return [
          ["objective-comments", objectiveId],
          ["objective-attachments", objectiveId],
        ];
      }
      const postId = feedbackPostIdOf(change);
      return postId ? [["feedback-comments", projectId, postId]] : [];
    }
    case "issue_events": {
      const issueId = issueIdOf(change);
      if (issueId) return [["events", issueId]];
      const objectiveId = objectiveIdOf(change);
      if (objectiveId) return [["objective-events", objectiveId]];
      const postId = feedbackPostIdOf(change);
      return postId ? [["feedback-events", projectId, postId]] : [];
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
  ["feedback-comments", projectId],
  ["feedback-events", projectId],
];

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  // Stable primitive — the session/user objects change identity on every token
  // refresh and would tear the channels down for nothing.
  const userId = user?.id ?? null;
  const pathname = usePathname();
  const projectId = projectIdFromPath(pathname ?? "");
  const queryClient = useQueryClient();

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
    (key: QueryKey) => {
      const k = JSON.stringify(key);
      if (timers.current.has(k)) return;
      timers.current.set(
        k,
        setTimeout(() => {
          timers.current.delete(k);
          void queryClient.invalidateQueries({ queryKey: key });
        }, INVALIDATE_COALESCE_MS)
      );
    },
    [queryClient]
  );

  const openScope = useCallback(
    (
      topic: string,
      keysFor: (change: BroadcastChange) => QueryKey[],
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
            for (const key of keysFor(payload as BroadcastChange)) {
              invalidateCoalesced(key);
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

  useEffect(() => {
    if (!userId || !projectId) return;
    return openScope(
      `project:${projectId}`,
      (change) => keysForProjectEvent(change, projectId),
      projectScopeKeys(projectId)
    );
  }, [userId, projectId, openScope]);

  return <>{children}</>;
}
