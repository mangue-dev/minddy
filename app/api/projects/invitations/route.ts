import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { fetchAuthUsersById, toNamed } from "@/lib/server/auth-users";
import { fetchAvatarSeeds } from "@/lib/server/avatar-seeds";
import { displayName } from "@/lib/display-name";
import { claimPendingInvitationsLate } from "@/lib/server/members";
import type { MyInvitation } from "@/lib/types";

/** GET /api/projects/invitations — the caller's own pending invitations (Home banner). */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const service = getServiceClient();
  const listMine = () =>
    service
      .from("project_invitations")
      .select("id, project_id, invited_by, created_at")
      .eq("invited_user_id", auth.user.id)
      .eq("status", "pending")
      // `status = 'pending'` ne dit pas qu'une invitation est vivante : rien ne
      // repasse les périmées à un autre statut (MIN-197 pose `expires_at` à 30
      // jours, la purge de `retention.ts` n'efface qu'à 90). Sans ce filtre, une
      // invitation morte reste dans l'inbox pendant deux mois.
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });

  // Le rattrapage tourne EN PARALLÈLE de la lecture, pas avant : dans le cas
  // courant — rien à réclamer — il ne coûte qu'une sonde indexée qui ne rallonge
  // aucune horloge, et la lecture est déjà bonne. Ce n'est que s'il a rattaché
  // quelque chose que la première lecture est périmée et qu'on la refait.
  const [claimed, first] = await Promise.all([
    claimPendingInvitationsLate(auth.user),
    listMine(),
  ]);
  const { data: invites, error } = claimed ? await listMine() : first;

  if (error) {
    console.error("[api/invitations] list failed:", error.message);
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  if (!invites || invites.length === 0) {
    return NextResponse.json([]);
  }

  // Hydrate project name/key + inviter identity (both need service-side reads:
  // the invitee can't yet SELECT the project, and user names come from auth).
  const projectIds = [...new Set(invites.map((i) => i.project_id as string))];
  const inviterIds = [...new Set(invites.map((i) => i.invited_by as string))];

  const [{ data: projects }, invitersById, seeds] = await Promise.all([
    service.from("projects").select("id, name, key").in("id", projectIds),
    fetchAuthUsersById(service, inviterIds),
    // L'inbox montre le portrait de qui invite : un nom seul ne dit pas
    // grand-chose de quelqu'un qu'on n'a pas encore rejoint.
    fetchAvatarSeeds(service, inviterIds),
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
      inviter_avatar_seed: seeds.get(i.invited_by as string) ?? null,
      created_at: i.created_at as string,
    };
  });

  return NextResponse.json(result);
}

/** PATCH /api/projects/invitations — accept/reject one of the caller's invitations. */
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
  const { invitationId, action } = (body ?? {}) as {
    invitationId?: string;
    action?: string;
  };
  if (!invitationId || (action !== "accept" && action !== "reject")) {
    return NextResponse.json({ error: t("invalidRequest") }, { status: 400 });
  }

  const service = getServiceClient();
  const { data: invitation } = await service
    .from("project_invitations")
    .select(
      "id, project_id, invited_by, invited_user_id, invited_email, status, expires_at"
    )
    .eq("id", invitationId)
    .maybeSingle();

  // Périmée = introuvable. C'est le SEUL endroit où l'expiration décide d'un
  // accès : `attachPendingInvitations` la respecte déjà pour les adresses sans
  // compte, mais une invitation née avec son `invited_user_id` (l'adresse avait
  // déjà un compte) n'y passe jamais — sans cette garde, elle s'accepte encore
  // trente jours après sa mort.
  const expired =
    invitation?.expires_at != null &&
    Date.parse(invitation.expires_at as string) <= Date.now();
  if (!invitation || invitation.status !== "pending" || expired) {
    return NextResponse.json({ error: t("invitationNotFound") }, { status: 404 });
  }
  if (invitation.invited_user_id !== auth.user.id) {
    return NextResponse.json({ error: t("invitationNotForYou") }, { status: 403 });
  }

  // Garde en profondeur (MIN-325). La ligne d'invitation était modifiable par
  // son invité via PostgREST — `project_id` compris — ce qui suffisait à
  // rediriger une invitation vers le projet d'un autre et à s'y inscrire par
  // cette route. La policy fautive est supprimée (20261215090000), mais une
  // policy se réintroduit par distraction : on revérifie ici que la ligne EST
  // celle que l'application a écrite.
  //
  //   - l'adresse invitée est celle du compte : une invitation naît soit avec
  //     l'`invited_user_id` du compte qui porte cette adresse, soit rattachée
  //     plus tard sur l'email VÉRIFIÉ de la session — dans les deux cas les
  //     deux colonnes désignent la même personne, et une divergence ne peut
  //     venir que d'une écriture qui n'est pas la nôtre ;
  //   - qui invite possède le projet : inviter est réservé au owner
  //     (`inviteMember`), donc un `invited_by` qui n'est pas l'owner du
  //     `project_id` de la ligne signe exactement l'invitation détournée.
  const sessionEmail = auth.user.email?.trim().toLowerCase();
  const invitedEmail = (invitation.invited_email as string | null)
    ?.trim()
    .toLowerCase();
  if (!sessionEmail || !invitedEmail || sessionEmail !== invitedEmail) {
    return NextResponse.json({ error: t("invitationNotForYou") }, { status: 403 });
  }

  const now = new Date().toISOString();

  if (action === "accept") {
    const { data: project } = await service
      .from("projects")
      .select("owner_id")
      .eq("id", invitation.project_id)
      .maybeSingle();
    if (!project || project.owner_id !== invitation.invited_by) {
      return NextResponse.json(
        { error: t("invitationNotForYou") },
        { status: 403 }
      );
    }

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
      return NextResponse.json({ error: t("databaseError") }, { status: 500 });
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
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    acceptedProjectId: action === "accept" ? invitation.project_id : null,
  });
}
