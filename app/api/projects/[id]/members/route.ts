import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
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

  const access = await getProjectAccess(auth.user.id, id);
  if (!access) {
    return NextResponse.json({ error: t("projectNotFound") }, { status: 404 });
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
