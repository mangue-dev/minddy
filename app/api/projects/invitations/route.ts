import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { fetchAuthUsersById, toNamed } from "@/lib/server/auth-users";
import { displayName } from "@/lib/display-name";
import type { MyInvitation } from "@/lib/types";

/** GET /api/projects/invitations — the caller's own pending invitations (Home banner). */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const service = getServiceClient();
  const { data: invites, error } = await service
    .from("project_invitations")
    .select("id, project_id, invited_by, created_at")
    .eq("invited_user_id", auth.user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[api/invitations] list failed:", error.message);
    return NextResponse.json({ error: "Erreur base de données" }, { status: 500 });
  }
  if (!invites || invites.length === 0) {
    return NextResponse.json([]);
  }

  // Hydrate project name/key + inviter identity (both need service-side reads:
  // the invitee can't yet SELECT the project, and user names come from auth).
  const projectIds = [...new Set(invites.map((i) => i.project_id as string))];
  const inviterIds = [...new Set(invites.map((i) => i.invited_by as string))];

  const [{ data: projects }, invitersById] = await Promise.all([
    service.from("projects").select("id, name, key").in("id", projectIds),
    fetchAuthUsersById(service, inviterIds),
  ]);

  const projectMap = new Map((projects ?? []).map((p) => [p.id as string, p]));

  const result: MyInvitation[] = invites.map((i) => {
    const project = projectMap.get(i.project_id as string);
    const inviter = invitersById.get(i.invited_by as string);
    const named = toNamed(inviter);
    return {
      id: i.id as string,
      project_id: i.project_id as string,
      project_name: (project?.name as string) ?? "Projet",
      project_key: (project?.key as string) ?? "",
      inviter_email: named.email,
      inviter_name: inviter ? displayName(named) : null,
      created_at: i.created_at as string,
    };
  });

  return NextResponse.json(result);
}

/** PATCH /api/projects/invitations — accept/reject one of the caller's invitations. */
export async function PATCH(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  const { invitationId, action } = (body ?? {}) as {
    invitationId?: string;
    action?: string;
  };
  if (!invitationId || (action !== "accept" && action !== "reject")) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const service = getServiceClient();
  const { data: invitation } = await service
    .from("project_invitations")
    .select("id, project_id, invited_by, invited_user_id, status")
    .eq("id", invitationId)
    .maybeSingle();

  if (!invitation || invitation.status !== "pending") {
    return NextResponse.json({ error: "Invitation introuvable." }, { status: 404 });
  }
  if (invitation.invited_user_id !== auth.user.id) {
    return NextResponse.json({ error: "Cette invitation ne t'est pas destinée." }, { status: 403 });
  }

  const now = new Date().toISOString();

  if (action === "accept") {
    const { error: memberError } = await service
      .from("project_members")
      .upsert(
        {
          project_id: invitation.project_id,
          user_id: auth.user.id,
          role: "member",
          added_by: invitation.invited_by,
        },
        { onConflict: "project_id,user_id" }
      );
    if (memberError) {
      console.error("[api/invitations] add member failed:", memberError.message);
      return NextResponse.json({ error: "Erreur base de données" }, { status: 500 });
    }
  }

  const { error: updateError } = await service
    .from("project_invitations")
    .update({
      status: action === "accept" ? "accepted" : "rejected",
      responded_at: now,
    })
    .eq("id", invitationId);
  if (updateError) {
    console.error("[api/invitations] respond failed:", updateError.message);
    return NextResponse.json({ error: "Erreur base de données" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    acceptedProjectId: action === "accept" ? invitation.project_id : null,
  });
}
