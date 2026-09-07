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

  const projectIds = [
    ...new Set(readable.map((n) => n.project_id).filter(Boolean)),
  ] as string[];
  const commentIds = [
    ...new Set(readable.map((n) => n.comment_id).filter(Boolean)),
  ] as string[];
  const { data: comments } = commentIds.length
    ? await service
        .from("comments")
        .select(
          "id, issue_id, objective_id, feedback_post_id, body, via_assistant, via_mcp, api_key_id",
        )
        .in("id", commentIds)
    : {
        data: [] as {
          id: string;
          issue_id: string | null;
          objective_id: string | null;
          feedback_post_id: string | null;
          body: string;
          via_assistant: boolean;
          via_mcp: boolean;
          api_key_id: string | null;
        }[],
      };

  // A comment has no project_id of its own. Resolve its immutable parent in the
  // same bounded batch as direct notification targets, then require that parent
  // to match the notification project before exposing the excerpt.
  const issueIds = [
    ...new Set(
      [
        ...readable.map((n) => n.issue_id),
        ...(comments ?? []).map((comment) => comment.issue_id),
      ].filter(Boolean),
    ),
  ] as string[];
  const conversationIds = [
    ...new Set(readable.map((n) => n.agent_conversation_id).filter(Boolean)),
  ] as string[];
  const objectiveIds = [
    ...new Set(
      [
        ...readable.map((n) => n.objective_id),
        ...(comments ?? []).map((comment) => comment.objective_id),
      ].filter(Boolean),
    ),
  ] as string[];
  const feedbackPostIds = [
    ...new Set(
      [
        ...readable.map((n) => n.feedback_post_id),
        ...(comments ?? []).map((comment) => comment.feedback_post_id),
      ].filter(Boolean),
    ),
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

  const [
    { data: issues },
    { data: agentConversations },
    { data: objectives },
    { data: feedbackPosts },
    { data: routines },
    { data: pullRequests },
    { data: pages },
    { data: projects },
    { data: projectLinks },
  ] = await Promise.all([
    issueIds.length && projectIds.length
      ? service
          .from("issues")
          .select("id, project_id, number, title")
          .in("id", issueIds)
          .in("project_id", projectIds)
          .is("deleted_at", null)
      : Promise.resolve({
          data: [] as {
            id: string;
            project_id: string;
            number: number;
            title: string;
          }[],
        }),
    conversationIds.length && projectIds.length
      ? service
          .from("agent_conversations")
          .select("id, project_id, title")
          .in("id", conversationIds)
          .in("project_id", projectIds)
      : Promise.resolve({
          data: [] as { id: string; project_id: string; title: string | null }[],
        }),
    objectiveIds.length && projectIds.length
      ? service
          .from("objectives")
          .select("id, project_id, name")
          .in("id", objectiveIds)
          .in("project_id", projectIds)
          .is("deleted_at", null)
      : Promise.resolve({
          data: [] as { id: string; project_id: string; name: string }[],
        }),
    feedbackPostIds.length && projectIds.length
      ? service
          .from("feedback_posts")
          .select("id, project_id, title")
          .in("id", feedbackPostIds)
          .in("project_id", projectIds)
          .is("deleted_at", null)
      : Promise.resolve({
          data: [] as { id: string; project_id: string; title: string }[],
        }),
    routineIds.length && projectIds.length
      ? service
          .from("agent_routines")
          .select("id, project_id, title")
          .in("id", routineIds)
          .in("project_id", projectIds)
      : Promise.resolve({
          data: [] as { id: string; project_id: string; title: string }[],
        }),
    pullRequestIds.length
      ? service
          .from("pull_requests")
          .select("id, provider, repo_full_name, number, title")
          .in("id", pullRequestIds)
      : Promise.resolve({
          data: [] as {
            id: string;
            provider: string;
            repo_full_name: string;
            number: number;
            title: string;
          }[],
        }),
    pageIds.length && projectIds.length
      ? service
          .from("pages")
          .select("id, project_id, title")
          .in("id", pageIds)
          .in("project_id", projectIds)
          .is("deleted_at", null)
      : Promise.resolve({
          data: [] as { id: string; project_id: string; title: string }[],
        }),
    projectIds.length
      ? service
          .from("projects")
          .select("id, key, owner_id")
          .in("id", projectIds)
      : Promise.resolve({
          data: [] as { id: string; key: string; owner_id: string }[],
        }),
    projectIds.length
      ? service
          .from("project_git_links")
          .select("project_id, provider, repo_full_name")
          .in("project_id", projectIds)
      : Promise.resolve({
          data: [] as {
            project_id: string;
            provider: string;
            repo_full_name: string;
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

  const inProject = <T extends { project_id: string }>(
    item: T | undefined,
    projectId: unknown,
  ): item is T => !!item && item.project_id === projectId;
  const issueFor = (n: (typeof readable)[number]) => {
    const item = n.issue_id ? issueMap.get(n.issue_id) : undefined;
    return inProject(item, n.project_id) ? item : undefined;
  };
  const conversationFor = (n: (typeof readable)[number]) => {
    const item = n.agent_conversation_id
      ? conversationMap.get(n.agent_conversation_id)
      : undefined;
    return inProject(item, n.project_id) ? item : undefined;
  };
  const objectiveFor = (n: (typeof readable)[number]) => {
    const item = n.objective_id ? objectiveMap.get(n.objective_id) : undefined;
    return inProject(item, n.project_id) ? item : undefined;
  };
  const feedbackFor = (n: (typeof readable)[number]) => {
    const item = n.feedback_post_id
      ? feedbackMap.get(n.feedback_post_id)
      : undefined;
    return inProject(item, n.project_id) ? item : undefined;
  };
  const routineFor = (n: (typeof readable)[number]) => {
    const item = n.routine_id ? routineMap.get(n.routine_id) : undefined;
    return inProject(item, n.project_id) ? item : undefined;
  };
  const pageFor = (n: (typeof readable)[number]) => {
    const item = n.page_id ? pageMap.get(n.page_id) : undefined;
    return inProject(item, n.project_id) ? item : undefined;
  };
  const commentFor = (n: (typeof readable)[number]) => {
    const item = n.comment_id ? commentMap.get(n.comment_id) : undefined;
    if (!item) return undefined;
    const parent = item.issue_id
      ? issueMap.get(item.issue_id)
      : item.objective_id
        ? objectiveMap.get(item.objective_id)
        : item.feedback_post_id
          ? feedbackMap.get(item.feedback_post_id)
          : undefined;
    return inProject(parent, n.project_id) ? item : undefined;
  };
  const repoProjects = new Set(
    (projectLinks ?? []).map(
      (link) => `${link.project_id}\u0000${link.provider}\u0000${link.repo_full_name}`,
    ),
  );
  const pullRequestFor = (n: (typeof readable)[number]) => {
    const item = n.pull_request_id
      ? pullRequestMap.get(n.pull_request_id)
      : undefined;
    if (!item || typeof n.project_id !== "string") return undefined;
    return repoProjects.has(
      `${n.project_id}\u0000${item.provider}\u0000${item.repo_full_name}`,
    )
      ? item
      : undefined;
  };

  // Null data denotes a failed hydration and preserves the historical row. An
  // empty or cross-project result is authoritative and removes the confused
  // target from the response.
  const targetAlive = (n: (typeof readable)[number]): boolean =>
    (!n.issue_id || issues === null || !!issueFor(n)) &&
    (!n.agent_conversation_id ||
      agentConversations === null ||
      !!conversationFor(n)) &&
    (!n.objective_id || objectives === null || !!objectiveFor(n)) &&
    (!n.feedback_post_id || feedbackPosts === null || !!feedbackFor(n)) &&
    (!n.routine_id || routines === null || !!routineFor(n)) &&
    (!n.pull_request_id ||
      pullRequests === null ||
      projectLinks === null ||
      !!pullRequestFor(n)) &&
    (!n.page_id || pages === null || !!pageFor(n)) &&
    (!n.comment_id || comments === null || !!commentFor(n));

  const scopedNotifications = readable.filter(targetAlive);
  const candidateActorIds = [
    ...new Set(scopedNotifications.map((n) => n.actor_id).filter(Boolean)),
  ] as string[];
  const candidateKeyIds = [
    ...new Set(
      [
        ...scopedNotifications.map((n) => n.api_key_id),
        ...scopedNotifications.map((n) => commentFor(n)?.api_key_id),
      ].filter(Boolean),
    ),
  ] as string[];
  const { data: keyOwners } = candidateKeyIds.length
    ? await service
        .from("api_keys")
        .select("id, user_id")
        .in("id", candidateKeyIds)
    : { data: [] as { id: string; user_id: string }[] };
  const keyOwnerMap = new Map(
    (keyOwners ?? []).map((key) => [key.id as string, key.user_id as string]),
  );
  const attributionUserIds = [
    ...new Set([...candidateActorIds, ...keyOwnerMap.values()]),
  ];
  const { data: projectMembers } =
    projectIds.length && attributionUserIds.length
      ? await service
          .from("project_members")
          .select("project_id, user_id")
          .in("project_id", projectIds)
          .in("user_id", attributionUserIds)
      : { data: [] as { project_id: string; user_id: string }[] };
  const projectMemberSet = new Set(
    (projectMembers ?? []).map(
      (member) => `${member.project_id}\u0000${member.user_id}`,
    ),
  );
  const userBelongsToProject = (
    userId: string | null | undefined,
    projectId: unknown,
  ): userId is string => {
    if (!userId || typeof projectId !== "string") return false;
    const project = projectMap.get(projectId);
    return (
      project?.owner_id === userId ||
      projectMemberSet.has(`${projectId}\u0000${userId}`)
    );
  };
  const actorAllowedFor = (n: (typeof scopedNotifications)[number]) =>
    userBelongsToProject(n.actor_id as string | null, n.project_id);
  const keyIdFor = (n: (typeof scopedNotifications)[number]) =>
    (commentFor(n)?.api_key_id ?? n.api_key_id) as string | null;
  const keyAllowedFor = (n: (typeof scopedNotifications)[number]) => {
    const keyId = keyIdFor(n);
    return keyId
      ? userBelongsToProject(keyOwnerMap.get(keyId), n.project_id)
      : false;
  };
  const actorIds = [
    ...new Set(
      scopedNotifications
        .filter(actorAllowedFor)
        .map((n) => n.actor_id as string),
    ),
  ];
  const [actorsById, actorSeeds] = await Promise.all([
    fetchAuthUsersById(service, actorIds),
    fetchAvatarSeeds(service, actorIds),
  ]);

  const keyActors = await resolveApiKeyActors(
    scopedNotifications.filter(keyAllowedFor).map(keyIdFor),
  );

  const notifications: MyNotification[] = scopedNotifications
    .map((n) => {
      const issue = issueFor(n);
      const objective = objectiveFor(n);
      const feedback = feedbackFor(n);
      const routine = routineFor(n);
      const pullRequest = pullRequestFor(n);
      const page = pageFor(n);
      const project = n.project_id ? projectMap.get(n.project_id) : undefined;
      const actor =
        n.actor_id && actorAllowedFor(n)
          ? actorsById.get(n.actor_id)
          : undefined;
      const comment = commentFor(n);
      const fromNumo = Boolean(n.via_assistant || comment?.via_assistant);
      const viaMcp = !fromNumo && Boolean(n.via_mcp || comment?.via_mcp);
      const keyActor = viaMcp && keyAllowedFor(n)
        ? keyActors.get(keyIdFor(n) as string)
        : undefined;

      return {
        id: n.id,
        type: n.type,
        read_at: n.read_at,
        created_at: n.created_at,
        issue_id: n.issue_id,
        agent_conversation_id: n.agent_conversation_id ?? null,
        agent_conversation_title: conversationFor(n)?.title ?? null,
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
          !fromNumo && !viaMcp && actor
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
