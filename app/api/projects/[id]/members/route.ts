import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { fetchAuthUsersById, toNamed } from "@/lib/server/auth-users";
import {
  cancelInvitation,
  inviteMember,
  removeMember,
} from "@/lib/server/members";
import type { Invitation, Member } from "@/lib/types";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/projects/[id]/members — members + pending invitations (any accessible user). */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const service = getServiceClient();
  // Un seul lot parallèle : projet (owner + deleted_at), membres, invitations.
  // L'accès se déduit du projet + de la liste de membres déjà chargée — plus de
  // second SELECT project_members (ce que faisait getProjectAccess), et plus de
  // phase séquentielle avant les reads.
  const [{ data: project }, { data: memberRows }, { data: inviteRows }] =
    await Promise.all([
      service
        .from("projects")
        .select("owner_id, deleted_at")
        .eq("id", id)
        .maybeSingle(),
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

  // Accès = projet vivant ET (propriétaire OU présent dans la liste de membres).
  if (!project || project.deleted_at) {
    return NextResponse.json({ error: t("projectNotFound") }, { status: 404 });
  }
  const ownerId = project.owner_id as string;
  const isOwner = ownerId === auth.user.id;
  const isMember =
    isOwner || (memberRows ?? []).some((m) => m.user_id === auth.user.id);
  if (!isMember) {
    return NextResponse.json({ error: t("projectNotFound") }, { status: 404 });
  }

  const usersById = await fetchAuthUsersById(service, [
    ownerId,
    ...(memberRows ?? []).map((m) => m.user_id as string),
  ]);

  const members: Member[] = [
    {
      user_id: ownerId,
      ...toNamed(usersById.get(ownerId)),
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
    isOwner,
  });
}

/** POST /api/projects/[id]/members — owner invites by email (in-app, no email sent). */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }

  const result = await inviteMember({
    projectId: id,
    actorId: auth.user.id,
    email: (body as { email?: unknown })?.email,
  });
  if (!result.ok) {
    return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
  }
  return NextResponse.json(result.invitation, { status: 201 });
}

/** DELETE /api/projects/[id]/members?invitationId=… | ?userId=… */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const { searchParams } = new URL(request.url);
  const invitationId = searchParams.get("invitationId");
  const userId = searchParams.get("userId");

  // Cancel a pending invitation (owner only).
  if (invitationId) {
    const result = await cancelInvitation({
      projectId: id,
      actorId: auth.user.id,
      invitationId,
    });
    if (!result.ok) {
      return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
    }
    return NextResponse.json({ ok: true });
  }

  // Remove a member — owner removes anyone, a member removes themselves (leave).
  if (userId) {
    const result = await removeMember({
      projectId: id,
      actorId: auth.user.id,
      userId,
    });
    if (!result.ok) {
      return NextResponse.json({ error: t(result.errorKey) }, { status: result.status });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: t("missingParameter") }, { status: 400 });
}
