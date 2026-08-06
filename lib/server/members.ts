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
import { sendInvitationEmail } from "@/lib/server/invitation-email";
import type { Invitation } from "@/lib/types";

/**
 * Shared project-membership cores, used by /api/projects/[id]/members and the
 * assistant's member tools. Writes go through the service client (RLS bypassed),
 * so access is enforced HERE: inviting, cancelling an invitation and removing
 * another member are owner-only; a member may remove only themselves (leave).
 *
 * **On invite une ADRESSE, pas un compte** (MIN-197). L'invitation est une ligne
 * `project_invitations` que l'invité accepte depuis son inbox ; elle peut naître
 * sans `invited_user_id` quand l'adresse n'a pas encore de compte minddy, et se
 * rattache à un compte plus tard — à la première session dont l'email vérifié
 * correspond (`attachPendingInvitations`, appelé par /auth/callback). Un email
 * part dans les deux cas : c'est le seul canal qui atteigne quelqu'un qui ne
 * revient pas de lui-même.
 *
 * On ne fait JAMAIS rejoindre automatiquement : l'acceptation reste un geste de
 * l'invité (PATCH /api/projects/invitations).
 */

type InviteError =
  | "projectNotFound"
  | "ownerOnlyInvite"
  | "invalidEmail"
  | "alreadyOwner"
  | "alreadyMember"
  | "invitationAlreadyPending"
  | "memberLimitReached"
  | "databaseError";

export async function inviteMember({
  projectId,
  actorId,
  email,
  origin,
  locale = "en",
}: {
  projectId: string;
  actorId: string;
  email: unknown;
  /** Origine du déploiement, pour le lien du mail. Défaut : l'URL canonique. */
  origin?: string;
  /** Langue du mail. On ne connaît pas celle de l'invité — on prend celle de
      l'invitant, qui est la personne dont l'invité attend le message. */
  locale?: "fr" | "en";
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
  // `null` n'est plus une fin de non-recevoir (MIN-197) : l'invitation part
  // quand même, sans `invited_user_id`, et le mail fait le reste.
  const memberUser = await findAuthUserByEmail(service, normalized);
  if (memberUser) {
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
  }

  const { data: invitation, error } = await service
    .from("project_invitations")
    .insert({
      project_id: projectId,
      invited_email: normalized,
      invited_user_id: memberUser?.id ?? null,
      invited_by: actorId,
      status: "pending",
    })
    .select(
      "id, project_id, invited_email, invited_user_id, status, created_at, token"
    )
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
  if (memberUser) pushInvitation(memberUser.id, actorId);

  // Le mail part APRÈS la réponse, mais par `afterOrNow` : une promesse
  // détachée serait gelée avec l'invocation et mourrait en vol (CLAUDE.md).
  const { token, ...row } = invitation as Invitation & { token: string };
  afterOrNow(async () => {
    const inviters = await fetchAuthUsersById(getServiceClient(), [actorId]);
    const named = toNamed(inviters.get(actorId));
    await sendInvitationEmail({
      to: normalized,
      inviterName: displayName(named, ""),
      projectName: access.project.name,
      token,
      locale,
      origin,
    });
  });

  // Le token ne ressort PAS de la fonction : l'appelant le rendrait en JSON à
  // qui invite, et il n'a rien à y faire — c'est un secret de l'email.
  return { ok: true, invitation: row };
}

/**
 * Rattache à un compte les invitations laissées en attente sur son adresse
 * (MIN-197). Appelé à l'arrivée d'une session (/auth/callback) : c'est le seul
 * endroit où l'email est VÉRIFIÉ par Supabase, et c'est l'email — pas le token
 * du lien — qui fait foi. Best-effort de bout en bout : l'invitant ne saura
 * rien d'un échec, et l'invité retentera à sa prochaine session.
 */
export async function attachPendingInvitations(user: {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
}): Promise<void> {
  const email = user.email?.trim().toLowerCase();
  // Un email non confirmé n'établit rien : sans cette garde, il suffirait de
  // s'inscrire avec l'adresse de quelqu'un d'autre pour récupérer ses
  // invitations. OAuth (Google/GitHub) rend un email déjà confirmé.
  if (!email || !user.email_confirmed_at) return;

  const service = getServiceClient();
  const { data, error } = await service
    .from("project_invitations")
    .update({ invited_user_id: user.id })
    .eq("invited_email", email)
    .is("invited_user_id", null)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .select("id, invited_by");

  if (error) {
    console.error("[members] attach invitations failed:", error.message);
    return;
  }
  for (const row of data ?? []) {
    pushInvitation(user.id, row.invited_by as string);
  }
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
