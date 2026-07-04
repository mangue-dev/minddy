import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import { getServiceClient } from "@/lib/supabase-service";
import type { Invitation, Member } from "@/lib/types";

type RouteContext = { params: Promise<{ id: string }> };

interface ProfileRow {
  id: string;
  email: string | null;
  full_name: string | null;
}

async function hydrateProfiles(ids: string[]): Promise<Map<string, ProfileRow>> {
  const map = new Map<string, ProfileRow>();
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return map;
  const { data } = await getServiceClient()
    .from("profiles")
    .select("id, email, full_name")
    .in("id", unique);
  for (const row of (data ?? []) as ProfileRow[]) map.set(row.id, row);
  return map;
}

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

  const profiles = await hydrateProfiles([
    access.project.owner_id,
    ...(memberRows ?? []).map((m) => m.user_id as string),
  ]);

  const ownerProfile = profiles.get(access.project.owner_id);
  const members: Member[] = [
    {
      user_id: access.project.owner_id,
      email: ownerProfile?.email ?? null,
      full_name: ownerProfile?.full_name ?? null,
      role: "owner",
      is_owner: true,
    },
    ...(memberRows ?? []).map((m) => {
      const p = profiles.get(m.user_id as string);
      return {
        user_id: m.user_id as string,
        email: p?.email ?? null,
        full_name: p?.full_name ?? null,
        role: "member" as const,
        is_owner: false,
      };
    }),
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

  // Resolve the email to an existing minddy account.
  const { data: profile } = await service
    .from("profiles")
    .select("id, email")
    .ilike("email", normalized)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json(
      { error: "Aucun compte minddy avec cet email." },
      { status: 404 }
    );
  }
  if (profile.id === access.project.owner_id) {
    return NextResponse.json(
      { error: "Tu es déjà le propriétaire de ce Projet." },
      { status: 409 }
    );
  }

  const { data: existingMember } = await service
    .from("project_members")
    .select("user_id")
    .eq("project_id", id)
    .eq("user_id", profile.id)
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
      invited_user_id: profile.id,
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
