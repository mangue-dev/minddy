import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import {
  insertNotifications,
  projectMemberIds,
  type NotificationRow,
} from "@/lib/server/notifications";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/issues/[id]/comments — the issue's comment thread (RLS: project access). */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.supabase
    .from("comments")
    .select("*")
    .eq("issue_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[api/comments] list failed:", error.message);
    return NextResponse.json({ error: "Erreur base de données" }, { status: 500 });
  }
  return NextResponse.json(data);
}

/** POST /api/issues/[id]/comments — add a comment (author = caller). */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  const input = (body ?? {}) as { body?: unknown; mentioned_user_ids?: unknown };
  const text = typeof input.body === "string" ? input.body.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "Le commentaire est vide." }, { status: 400 });
  }
  const mentioned = Array.isArray(input.mentioned_user_ids)
    ? input.mentioned_user_ids.filter((v): v is string => typeof v === "string")
    : [];

  const { data, error } = await auth.supabase
    .from("comments")
    .insert({ issue_id: id, author_id: auth.user.id, body: text })
    .select("*")
    .single();

  if (error) {
    console.error("[api/comments] create failed:", error.message);
    return NextResponse.json({ error: "Erreur base de données" }, { status: 500 });
  }

  // Notifications: @mentions + "comment on an issue I own/am assigned".
  const service = getServiceClient();
  const { data: issue } = await service
    .from("issues")
    .select("project_id, created_by, assignee_id")
    .eq("id", id)
    .maybeSingle();
  if (issue) {
    const valid = await projectMemberIds(service, issue.project_id as string);
    const author = auth.user.id;

    const mentionSet = new Set(
      mentioned.filter((uid) => uid !== author && valid.has(uid))
    );
    const commentSet = new Set<string>();
    for (const uid of [issue.created_by, issue.assignee_id] as (string | null)[]) {
      if (uid && uid !== author && valid.has(uid) && !mentionSet.has(uid)) {
        commentSet.add(uid);
      }
    }

    const rows: NotificationRow[] = [
      ...[...mentionSet].map((uid) => ({
        user_id: uid,
        project_id: issue.project_id as string,
        type: "mention" as const,
        issue_id: id,
        comment_id: data.id as string,
        actor_id: author,
      })),
      ...[...commentSet].map((uid) => ({
        user_id: uid,
        project_id: issue.project_id as string,
        type: "comment" as const,
        issue_id: id,
        comment_id: data.id as string,
        actor_id: author,
      })),
    ];
    await insertNotifications(service, rows);
  }

  return NextResponse.json(data, { status: 201 });
}
