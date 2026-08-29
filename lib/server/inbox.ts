import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAuthUsersById, toNamed } from "@/lib/server/auth-users";
import { fetchAvatarSeeds } from "@/lib/server/avatar-seeds";
import { resolveApiKeyActors } from "@/lib/server/api-key-actors";
import { accessibleProjectIds } from "@/lib/server/project-access";
import { displayName } from "@/lib/display-name";
import type { MyNotification } from "@/lib/types";

/** Maximum comment excerpt shown in the inbox and exposed to Numo. */
const EXCERPT_MAX = 140;

const excerptOf = (body: string): string => {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > EXCERPT_MAX
    ? `${flat.slice(0, EXCERPT_MAX - 1)}…`
    : flat;
};

export type InboxReadResult =
  | { notifications: MyNotification[]; error: null }
  | { notifications: []; error: string };

/**
 * Read and hydrate one user's inbox through an explicitly user-filtered query.
 *
 * The API route uses the caller's RLS client while Numo and the MCP surface use
 * a service client. Keeping the user filter here makes both paths share the same
 * access recheck, target-alive rules, actor attribution, and human-readable data.
 */
export async function readInboxNotifications({
  client,
  service,
  userId,
  limit = 100,
  clientIsUserScoped = false,
}: {
  client: SupabaseClient;
  service: SupabaseClient;
  userId: string;
  limit?: number;
  /** True only for an authenticated RLS client already pinned to this user. */
  clientIsUserScoped?: boolean;
}): Promise<InboxReadResult> {
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  let query = client.from("notifications").select("*");
  if (!clientIsUserScoped) query = query.eq("user_id", userId);
  const { data: notifs, error } = await query
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (error) return { notifications: [], error: error.message };
  if (!notifs || notifs.length === 0) {
    return { notifications: [], error: null };
  }

  // A notification remains a historical fact after project access is removed,
  // but its current title or comment must not become a reading window into a
  // project the user can no longer access.
  const visibleProjects = await accessibleProjectIds(userId, [
    ...new Set(notifs.map((n) => n.project_id).filter(Boolean)),
  ] as string[]);
  const readable = notifs.filter(
    (n) => !n.project_id || visibleProjects.has(n.project_id as string),
  );
  if (readable.length === 0) return { notifications: [], error: null };

  const issueIds = [
    ...new Set(readable.map((n) => n.issue_id).filter(Boolean)),
  ] as string[];
  const conversationIds = [
    ...new Set(readable.map((n) => n.agent_conversation_id).filter(Boolean)),
  ] as string[];
  const objectiveIds = [
    ...new Set(readable.map((n) => n.objective_id).filter(Boolean)),
  ] as string[];
  const feedbackPostIds = [
    ...new Set(readable.map((n) => n.feedback_post_id).filter(Boolean)),
  ] as string[];
  const routineIds = [
    ...new Set(readable.map((n) => n.routine_id).filter(Boolean)),
  ] as string[];
  const pullRequestIds = [
    ...new Set(readable.map((n) => n.pull_request_id).filter(Boolean)),
  ] as string[];
  const pageIds = [
    ...new Set(readable.map((n) => n.page_id).filter(Boolean)),
  ] as string[];
  const projectIds = [
    ...new Set(readable.map((n) => n.project_id).filter(Boolean)),
  ] as string[];
  const actorIds = [
    ...new Set(readable.map((n) => n.actor_id).filter(Boolean)),
  ] as string[];
  const commentIds = [
    ...new Set(readable.map((n) => n.comment_id).filter(Boolean)),
  ] as string[];

  const [
    { data: issues },
    { data: agentConversations },
    { data: objectives },
    { data: feedbackPosts },
    { data: routines },
    { data: pullRequests },
    { data: pages },
    { data: projects },
    actorsById,
    actorSeeds,
    { data: comments },
  ] = await Promise.all([
    issueIds.length
      ? service
          .from("issues")
          .select("id, number, title")
          .in("id", issueIds)
          .is("deleted_at", null)
      : Promise.resolve({
          data: [] as { id: string; number: number; title: string }[],
        }),
    conversationIds.length
      ? service
          .from("agent_conversations")
          .select("id, title")
          .in("id", conversationIds)
      : Promise.resolve({ data: [] as { id: string; title: string | null }[] }),
    objectiveIds.length
      ? service
          .from("objectives")
          .select("id, name")
          .in("id", objectiveIds)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    feedbackPostIds.length
      ? service
          .from("feedback_posts")
          .select("id, title")
          .in("id", feedbackPostIds)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    routineIds.length
      ? service.from("agent_routines").select("id, title").in("id", routineIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    pullRequestIds.length
      ? service
          .from("pull_requests")
          .select("id, number, title")
          .in("id", pullRequestIds)
      : Promise.resolve({
          data: [] as { id: string; number: number; title: string }[],
        }),
    pageIds.length
      ? service
          .from("pages")
          .select("id, title")
          .in("id", pageIds)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    projectIds.length
      ? service.from("projects").select("id, key").in("id", projectIds)
      : Promise.resolve({ data: [] as { id: string; key: string }[] }),
    fetchAuthUsersById(service, actorIds),
    fetchAvatarSeeds(service, actorIds),
    commentIds.length
      ? service
          .from("comments")
          .select("id, body, via_assistant, via_mcp, api_key_id")
          .in("id", commentIds)
      : Promise.resolve({
          data: [] as {
            id: string;
            body: string;
            via_assistant: boolean;
            via_mcp: boolean;
            api_key_id: string | null;
          }[],
        }),
  ]);

  const issueMap = new Map((issues ?? []).map((item) => [item.id, item]));
  const conversationMap = new Map(
    (agentConversations ?? []).map((item) => [item.id, item]),
  );
  const objectiveMap = new Map(
    (objectives ?? []).map((item) => [item.id, item]),
  );
  const feedbackMap = new Map(
    (feedbackPosts ?? []).map((item) => [item.id, item]),
  );
  const routineMap = new Map((routines ?? []).map((item) => [item.id, item]));
  const pullRequestMap = new Map(
    (pullRequests ?? []).map((item) => [item.id, item]),
  );
  const pageMap = new Map((pages ?? []).map((item) => [item.id, item]));
  const projectMap = new Map((projects ?? []).map((item) => [item.id, item]));
  const commentMap = new Map((comments ?? []).map((item) => [item.id, item]));

  const keyActors = await resolveApiKeyActors([
    ...readable.map((n) => n.api_key_id as string | null),
    ...(comments ?? []).map((comment) => comment.api_key_id),
  ]);

  // Soft-deleted targets stay in the database, but their inbox rows remain
  // hidden until the target is restored. A failed hydration does not count as a
  // deletion: null data leaves the row visible instead of emptying the inbox.
  const targetAlive = (n: (typeof readable)[number]): boolean =>
    (!n.issue_id || !issues || issueMap.has(n.issue_id)) &&
    (!n.objective_id || !objectives || objectiveMap.has(n.objective_id)) &&
    (!n.feedback_post_id ||
      !feedbackPosts ||
      feedbackMap.has(n.feedback_post_id)) &&
    (!n.routine_id || !routines || routineMap.has(n.routine_id)) &&
    (!n.pull_request_id ||
      !pullRequests ||
      pullRequestMap.has(n.pull_request_id)) &&
    (!n.page_id || !pages || pageMap.has(n.page_id));

  const notifications: MyNotification[] = readable
    .filter(targetAlive)
    .map((n) => {
      const issue = n.issue_id ? issueMap.get(n.issue_id) : undefined;
      const objective = n.objective_id
        ? objectiveMap.get(n.objective_id)
        : undefined;
      const feedback = n.feedback_post_id
        ? feedbackMap.get(n.feedback_post_id)
        : undefined;
      const routine = n.routine_id ? routineMap.get(n.routine_id) : undefined;
      const pullRequest = n.pull_request_id
        ? pullRequestMap.get(n.pull_request_id)
        : undefined;
      const page = n.page_id ? pageMap.get(n.page_id) : undefined;
      const project = n.project_id ? projectMap.get(n.project_id) : undefined;
      const actor = n.actor_id ? actorsById.get(n.actor_id) : undefined;
      const comment = n.comment_id ? commentMap.get(n.comment_id) : undefined;
      const fromNumo = Boolean(n.via_assistant || comment?.via_assistant);
      const viaMcp = !fromNumo && Boolean(n.via_mcp || comment?.via_mcp);
      const keyActor = viaMcp
        ? keyActors.get((comment?.api_key_id ?? n.api_key_id) as string)
        : undefined;

      return {
        id: n.id,
        type: n.type,
        read_at: n.read_at,
        created_at: n.created_at,
        issue_id: n.issue_id,
        agent_conversation_id: n.agent_conversation_id ?? null,
        agent_conversation_title: n.agent_conversation_id
          ? (conversationMap.get(n.agent_conversation_id)?.title ?? null)
          : null,
        issue_number: issue?.number ?? null,
        issue_title: issue?.title ?? null,
        objective_id: n.objective_id ?? null,
        objective_name: objective?.name ?? null,
        feedback_post_id: n.feedback_post_id ?? null,
        feedback_title: feedback?.title ?? null,
        routine_id: n.routine_id ?? null,
        routine_title: routine?.title ?? null,
        pull_request_id: n.pull_request_id ?? null,
        pull_request_number: pullRequest?.number ?? null,
        pull_request_title: pullRequest?.title ?? null,
        page_id: n.page_id ?? null,
        page_title: page?.title ?? null,
        block_id: n.block_id ?? null,
        project_id: n.project_id,
        project_key: project?.key ?? null,
        actor_name: fromNumo
          ? "Numo"
          : actor
            ? displayName(toNamed(actor))
            : null,
        actor_avatar_seed:
          !fromNumo && !viaMcp && n.actor_id
            ? (actorSeeds.get(n.actor_id as string) ?? null)
            : null,
        from_numo: fromNumo,
        via_mcp: viaMcp,
        api_key_agent: keyActor?.agent ?? null,
        api_key_name: keyActor?.name ?? null,
        via_smart_assign: Boolean(n.via_smart_assign),
        via_automation: Boolean(n.via_automation),
        comment_excerpt: comment ? excerptOf(comment.body as string) : null,
      };
    });

  return { notifications, error: null };
}
