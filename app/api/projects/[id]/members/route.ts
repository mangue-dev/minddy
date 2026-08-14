import { NextResponse, type NextRequest } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { canonicalAppOrigin } from "@/lib/server/app-origin";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import { getServiceClient } from "@/lib/supabase-service";
import { fetchAuthUsersById, toNamed } from "@/lib/server/auth-users";
import { fetchAvatarSeeds } from "@/lib/server/avatar-seeds";
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
        // Sans `invited_user_id` : le rendre au client dirait quelles adresses
        // ont un compte minddy (cf. le type `Invitation`).
        .select("id, project_id, invited_email, status, created_at")
        .eq("project_id", id)
        .eq("status", "pending")
        // Les périmées sortent de la liste comme elles sortent du décompte de
        // `ensureMemberSlotAvailable` : le compteur d'invités de l'écran se
        // calcule sur CETTE liste (`project-members.tsx`), les deux doivent
        // compter la même chose ou le formulaire se désarme pour rien.
        .gt("expires_at", new Date().toISOString())
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

  const memberIds = [ownerId, ...(memberRows ?? []).map((m) => m.user_id as string)];
  const [usersById, seeds] = await Promise.all([
    fetchAuthUsersById(service, memberIds),
    fetchAvatarSeeds(service, memberIds),
  ]);

  const members: Member[] = [
    {
      user_id: ownerId,
      ...toNamed(usersById.get(ownerId)),
      avatar_seed: seeds.get(ownerId) ?? ownerId,
      role: "owner",
      is_owner: true,
    },
    ...(memberRows ?? []).map((m) => ({
      user_id: m.user_id as string,
      ...toNamed(usersById.get(m.user_id as string)),
      avatar_seed: seeds.get(m.user_id as string) ?? (m.user_id as string),
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

/** POST /api/projects/[id]/members — owner invites by email. L'adresse n'a pas
    besoin d'avoir un compte minddy (MIN-197) : un email d'invitation part, et
    l'inscription depuis ce lien rattache la personne au projet. */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  // 20/min et pas les 60 par défaut. Ce que la route écrit se compte sur les
  // doigts : le plan plafonne à 2 invités (Free) ou 5 (Go), et même un projet
  // Pro qui embarque toute une équipe le fait à la main, un formulaire à la
  // fois — 20 par minute, c'est déjà une invitation toutes les 3 secondes sans
  // relâche. Au-delà, ce n'est plus quelqu'un qui invite.
  const rl = checkSessionRateLimit(auth.user.id, "project-members-write", {
    limit: 20,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests", retry_after: rl.retryAfter },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }
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
    // Le lien du mail doit ramener sur CE déploiement (dev, preview, prod) —
    // sinon un test en local envoie l'invité sur la production. Il se lit dans
    // l'ENVIRONNEMENT et pas dans la requête (MIN-351) : `X-Forwarded-Host` est
    // choisi par l'appelant, et le jeton d'acceptation partait donc vers le
    // domaine que celui-ci désignait, dans un e-mail expédié par nous.
    origin: canonicalAppOrigin(),
    // On ne connaît pas la langue de l'invité : on prend celle de l'invitant,
    // qui est la personne dont il attend le message.
    locale: (await getLocale()) === "fr" ? "fr" : "en",
  });
  if (!result.ok) {
    // `errorParams` porte le `{limit}` de `memberLimitReached` : un message à
    // placeholder appelé sans ses valeurs afficherait son chemin de clé.
    return NextResponse.json(
      { error: t(result.errorKey, result.errorParams) },
      { status: result.status }
    );
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
