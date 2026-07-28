import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { fetchAuthUsersById, toNamed } from "@/lib/server/auth-users";
import { fetchAvatarSeeds } from "@/lib/server/avatar-seeds";
import { resolveApiKeyActors } from "@/lib/server/api-key-actors";
import { displayName } from "@/lib/display-name";
import type { MyNotification } from "@/lib/types";

/** Longueur de l'extrait de commentaire montré sous la ligne d'inbox. */
const EXCERPT_MAX = 140;

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
  const issueIds = [...new Set(notifs.map((n) => n.issue_id).filter(Boolean))] as string[];
  const objectiveIds = [...new Set(notifs.map((n) => n.objective_id).filter(Boolean))] as string[];
  const feedbackPostIds = [
    ...new Set(notifs.map((n) => n.feedback_post_id).filter(Boolean)),
  ] as string[];
  const projectIds = [...new Set(notifs.map((n) => n.project_id).filter(Boolean))] as string[];
  const actorIds = [...new Set(notifs.map((n) => n.actor_id).filter(Boolean))] as string[];
  const commentIds = [...new Set(notifs.map((n) => n.comment_id).filter(Boolean))] as string[];

  const [
    { data: issues },
    { data: objectives },
    { data: feedbackPosts },
    { data: projects },
    actorsById,
    actorSeeds,
    { data: comments },
  ] = await Promise.all([
    issueIds.length
      ? service.from("issues").select("id, number, title").in("id", issueIds)
      : Promise.resolve({ data: [] as { id: string; number: number; title: string }[] }),
    objectiveIds.length
      ? service.from("objectives").select("id, name").in("id", objectiveIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    feedbackPostIds.length
      ? service.from("feedback_posts").select("id, title").in("id", feedbackPostIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    projectIds.length
      ? service.from("projects").select("id, key").in("id", projectIds)
      : Promise.resolve({ data: [] as { id: string; key: string }[] }),
    fetchAuthUsersById(service, actorIds),
    // La marque de l'acteur, à côté de son nom : l'inbox montre le portrait de
    // qui a déclenché la ligne (lib/server/avatar-seeds.ts).
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
  const objectiveMap = new Map((objectives ?? []).map((o) => [o.id, o]));
  const feedbackMap = new Map((feedbackPosts ?? []).map((f) => [f.id, f]));
  const projectMap = new Map((projects ?? []).map((p) => [p.id, p]));
  const commentMap = new Map((comments ?? []).map((c) => [c.id, c]));

  // L'agent derrière une action MCP. Deux provenances pour la même chose : la
  // notification elle-même la porte (affectation), ou le commentaire dont elle
  // découle (mention / réponse) — la ligne du commentaire reste la source de
  // vérité pour ce qui a été écrit, comme pour `via_assistant`.
  const keyActors = await resolveApiKeyActors([
    ...notifs.map((n) => n.api_key_id as string | null),
    ...(comments ?? []).map((c) => c.api_key_id),
  ]);

  const result: MyNotification[] = notifs.map((n) => {
    const issue = n.issue_id ? issueMap.get(n.issue_id) : undefined;
    const objective = n.objective_id ? objectiveMap.get(n.objective_id) : undefined;
    const feedback = n.feedback_post_id ? feedbackMap.get(n.feedback_post_id) : undefined;
    const project = n.project_id ? projectMap.get(n.project_id) : undefined;
    const actor = n.actor_id ? actorsById.get(n.actor_id) : undefined;
    const comment = n.comment_id ? commentMap.get(n.comment_id) : undefined;
    // A Numo comment is stored under the triggering user's author_id (the row
    // belongs to them, the words don't) — the inbox names Numo, like the
    // timeline does, otherwise the requester reads "you commented".
    const fromNumo = !!comment?.via_assistant;
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
      issue_number: issue?.number ?? null,
      issue_title: issue?.title ?? null,
      objective_id: n.objective_id ?? null,
      objective_name: objective?.name ?? null,
      feedback_post_id: n.feedback_post_id ?? null,
      feedback_title: feedback?.title ?? null,
      project_id: n.project_id,
      project_key: project?.key ?? null,
      actor_name: fromNumo
        ? "Numo"
        : actor
          ? displayName(toNamed(actor))
          : null,
      // Le portrait suit le nom : pas de graine pour un acteur non humain
      // (Numo, agent MCP, Smart Assign), qui a sa propre marque côté client.
      actor_avatar_seed:
        !fromNumo && !viaMcp && n.actor_id
          ? (actorSeeds.get(n.actor_id as string) ?? null)
          : null,
      from_numo: fromNumo,
      via_mcp: viaMcp,
      api_key_agent: keyActor?.agent ?? null,
      api_key_name: keyActor?.name ?? null,
      via_smart_assign: !!n.via_smart_assign,
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
