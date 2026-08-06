import "server-only";

import { createTranslator } from "next-intl";

import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import { getServiceClient } from "@/lib/supabase-service";
import { getProjectAccess } from "@/lib/server/project-access";
import {
  fetchAuthUsersById,
  findAuthUserByEmail,
  toNamed,
} from "@/lib/server/auth-users";
import { displayName } from "@/lib/display-name";
import { ensureMemberSlotAvailable } from "@/lib/server/entitlements";
import { isPlanLimitError } from "@/lib/server/plan-limit-error";
import { afterOrNow } from "@/lib/server/after-safe";
import { isPushConfigured } from "@/lib/server/push/vapid";
import { sendPushToUser } from "@/lib/server/push/send";
import type { Invitation } from "@/lib/types";

/**
 * Shared project-membership cores, used by /api/projects/[id]/members and the
 * assistant's member tools. Writes go through the service client (RLS bypassed),
 * so access is enforced HERE: inviting, cancelling an invitation and removing
 * another member are owner-only; a member may remove only themselves (leave).
 *
 * Invitations are in-app (no email is sent): an invite resolves the email to an
 * existing minddy account and inserts a pending row the invitee accepts from the
 * Home banner.
 */

type InviteError =
  | "projectNotFound"
  | "ownerOnlyInvite"
  | "invalidEmail"
  | "noAccountForEmail"
  | "alreadyOwner"
  | "alreadyMember"
  | "invitationAlreadyPending"
  | "memberLimitReached"
  | "databaseError";

export async function inviteMember({
  projectId,
  actorId,
  email,
}: {
  projectId: string;
  actorId: string;
  email: unknown;
}): Promise<
  | { ok: true; invitation: Invitation }
  | {
      ok: false;
      status: number;
      errorKey: InviteError;
      /** Valeurs du message quand sa clé porte un placeholder (`{limit}`). */
      errorParams?: Record<string, string | number>;
    }
> {
  const access = await getProjectAccess(actorId, projectId);
  if (!access) return { ok: false, status: 404, errorKey: "projectNotFound" };
  if (!access.isOwner) {
    return { ok: false, status: 403, errorKey: "ownerOnlyInvite" };
  }

  // Le plafond d'invités du plan, membres + invitations en attente (MIN-199).
  // L'acteur EST le owner : la branche `isOwner` ci-dessus l'a déjà établi.
  try {
    await ensureMemberSlotAvailable(actorId, projectId);
  } catch (err) {
    if (isPlanLimitError(err)) {
      return {
        ok: false,
        status: err.status,
        errorKey: "memberLimitReached",
        errorParams: err.params,
      };
    }
    throw err;
  }

  const normalized =
    typeof email === "string" ? email.trim().toLowerCase() : "";
  // 254 = longueur maximale d'une adresse (RFC 5321) — au-delà, ce n'est pas
  // un email, inutile d'interroger Supabase Auth avec.
  if (!normalized || normalized.length > 254 || !normalized.includes("@")) {
    return { ok: false, status: 400, errorKey: "invalidEmail" };
  }

  const service = getServiceClient();

  // Resolve the email to an existing minddy account — live, via Supabase Auth.
  const memberUser = await findAuthUserByEmail(service, normalized);
  if (!memberUser) {
    return { ok: false, status: 404, errorKey: "noAccountForEmail" };
  }
  if (memberUser.id === access.project.owner_id) {
    return { ok: false, status: 409, errorKey: "alreadyOwner" };
  }

  const { data: existingMember } = await service
    .from("project_members")
    .select("user_id")
    .eq("project_id", projectId)
    .eq("user_id", memberUser.id)
    .maybeSingle();
  if (existingMember) {
    return { ok: false, status: 409, errorKey: "alreadyMember" };
  }

  const { data: invitation, error } = await service
    .from("project_invitations")
    .insert({
      project_id: projectId,
      invited_email: normalized,
      invited_user_id: memberUser.id,
      invited_by: actorId,
      status: "pending",
    })
    .select("id, project_id, invited_email, invited_user_id, status, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, status: 409, errorKey: "invitationAlreadyPending" };
    }
    console.error("[members] invite failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }

  // Une invitation atterrit dans l'inbox SANS passer par `notifications` : elle
  // vit dans sa table, se répond au lieu de se lire, et disparaît une fois
  // répondue. Elle échappe donc au branchement push d'`insertNotifications`, et
  // c'est justement la ligne d'inbox qui attend le plus une notification — on
  // la pousse ici, à la main (MIN-183).
  pushInvitation(memberUser.id, actorId);

  return { ok: true, invitation: invitation as Invitation };
}

/** La notification système d'une invitation. Best-effort de bout en bout. */
function pushInvitation(inviteeId: string, inviterId: string): void {
  if (!isPushConfigured()) return;
  afterOrNow(async () => {
    const service = getServiceClient();
    const inviters = await fetchAuthUsersById(service, [inviterId]);
    const inviterName = displayName(toNamed(inviters.get(inviterId)), "");

    await sendPushToUser(service, inviteeId, (locale) => {
      const messages = locale === "fr" ? (fr as typeof en) : en;
      const t = createTranslator({ locale, messages, namespace: "Inbox" });
      return {
        // Le titre est le NOM DE LA CHOSE partout ailleurs (le ticket, le
        // retour) ; pour une invitation, la chose est l'inbox elle-même, où la
        // réponse se donne.
        title: t("groupInvitations"),
        body: t("lineInvitation", { actor: inviterName || t("someone") }),
        url: "/inbox",
        tag: "/inbox",
      };
    });
  });
}

/** Remove a member: the owner removes anyone, a member removes only themselves
    (leave). The owner is not a `project_members` row and cannot be removed. */
export async function removeMember({
  projectId,
  actorId,
  userId,
}: {
  projectId: string;
  actorId: string;
  userId: string;
}): Promise<
  | { ok: true }
  | {
      ok: false;
      status: number;
      errorKey: "projectNotFound" | "ownerOnly" | "cannotRemoveOwner" | "databaseError";
    }
> {
  const access = await getProjectAccess(actorId, projectId);
  if (!access) return { ok: false, status: 404, errorKey: "projectNotFound" };

  if (userId === access.project.owner_id) {
    return { ok: false, status: 400, errorKey: "cannotRemoveOwner" };
  }

  const isSelfLeave = userId === actorId;
  if (!access.isOwner && !isSelfLeave) {
    return { ok: false, status: 403, errorKey: "ownerOnly" };
  }

  const service = getServiceClient();
  const { error } = await service
    .from("project_members")
    .delete()
    .eq("project_id", projectId)
    .eq("user_id", userId);
  if (error) {
    console.error("[members] remove failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  return { ok: true };
}

/** Cancel a still-pending invitation (owner only). */
export async function cancelInvitation({
  projectId,
  actorId,
  invitationId,
}: {
  projectId: string;
  actorId: string;
  invitationId: string;
}): Promise<
  | { ok: true }
  | {
      ok: false;
      status: number;
      errorKey: "projectNotFound" | "ownerOnly" | "databaseError";
    }
> {
  const access = await getProjectAccess(actorId, projectId);
  if (!access) return { ok: false, status: 404, errorKey: "projectNotFound" };
  if (!access.isOwner) return { ok: false, status: 403, errorKey: "ownerOnly" };

  const service = getServiceClient();
  const { error } = await service
    .from("project_invitations")
    .update({ status: "cancelled", responded_at: new Date().toISOString() })
    .eq("id", invitationId)
    .eq("project_id", projectId)
    .eq("status", "pending");
  if (error) {
    console.error("[members] cancel invite failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  return { ok: true };
}

/** Pending invitations of a project (for the assistant's member reads). */
export async function listPendingInvitations(
  projectId: string
): Promise<Array<{ id: string; email: string; created_at: string }>> {
  const service = getServiceClient();
  const { data, error } = await service
    .from("project_invitations")
    .select("id, invited_email, created_at")
    .eq("project_id", projectId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[members] list invitations failed:", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.id as string,
    email: r.invited_email as string,
    created_at: r.created_at as string,
  }));
}
