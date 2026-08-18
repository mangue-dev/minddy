import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { fetchAuthUsersById, toNamed } from "@/lib/server/auth-users";
import { fetchAvatarSeeds } from "@/lib/server/avatar-seeds";
import { resolveApiKeyActors } from "@/lib/server/api-key-actors";
import { accessibleProjectIds } from "@/lib/server/project-access";
import { displayName } from "@/lib/display-name";
import type { MyNotification } from "@/lib/types";

/** Length of the comment snippet shown below the inbox line. */
const EXCERPT_MAX = 140;

/** Terminal batch ID (MIN-118) — the inbox only displays 100 lines, and the
 gestures "all" go through `all` / `allRead`, not through a list of ids. */
const MAX_IDS = 500;

const excerptOf = (body: string): string => {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > EXCERPT_MAX ? `${flat.slice(0, EXCERPT_MAX - 1)}…` : flat;
};

/** GET /api/notifications — the caller's notifications, hydrated for the Inbox. */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  // RLS scopes to the caller's own notifications.
  const { data: notifs, error } = await auth.supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[api/notifications] list failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  if (!notifs || notifs.length === 0) return NextResponse.json([]);

  // Hydrate issue / project / actor / comment excerpt (service — the recipient
  // may not be able to read the actor's profile, and entity reads are simplest
  // server-side).
  const service = getServiceClient();

  /**
   * Access is rested HERE, before any hydration (MIN-351).
   *
   * The RLS guarantees that these lines are mine — not that I have the
   * right to read what they DESIGNATE. A notification is a dated fact;
   * hydration, it will look for titles and extracts in the service key
   * of **live** comments. Removed from the project, the former member therefore kept
   * in its inbox a continuous reading window on tickets and
   * discussions become foreign — their headlines today, not those of the
   * day it was notified.
   *
   * A line without `project_id` remains: it does not designate anything belonging to
   * a project, so there is no access to recheck.
   */
  const visible = await accessibleProjectIds(
    auth.user.id,
    [...new Set(notifs.map((n) => n.project_id).filter(Boolean))] as string[]
  );
  const readable = notifs.filter(
    (n) => !n.project_id || visible.has(n.project_id as string)
  );
  if (readable.length === 0) return NextResponse.json([]);

  const issueIds = [...new Set(readable.map((n) => n.issue_id).filter(Boolean))] as string[];
  const conversationIds = [
    ...new Set(readable.map((n) => n.agent_conversation_id).filter(Boolean)),
  ] as string[];
  const objectiveIds = [...new Set(readable.map((n) => n.objective_id).filter(Boolean))] as string[];
  const feedbackPostIds = [
    ...new Set(readable.map((n) => n.feedback_post_id).filter(Boolean)),
  ] as string[];
  const routineIds = [...new Set(readable.map((n) => n.routine_id).filter(Boolean))] as string[];
  const prIds = [
    ...new Set(readable.map((n) => n.pull_request_id).filter(Boolean)),
  ] as string[];
  const pageIds = [...new Set(readable.map((n) => n.page_id).filter(Boolean))] as string[];
  const projectIds = [...new Set(readable.map((n) => n.project_id).filter(Boolean))] as string[];
  const actorIds = [...new Set(readable.map((n) => n.actor_id).filter(Boolean))] as string[];
  const commentIds = [...new Set(readable.map((n) => n.comment_id).filter(Boolean))] as string[];

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
      ? service.from("issues").select("id, number, title").in("id", issueIds)
      .is("deleted_at", null)
      : Promise.resolve({ data: [] as { id: string; number: number; title: string }[] }),
    conversationIds.length
      ? service.from("agent_conversations").select("id, title").in("id", conversationIds)
      : Promise.resolve({ data: [] as { id: string; title: string | null }[] }),
    objectiveIds.length
      ? service.from("objectives").select("id, name").in("id", objectiveIds)
      .is("deleted_at", null)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    feedbackPostIds.length
      ? service.from("feedback_posts").select("id, title").in("id", feedbackPostIds)
      .is("deleted_at", null)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    // The ROUTINE of a scheduled notification (MIN-185): its title IS the
    // title of the inbox line — it has no tickets or comments to show.
    routineIds.length
      ? service.from("agent_routines").select("id, title").in("id", routineIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    // The PULL REQUEST of an opening notification: its number and title
    // make the first line, like the reference and title of a ticket.
    prIds.length
      ? service.from("pull_requests").select("id, number, title").in("id", prIds)
      : Promise.resolve({ data: [] as { id: string; number: number; title: string }[] }),
    // The PAGE of a wiki notification (MIN-278): its title IS the line.
    // Bins are discarded like tickets — notification survives
    // to the trash (MIN-133), but the line would lead to a blank screen.
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
    // The actor's brand, next to his name: the inbox shows the portrait of
    // which triggered the line (lib/server/avatar-seeds.ts).
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

  const issueMap = new Map((issues ?? []).map((i) => [i.id, i]));
  const conversationMap = new Map((agentConversations ?? []).map((c) => [c.id, c]));
  const objectiveMap = new Map((objectives ?? []).map((o) => [o.id, o]));
  const feedbackMap = new Map((feedbackPosts ?? []).map((f) => [f.id, f]));
  const routineMap = new Map((routines ?? []).map((r) => [r.id, r]));
  const prMap = new Map((pullRequests ?? []).map((p) => [p.id, p]));
  const pageMap = new Map((pages ?? []).map((p) => [p.id, p]));
  const projectMap = new Map((projects ?? []).map((p) => [p.id, p]));
  const commentMap = new Map((comments ?? []).map((c) => [c.id, c]));

  // The agent behind an MCP action. Two sources for the same thing:
  // notification itself the door (assignment), or the comment of which it
  // follows (mention / response) — the comment line remains the source of
  // truth for what was written, as for `via_assistant`.
  const keyActors = await resolveApiKeyActors([
    ...readable.map((n) => n.api_key_id as string | null),
    ...(comments ?? []).map((c) => c.api_key_id),
  ]);

  /**
   * Is the target still there? Since MIN-133, delete no longer deletes:
   * the notification survives the trashing of its ticket, its
   * objective or its return, where the `on delete cascade` carried it before.
   * The hydrations above excluding the baskets, the line would be displayed
   * without title and would lead to a blank screen - we remove it from the inbox, without
   * destroy: restoring the element brings it back, unread if it was.
   *
   * `data === null` = the reading FAILED, and not “nothing alive”: we
   * then filters on nothing, rather than emptying the inbox on a temporary error.
   */
  const targetAlive = (n: (typeof readable)[number]): boolean =>
    (!n.issue_id || !issues || issueMap.has(n.issue_id)) &&
    (!n.objective_id || !objectives || objectiveMap.has(n.objective_id)) &&
    (!n.feedback_post_id || !feedbackPosts || feedbackMap.has(n.feedback_post_id)) &&
    // A deleted routine carries its notifications by cascade: this filter
    // therefore only catches a partial reading, not a deletion.
    (!n.routine_id || !routines || routineMap.has(n.routine_id)) &&
    // Same for a pull request: the line cascades with it, this
    // filter therefore only catches a partial reading.
    (!n.pull_request_id || !pullRequests || prMap.has(n.pull_request_id)) &&
    // One page in the trash: same rule as tickets — the line goes out of
    // the inbox without being destroyed, and returns if the page is restored.
    (!n.page_id || !pages || pageMap.has(n.page_id));

  const result: MyNotification[] = readable.filter(targetAlive).map((n) => {
    const issue = n.issue_id ? issueMap.get(n.issue_id) : undefined;
    const objective = n.objective_id ? objectiveMap.get(n.objective_id) : undefined;
    const feedback = n.feedback_post_id ? feedbackMap.get(n.feedback_post_id) : undefined;
    const routine = n.routine_id ? routineMap.get(n.routine_id) : undefined;
    const pullRequest = n.pull_request_id ? prMap.get(n.pull_request_id) : undefined;
    const page = n.page_id ? pageMap.get(n.page_id) : undefined;
    const project = n.project_id ? projectMap.get(n.project_id) : undefined;
    const actor = n.actor_id ? actorsById.get(n.actor_id) : undefined;
    const comment = n.comment_id ? commentMap.get(n.comment_id) : undefined;
    // A Numo comment is stored under the triggering user's author_id (the row
    // belongs to them, the words don't) — the inbox names Numo, like the
    // timeline does, otherwise the requester reads "you commented".
    // The LINE can say it itself since MIN-278: a quote posed by
    // Numo in a page has no comment behind it where to read the
    // flag, and without it it would name the account that allowed the gesture.
    const fromNumo = !!n.via_assistant || !!comment?.via_assistant;
    const viaMcp = !fromNumo && (!!n.via_mcp || !!comment?.via_mcp);
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
        ? conversationMap.get(n.agent_conversation_id)?.title ?? null
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
      // The portrait follows the name: no seed for a non-human actor
      // (Numo, MCP agent, Smart Assign), which has its own brand on the client side.
      actor_avatar_seed:
        !fromNumo && !viaMcp && n.actor_id
          ? (actorSeeds.get(n.actor_id as string) ?? null)
          : null,
      from_numo: fromNumo,
      via_mcp: viaMcp,
      api_key_agent: keyActor?.agent ?? null,
      api_key_name: keyActor?.name ?? null,
      via_smart_assign: !!n.via_smart_assign,
      via_automation: !!n.via_automation,
      comment_excerpt: comment ? excerptOf(comment.body as string) : null,
    };
  });

  return NextResponse.json(result);
}

/**
 * PATCH /api/notifications — flip read state.
 * Body: { ids: string[] } | { all: true } to mark read, { ids, read: false }
 * to mark back unread.
 */
export async function PATCH(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }
  const { ids, all, read } = (body ?? {}) as {
    ids?: unknown;
    all?: unknown;
    read?: unknown;
  };
  const markRead = read !== false;
  if (Array.isArray(ids) && ids.length > MAX_IDS) {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
  }
  const validIds = Array.isArray(ids)
    ? ids.filter((v): v is string => typeof v === "string")
    : [];

  // RLS restricts updates to the caller's own rows.
  let query = auth.supabase
    .from("notifications")
    .update({ read_at: markRead ? new Date().toISOString() : null });
  if (markRead) query = query.is("read_at", null);
  if (all === true && markRead) {
    // no extra filter — all of my unread
  } else if (validIds.length > 0) {
    query = query.in("id", validIds);
  } else {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
  }

  const { error } = await query;
  if (error) {
    console.error("[api/notifications] mark read failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/notifications — remove rows for good.
 * Body: { ids: string[] } for specific rows, { allRead: true } to clear
 * everything already read.
 */
export async function DELETE(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }
  const { ids, allRead } = (body ?? {}) as { ids?: unknown; allRead?: unknown };
  if (Array.isArray(ids) && ids.length > MAX_IDS) {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
  }
  const validIds = Array.isArray(ids)
    ? ids.filter((v): v is string => typeof v === "string")
    : [];

  // RLS restricts deletes to the caller's own rows.
  let query = auth.supabase.from("notifications").delete();
  if (allRead === true) {
    query = query.not("read_at", "is", null);
  } else if (validIds.length > 0) {
    query = query.in("id", validIds);
  } else {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
  }

  const { error } = await query;
  if (error) {
    console.error("[api/notifications] delete failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
