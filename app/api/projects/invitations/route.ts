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
      // `status = 'pending'` does not say that an invitation is alive: nothing
      // reverts the expired ones to another status (MIN-197 sets `expires_at` to 30
      // days, purging `retention.ts` only clears at 90). Without this filter,
      // Dead invitation remains in the inbox for two months.
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });

  // The catch-up runs IN PARALLEL of the reading, not before: in the case
  // current - nothing to claim - it only costs an indexed probe which does not extend
  // no clock, and the reading is already good. It is only if he has attached
  // something that the first reading is out of date and we do it again.
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
    // The inbox shows the portrait of who is inviting: a name alone does not say
    // much about someone we have not joined yet.
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

  // Expired = not found. This is the ONLY place where exhalation decides a
  // access: `attachPendingInvitations` already respects it for addresses without
  // account, but an invitation born with its `invited_user_id` (the address had
  // already an account) never goes there — without this guard, it still accepts itself
  // thirty days after his death.
  const expired =
    invitation?.expires_at != null &&
    Date.parse(invitation.expires_at as string) <= Date.now();
  if (!invitation || invitation.status !== "pending" || expired) {
    return NextResponse.json({ error: t("invitationNotFound") }, { status: 404 });
  }
  if (invitation.invited_user_id !== auth.user.id) {
    return NextResponse.json({ error: t("invitationNotForYou") }, { status: 403 });
  }

  // Depth guard (MIN-325). The invitation line was editable by
  // his guest via PostgREST — `project_id` included — which was enough to
  // redirect an invitation to someone else's project and register there by
  // this road. The faulty policy is deleted (20261215090000), but a
  // policy is reintroduced by distraction: we recheck here that the line IS
  // the one that the application wrote.
  //
  // - the invited address is that of the account: an invitation is born either with
  // the `invited_user_id` of the account which bears this address, is attached
  // later on the VERIFIED email of the session — in both cases the
  // two columns designate the same person, and a discrepancy cannot
  // come only from a writing that is not ours;
  // - who invites owns the project: inviting is reserved for the owner
  // (`inviteMember`), therefore a `invited_by` which is not the owner of the
  // `project_id` of the line signs exactly the diverted invitation.
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
