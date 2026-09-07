import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationType } from "@/lib/types";
import {
  categoryOfNotification,
  resolveNotificationPrefs,
  type NotificationPrefs,
} from "@/lib/notification-prefs";
import { afterOrNow } from "@/lib/server/after-safe";
import { isPushConfigured } from "@/lib/server/push/vapid";
import { isApnsConfigured } from "@/lib/server/push/apns";
import {
  buildPushPayload,
  loadPushContext,
  toPushLocale,
  type PushLocale,
} from "@/lib/server/push/payload";
import { sendPushToUser } from "@/lib/server/push/send";

export interface NotificationRow {
  user_id: string;
  project_id: string | null;
  type: NotificationType;
  issue_id: string | null;
  /** Conversation de code visee, qu'elle ait ou non un ticket en contexte. */
  agent_conversation_id?: string | null;
  /** Set instead of issue_id when the notification points at an objective. */
  objective_id?: string | null;
  /** Set instead of issue_id/objective_id for a feedback-post notification. */
  feedback_post_id?: string | null;
  /** Set instead of the three above for a ROUTINE notification (MIN-185) — a
      scheduled run has no ticket, and its executions live in the routine. */
  routine_id?: string | null;
  /** Set instead of all the above for a PULL REQUEST notification: it reads
 on the Pull requests page, and does not necessarily have a ticket. */
  pull_request_id?: string | null;
  /** Set instead of all the above for a PAGE notification (MIN-278) — mention
 in a page, or writing of the agent in it. */
  page_id?: string | null;
  /** The block referred to in this page, when the mention was made: the click
 then falls on the paragraph, not just on the document. */
  block_id?: string | null;
  comment_id?: string | null;
  actor_id: string | null;
  /** The action is taken by the MCP server: the actor displayed in the inbox is
 the AGENT carried by `api_key_id`, not the owner of the key. Same
 vocabulary as `issue_events` (lib/server/issue-events.ts). */
  via_mcp?: boolean;
  /** The action is a gesture from OUR non-MCP agent — the Numo cat, the agent of
 code. The inbox then names Numo, as it already does from a comment
 that he wrote (the flag was read until now on the comment line;
 a quote in a page does not have this shelter, MIN-278). */
  via_assistant?: boolean;
  /** The API key behind an MCP action — its agent/name gives logo and label. */
  api_key_id?: string | null;
  /** The assignment comes from Smart Assign (`actor_id` null): the inbox names the
 feature instead of saying "Someone". */
  via_smart_assign?: boolean;
  /** The line comes from a project automation (MIN-147) — same reason as
 the flag above: without it, the inbox says "Someone". */
  via_automation?: boolean;
}

/** The agent types displace each other: one live agent notification per issue.
 * `routine_done` is one of them: it is the end of the passage of a routine, it
 * replaces the “finished” or “failed” of the previous passage — otherwise
 * a daily routine stacks one line per morning. */
const AGENT_TYPES: readonly NotificationType[] = [
  "agent_done",
  "agent_question",
  "agent_failed",
  "routine_done",
];

const siblingTypes = (type: NotificationType): readonly NotificationType[] =>
  AGENT_TYPES.includes(type) ? AGENT_TYPES : [type];

type ScopeRow = Record<string, unknown>;

const idsOf = (
  rows: readonly NotificationRow[],
  pick: (row: NotificationRow) => string | null | undefined,
): string[] => [...new Set(rows.map(pick).filter((id): id is string => !!id))];

const scopedId = (
  projectId: string,
  provider: string,
  repoFullName: string,
): string => `${projectId}\u0000${provider}\u0000${repoFullName}`;

/**
 * Recheck access and target scope immediately before external push delivery.
 * The database trigger serializes notification creation with access
 * revocation; this second check also covers a target move or revocation that
 * commits after the insert and before the deferred push job runs.
 *
 * Target reads fail closed. Actor and API-key attribution is sanitized instead
 * of dropping an otherwise valid notification when its identity no longer
 * belongs to the notification project.
 */
async function currentlyPushableRows(
  service: SupabaseClient,
  rows: readonly NotificationRow[],
): Promise<NotificationRow[]> {
  const projectIds = idsOf(rows, (row) => row.project_id);
  const commentIds = idsOf(rows, (row) => row.comment_id);
  const apiKeyIds = idsOf(rows, (row) => row.api_key_id);

  const [projectsResult, commentsResult, apiKeysResult] = await Promise.all([
    projectIds.length
      ? service.from("projects").select("id, owner_id").in("id", projectIds)
      : Promise.resolve({ data: [] as ScopeRow[], error: null }),
    commentIds.length
      ? service
          .from("comments")
          .select("id, issue_id, objective_id, feedback_post_id")
          .in("id", commentIds)
      : Promise.resolve({ data: [] as ScopeRow[], error: null }),
    apiKeyIds.length
      ? service.from("api_keys").select("id, user_id").in("id", apiKeyIds)
      : Promise.resolve({ data: [] as ScopeRow[], error: null }),
  ]);

  const comments = (commentsResult.data ?? []) as ScopeRow[];
  const issueIds = [
    ...new Set([
      ...idsOf(rows, (row) => row.issue_id),
      ...comments
        .map((comment) => comment.issue_id)
        .filter((id): id is string => typeof id === "string"),
    ]),
  ];
  const objectiveIds = [
    ...new Set([
      ...idsOf(rows, (row) => row.objective_id),
      ...comments
        .map((comment) => comment.objective_id)
        .filter((id): id is string => typeof id === "string"),
    ]),
  ];
  const feedbackIds = [
    ...new Set([
      ...idsOf(rows, (row) => row.feedback_post_id),
      ...comments
        .map((comment) => comment.feedback_post_id)
        .filter((id): id is string => typeof id === "string"),
    ]),
  ];
  const recipientAndActorIds = [
    ...new Set([
      ...rows.map((row) => row.user_id),
      ...idsOf(rows, (row) => row.actor_id),
      ...(apiKeysResult.data ?? [])
        .map((key) => key.user_id)
        .filter((id): id is string => typeof id === "string"),
    ]),
  ];

  const targetQuery = <T extends ScopeRow>(
    ids: readonly string[],
    table:
      | "issues"
      | "objectives"
      | "feedback_posts"
      | "agent_routines"
      | "pages"
      | "agent_conversations",
  ) =>
    ids.length && projectIds.length
      ? service
          .from(table)
          .select("id, project_id")
          .in("id", [...ids])
          .in("project_id", projectIds)
      : Promise.resolve({ data: [] as T[], error: null });

  const [
    membersResult,
    issuesResult,
    objectivesResult,
    feedbackResult,
    routinesResult,
    pagesResult,
    conversationsResult,
    pullRequestsResult,
    projectLinksResult,
  ] = await Promise.all([
    projectIds.length && recipientAndActorIds.length
      ? service
          .from("project_members")
          .select("project_id, user_id")
          .in("project_id", projectIds)
          .in("user_id", recipientAndActorIds)
      : Promise.resolve({ data: [] as ScopeRow[], error: null }),
    targetQuery(issueIds, "issues"),
    targetQuery(objectiveIds, "objectives"),
    targetQuery(feedbackIds, "feedback_posts"),
    targetQuery(idsOf(rows, (row) => row.routine_id), "agent_routines"),
    targetQuery(idsOf(rows, (row) => row.page_id), "pages"),
    targetQuery(
      idsOf(rows, (row) => row.agent_conversation_id),
      "agent_conversations",
    ),
    idsOf(rows, (row) => row.pull_request_id).length
      ? service
          .from("pull_requests")
          .select("id, provider, repo_full_name")
          .in("id", idsOf(rows, (row) => row.pull_request_id))
      : Promise.resolve({ data: [] as ScopeRow[], error: null }),
    projectIds.length
      ? service
          .from("project_git_links")
          .select("project_id, provider, repo_full_name")
          .in("project_id", projectIds)
      : Promise.resolve({ data: [] as ScopeRow[], error: null }),
  ]);

  const failures = [
    projectsResult.error,
    commentsResult.error,
    apiKeysResult.error,
    membersResult.error,
    issuesResult.error,
    objectivesResult.error,
    feedbackResult.error,
    routinesResult.error,
    pagesResult.error,
    conversationsResult.error,
    pullRequestsResult.error,
    projectLinksResult.error,
  ].flatMap((error) => (error ? [error.message] : []));
  if (failures.length > 0) {
    console.error(
      "[notifications] push scope recheck failed:",
      failures.join("; "),
    );
  }

  const owners = new Map(
    (projectsResult.data ?? []).map((project) => [
      project.id as string,
      project.owner_id as string,
    ]),
  );
  const memberships = new Set(
    (membersResult.data ?? []).map(
      (member) =>
        `${member.project_id as string}\u0000${member.user_id as string}`,
    ),
  );
  const belongsToProject = (
    userId: string | null | undefined,
    projectId: string | null,
  ): boolean =>
    !!userId &&
    !!projectId &&
    !projectsResult.error &&
    !membersResult.error &&
    (owners.get(projectId) === userId ||
      memberships.has(`${projectId}\u0000${userId}`));

  const scopeMap = (data: ScopeRow[] | null) =>
    new Map((data ?? []).map((item) => [item.id as string, item]));
  const issues = scopeMap((issuesResult.data ?? []) as ScopeRow[]);
  const objectives = scopeMap((objectivesResult.data ?? []) as ScopeRow[]);
  const feedback = scopeMap((feedbackResult.data ?? []) as ScopeRow[]);
  const routines = scopeMap((routinesResult.data ?? []) as ScopeRow[]);
  const pages = scopeMap((pagesResult.data ?? []) as ScopeRow[]);
  const conversations = scopeMap(
    (conversationsResult.data ?? []) as ScopeRow[],
  );
  const commentMap = scopeMap(comments);
  const pullRequests = scopeMap(
    (pullRequestsResult.data ?? []) as ScopeRow[],
  );
  const apiKeyOwners = new Map(
    (apiKeysResult.data ?? []).map((key) => [
      key.id as string,
      key.user_id as string,
    ]),
  );
  const repoProjects = new Set(
    (projectLinksResult.data ?? []).map((link) =>
      scopedId(
        link.project_id as string,
        link.provider as string,
        link.repo_full_name as string,
      ),
    ),
  );

  const directTargetMatches = (
    id: string | null | undefined,
    projectId: string | null,
    result: { error: unknown },
    targets: ReadonlyMap<string, ScopeRow>,
  ): boolean =>
    !id ||
    (!result.error && targets.get(id)?.project_id === projectId);

  return rows.flatMap((row) => {
    if (
      row.project_id &&
      !belongsToProject(row.user_id, row.project_id)
    ) {
      return [];
    }

    const comment = row.comment_id ? commentMap.get(row.comment_id) : undefined;
    const commentMatches = !row.comment_id
      ? true
      : !commentsResult.error &&
        !!comment &&
        (typeof comment.issue_id === "string"
          ? directTargetMatches(
              comment.issue_id,
              row.project_id,
              issuesResult,
              issues,
            )
          : typeof comment.objective_id === "string"
            ? directTargetMatches(
                comment.objective_id,
                row.project_id,
                objectivesResult,
                objectives,
              )
            : typeof comment.feedback_post_id === "string" &&
              directTargetMatches(
                comment.feedback_post_id,
                row.project_id,
                feedbackResult,
                feedback,
              ));
    const pullRequest = row.pull_request_id
      ? pullRequests.get(row.pull_request_id)
      : undefined;
    const pullRequestMatches = !row.pull_request_id
      ? true
      : !pullRequestsResult.error &&
        !projectLinksResult.error &&
        !!row.project_id &&
        !!pullRequest &&
        repoProjects.has(
          scopedId(
            row.project_id,
            pullRequest.provider as string,
            pullRequest.repo_full_name as string,
          ),
        );

    const targetsMatch =
      directTargetMatches(
        row.issue_id,
        row.project_id,
        issuesResult,
        issues,
      ) &&
      directTargetMatches(
        row.objective_id,
        row.project_id,
        objectivesResult,
        objectives,
      ) &&
      directTargetMatches(
        row.feedback_post_id,
        row.project_id,
        feedbackResult,
        feedback,
      ) &&
      directTargetMatches(
        row.routine_id,
        row.project_id,
        routinesResult,
        routines,
      ) &&
      directTargetMatches(row.page_id, row.project_id, pagesResult, pages) &&
      directTargetMatches(
        row.agent_conversation_id,
        row.project_id,
        conversationsResult,
        conversations,
      ) &&
      commentMatches &&
      pullRequestMatches;
    if (!targetsMatch) return [];

    const actorId = belongsToProject(row.actor_id, row.project_id)
      ? row.actor_id
      : null;
    const apiKeyId =
      row.api_key_id &&
      !apiKeysResult.error &&
      belongsToProject(apiKeyOwners.get(row.api_key_id), row.project_id)
        ? row.api_key_id
        : null;
    if (actorId === row.actor_id && apiKeyId === (row.api_key_id ?? null)) {
      return [row];
    }
    return [{ ...row, actor_id: actorId, api_key_id: apiKeyId }];
  });
}

export async function insertNotifications(
  service: SupabaseClient,
  rows: NotificationRow[],
  opts: {
    replaceUnread?: boolean;
    /** Atomically retain one opening announcement per recipient and pull request. */
    deduplicatePullRequestOpened?: boolean;
  } = {}
): Promise<void> {
  if (rows.length === 0) return;

  // Per-recipient preference filter (MIN-82): a category switched off in the
  // account settings drops the row here, at the single insertion point every
  // producer funnels through. Fail-open — a prefs read error never censors.
  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const prefsById = new Map<string, NotificationPrefs>();
  const localeByUserId = new Map<string, PushLocale>();
  await Promise.all(
    userIds.map(async (uid) => {
      try {
        const { data } = await service.auth.admin.getUserById(uid);
        const metadata = (data?.user?.user_metadata ?? null) as Record<
          string,
          unknown
        > | null;
        prefsById.set(uid, resolveNotificationPrefs(metadata));
        localeByUserId.set(
          uid,
          toPushLocale(
            typeof metadata?.locale === "string" ? metadata.locale : null,
          ),
        );
      } catch (e) {
        console.error("[notifications] prefs read failed:", (e as Error).message);
      }
    })
  );
  const kept = rows.filter((r) => {
    const prefs = prefsById.get(r.user_id);
    // The LINE, not just its type: a routine borrows the types of
    // the agent, and only its `routine_id` places it under the correct toggle.
    return !prefs || prefs[categoryOfNotification(r)];
  });
  if (kept.length === 0) return;

  // replaceUnread: the fresh notification displaces its unread predecessor for
  // the same recipient/target (agent runs — a long session must not stack one
  // row per turn). Best-effort: a failed delete only leaves a duplicate.
  if (opts.replaceUnread) {
    await Promise.all(
      kept.map((r) => {
        let del = service
          .from("notifications")
          .delete()
          .eq("user_id", r.user_id)
          .in("type", siblingTypes(r.type) as string[])
          .is("read_at", null);
        del = r.issue_id ? del.eq("issue_id", r.issue_id) : del.is("issue_id", null);
        del = r.agent_conversation_id
          ? del.eq("agent_conversation_id", r.agent_conversation_id)
          : del.is("agent_conversation_id", null);
        // A ROUTINE notification (MIN-185) has no ticket: without this
        // second filter, the `issue_id is null` above would move the line
        // of ALL routines in the account — two routines fail the same
        // morning would leave only one, and the other would disappear without having
        // been read. Each routine moves its own, and that alone.
        del = r.routine_id ? del.eq("routine_id", r.routine_id) : del.is("routine_id", null);
        // Same reason for a PAGE (MIN-278): without this filter, a write
        // of agent in a page would move the unread line ALL the
        // others. It is this clause that makes an agent who rewrites six pages
        // in a row leaves six lines, and an agent who goes over ten times
        // the same leaves only one.
        del = r.page_id ? del.eq("page_id", r.page_id) : del.is("page_id", null);
        return del;
      })
    );
  }

  let inserted = kept;
  let error: { message: string } | null = null;
  if (opts.deduplicatePullRequestOpened) {
    // `ignoreDuplicates` relies on the matching database unique index. Unlike a
    // read-then-insert guard, it remains correct when the agent and a forge
    // webhook announce the same opening at the same time. PostgREST returns
    // only rows inserted by `ON CONFLICT DO NOTHING`, so duplicate attempts do
    // not also trigger a second system push.
    const result = await service
      .from("notifications")
      .upsert(kept, {
        onConflict: "user_id,type,pull_request_id",
        ignoreDuplicates: true,
      })
      .select();
    error = result.error;
    inserted = (result.data ?? []) as NotificationRow[];
  } else {
    const result = await service.from("notifications").insert(kept);
    error = result.error;
  }
  if (error) {
    console.error("[notifications] insert failed:", error.message);
    return;
  }

  // Web Push (MIN-183): the same lines go to system notification, on
  // the devices that the recipient has registered. Here, and not elsewhere, for
  // deux raisons :
  // • this is the ONLY insertion point — thirteen producers converge there, so
  // plug in here covers everything that falls into the inbox, today and
  // tomorrow, without any of them having to know it;
  // • the preferences filter (MIN-82) is already set to `kept`. Only one
  // seesaw governs both surfaces, there is nothing to refilter — and therefore
  // no second filter to keep in phase with the first.
  //
  // After the insert and ONLY if it was successful: a notification that we don't have
  // writing should not ring on a phone leaving the inbox empty.
  //
  // `afterOrNow` is essential: half of the producers shoot outside
  // request (automation cascades, end of agent run, crons). A `void`
  // detached would die with the response, in “TypeError: fetch failed” (cf.
  // lib/server/after-safe.ts).
  if (inserted.length > 0) {
    pushNotifications(service, inserted, localeByUserId);
  }
}

/** The push pane of `insertNotifications`, isolated to read alone. Best-effort
 end-to-end: Nothing that follows goes back to the caller. */
function pushNotifications(
  service: SupabaseClient,
  kept: NotificationRow[],
  localeByUserId: ReadonlyMap<string, PushLocale>,
): void {
  if (!isPushConfigured() && !isApnsConfigured()) return;
  afterOrNow(async () => {
    const authorized = await currentlyPushableRows(service, kept);
    if (authorized.length === 0) return;
    const ctx = await loadPushContext(service, authorized);
    // Sequential by recipient: `sendPushToUser` already parallelizes by
    // device, and an insert is rarely aimed at more than a handful of people.
    for (const row of authorized) {
      const locale = localeByUserId.get(row.user_id) ?? "en";
      await sendPushToUser(
        service,
        row.user_id,
        buildPushPayload(ctx, row, locale),
      );
    }
  });
}

/** The set of userIds that can access a project (owner + members). */
export async function projectMemberIds(
  service: SupabaseClient,
  projectId: string
): Promise<Set<string>> {
  const [{ data: proj }, { data: members }] = await Promise.all([
    service.from("projects").select("owner_id").eq("id", projectId).maybeSingle(),
    service.from("project_members").select("user_id").eq("project_id", projectId),
  ]);
  const set = new Set<string>();
  if (proj?.owner_id) set.add(proj.owner_id as string);
  for (const m of members ?? []) set.add(m.user_id as string);
  return set;
}
