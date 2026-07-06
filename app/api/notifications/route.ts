import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { displayName } from "@/lib/display-name";
import type { MyNotification } from "@/lib/types";

/** GET /api/notifications — the caller's notifications, hydrated for the Inbox. */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  // RLS scopes to the caller's own notifications.
  const { data: notifs, error } = await auth.supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[api/notifications] list failed:", error.message);
    return NextResponse.json({ error: "Erreur base de données" }, { status: 500 });
  }
  if (!notifs || notifs.length === 0) return NextResponse.json([]);

  // Hydrate issue / project / actor (service — the recipient may not be able to
  // read the actor's profile, and issue/project reads are simplest server-side).
  const service = getServiceClient();
  const issueIds = [...new Set(notifs.map((n) => n.issue_id).filter(Boolean))] as string[];
  const projectIds = [...new Set(notifs.map((n) => n.project_id).filter(Boolean))] as string[];
  const actorIds = [...new Set(notifs.map((n) => n.actor_id).filter(Boolean))] as string[];

  const [{ data: issues }, { data: projects }, { data: profiles }] = await Promise.all([
    issueIds.length
      ? service.from("issues").select("id, number, title").in("id", issueIds)
      : Promise.resolve({ data: [] as { id: string; number: number; title: string }[] }),
    projectIds.length
      ? service.from("projects").select("id, key").in("id", projectIds)
      : Promise.resolve({ data: [] as { id: string; key: string }[] }),
    actorIds.length
      ? service.from("profiles").select("id, email, full_name").in("id", actorIds)
      : Promise.resolve({ data: [] as { id: string; email: string | null; full_name: string | null }[] }),
  ]);

  const issueMap = new Map((issues ?? []).map((i) => [i.id, i]));
  const projectMap = new Map((projects ?? []).map((p) => [p.id, p]));
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  const result: MyNotification[] = notifs.map((n) => {
    const issue = n.issue_id ? issueMap.get(n.issue_id) : undefined;
    const project = n.project_id ? projectMap.get(n.project_id) : undefined;
    const actor = n.actor_id ? profileMap.get(n.actor_id) : undefined;
    return {
      id: n.id,
      type: n.type,
      read_at: n.read_at,
      created_at: n.created_at,
      issue_id: n.issue_id,
      issue_number: issue?.number ?? null,
      issue_title: issue?.title ?? null,
      project_id: n.project_id,
      project_key: project?.key ?? null,
      actor_name: actor ? displayName(actor) : null,
    };
  });

  return NextResponse.json(result);
}

/** PATCH /api/notifications — mark read. Body: { ids: string[] } or { all: true }. */
export async function PATCH(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  const { ids, all } = (body ?? {}) as { ids?: unknown; all?: unknown };
  const now = new Date().toISOString();

  // RLS restricts updates to the caller's own rows.
  let query = auth.supabase.from("notifications").update({ read_at: now }).is("read_at", null);
  if (all === true) {
    // no extra filter — all of my unread
  } else if (Array.isArray(ids) && ids.length > 0) {
    query = query.in("id", ids.filter((v): v is string => typeof v === "string"));
  } else {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const { error } = await query;
  if (error) {
    console.error("[api/notifications] mark read failed:", error.message);
    return NextResponse.json({ error: "Erreur base de données" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
