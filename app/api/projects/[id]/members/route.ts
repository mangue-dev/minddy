import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import { getServiceClient } from "@/lib/supabase-service";
import {
  fetchAuthUsersById,
  findAuthUserByEmail,
  toNamed,
} from "@/lib/server/auth-users";
import type { Invitation, Member } from "@/lib/types";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/projects/[id]/members — members + pending invitations (any accessible user). */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const access = await getProjectAccess(auth.user.id, id);
  if (!access) {
    return NextResponse.json({ error: "Projet introuvable" }, { status: 404 });
  }

  const service = getServiceClient();
  const [{ data: memberRows }, { data: inviteRows }] = await Promise.all([
    service
      .from("project_members")
      .select("user_id, role, created_at")
      .eq("project_id", id)
      .order("created_at", { ascending: true }),
    service
      .from("project_invitations")
      .select("id, project_id, invited_email, invited_user_id, status, created_at")
      .eq("project_id", id)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
  ]);

  const usersById = await fetchAuthUsersById(service, [
    access.project.owner_id,
    ...(memberRows ?? []).map((m) => m.user_id as string),
  ]);

  const members: Member[] = [
    {
      user_id: access.project.owner_id,
      ...toNamed(usersById.get(access.project.owner_id)),
      role: "owner",
      is_owner: true,
    },
    ...(memberRows ?? []).map((m) => ({
      user_id: m.user_id as string,
      ...toNamed(usersById.get(m.user_id as string)),
      role: "member" as const,
      is_owner: false,
    })),
  ];

  return NextResponse.json({
    members,
    invitations: (inviteRows ?? []) as Invitation[],
    isOwner: access.isOwner,
  });
}

/** POST /api/projects/[id]/members — owner invites by email (in-app, no email sent). */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const access = await getProjectAccess(auth.user.id, id);
  if (!access) {
    return NextResponse.json({ error: "Projet introuvable" }, { status: 404 });
  }
  if (!access.isOwner) {
    return NextResponse.json(
      { error: "Seul le propriétaire peut inviter." },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  const email = ((body as { email?: unknown })?.email ?? "");
  const normalized = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!normalized || !normalized.includes("@")) {
    return NextResponse.json({ error: "Email invalide." }, { status: 400 });
  }

  const service = getServiceClient();

  // Resolve the email to an existing minddy account — live, via Supabase Auth.
  const memberUser = await findAuthUserByEmail(service, normalized);

  if (!memberUser) {
    return NextResponse.json(
      { error: "Aucun compte minddy avec cet email." },
      { status: 404 }
    );
  }
  if (memberUser.id === access.project.owner_id) {
    return NextResponse.json(
      { error: "Tu es déjà le propriétaire de ce Projet." },
      { status: 409 }
    );
  }

  const { data: existingMember } = await service
    .from("project_members")
    .select("user_id")
    .eq("project_id", id)
    .eq("user_id", memberUser.id)
    .maybeSingle();
  if (existingMember) {
    return NextResponse.json(
      { error: "Cette personne est déjà membre." },
      { status: 409 }
    );
  }

  const { data: invitation, error } = await service
    .from("project_invitations")
    .insert({
      project_id: id,
      invited_email: normalized,
      invited_user_id: memberUser.id,
      invited_by: auth.user.id,
      status: "pending",
    })
    .select("id, project_id, invited_email, invited_user_id, status, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Une invitation est déjà en attente pour cet email." },
        { status: 409 }
      );
    }
    console.error("[api/members] invite failed:", error.message);
    return NextResponse.json({ error: "Erreur base de données" }, { status: 500 });
  }

  return NextResponse.json(invitation, { status: 201 });
}

/** DELETE /api/projects/[id]/members?invitationId=… | ?userId=… */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const access = await getProjectAccess(auth.user.id, id);
  if (!access) {
    return NextResponse.json({ error: "Projet introuvable" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const invitationId = searchParams.get("invitationId");
  const userId = searchParams.get("userId");
  const service = getServiceClient();

  // Cancel a pending invitation (owner only).
  if (invitationId) {
    if (!access.isOwner) {
      return NextResponse.json({ error: "Réservé au propriétaire." }, { status: 403 });
    }
    const { error } = await service
      .from("project_invitations")
      .update({ status: "cancelled", responded_at: new Date().toISOString() })
      .eq("id", invitationId)
      .eq("project_id", id)
      .eq("status", "pending");
    if (error) {
      console.error("[api/members] cancel invite failed:", error.message);
      return NextResponse.json({ error: "Erreur base de données" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // Remove a member — owner removes anyone, a member removes themselves (leave).
  if (userId) {
    const isSelfLeave = userId === auth.user.id;
    if (!access.isOwner && !isSelfLeave) {
      return NextResponse.json({ error: "Réservé au propriétaire." }, { status: 403 });
    }
    const { error } = await service
      .from("project_members")
      .delete()
      .eq("project_id", id)
      .eq("user_id", userId);
    if (error) {
      console.error("[api/members] remove member failed:", error.message);
      return NextResponse.json({ error: "Erreur base de données" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Paramètre manquant." }, { status: 400 });
}
