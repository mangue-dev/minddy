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
import { isApnsConfigured } from "@/lib/server/push/apns";
import { sendPushToUser } from "@/lib/server/push/send";
import { sendInvitationEmail } from "@/lib/server/invitation-email";
import { capability } from "@/lib/server/capabilities";
import type { Invitation } from "@/lib/types";

/**
 * Shared project-membership cores, used by /api/projects/[id]/members and the
 * assistant's member tools. Writes go through the customer service (RLS bypassed),
 * so access is enforced HERE: inviting, canceling an invitation and removing
 * another member are owner-only; a member may remove only themselves (leave).
 *
 * **We invite an ADDRESS, not an account** (MIN-197). The invitation is a line
 * `project_invitations` that the guest accepts from his inbox; it can be born
 * without `invited_user_id` when the address does not yet have a minddy account, and gets
 * attached to an account later — at the first session whose verified email
 * matches (`attachPendingInvitations`, called by /auth/callback). Email delivery
 * is best-effort and optional: without an email provider, the invitation remains
 * available in the in-app inbox once that verified account exists.
 *
 * We NEVER join automatically: acceptance remains a gesture from
 * the guest (PATCH /api/projects/invitations).
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
  /** Origin of the deployment, for the email link. Default: the canonical URL. */
  origin?: string;
  /** Email language. We do not know that of the guest — we take that of
 the inviter, who is the person from whom the guest is waiting for the message. */
  locale?: "fr" | "en";
}): Promise<
  | { ok: true; invitation: Invitation }
  | {
      ok: false;
      status: number;
      errorKey: InviteError;
      /** Values ​​of the message when its key carries a placeholder (`{limit}`). */
      errorParams?: Record<string, string | number>;
    }
> {
  const access = await getProjectAccess(actorId, projectId);
  if (!access) return { ok: false, status: 404, errorKey: "projectNotFound" };
  if (!access.isOwner) {
    return { ok: false, status: 403, errorKey: "ownerOnlyInvite" };
  }

  // The plan's guest cap, members + pending invitations (MIN-199).
  // The actor IS the owner: the `isOwner` branch above has already established this.
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
  // 254 = maximum length of an address (RFC 5321) — beyond that, it is not
  // an email, no need to query Supabase Auth with it.
  if (!normalized || normalized.length > 254 || !normalized.includes("@")) {
    return { ok: false, status: 400, errorKey: "invalidEmail" };
  }

  const service = getServiceClient();

  // Resolve the email to an existing minddy account — live, via Supabase Auth.
  // `null` is no longer a rejection (MIN-197): the invitation goes out
  // anyway, without `invited_user_id`, and the email does the rest.
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

  // An outdated invitation for this address still holds its place in the index
  // unique partiel `(project_id, invited_email) where status = 'pending'` : sans
  //this household, inserting below would make 409 “invitation already pending”
  // for an invitation that no one can see or accept anymore — the address
  // would be banned from the project until the 90 day purge (`retention.ts`).
  // Deleted rather than passed to `cancelled`: the line no longer has a reader, and
  // `RETENTION_DAYS.pendingInvitations` already says that an address which has never
  // joined is not kept “without purpose”.
  await service
    .from("project_invitations")
    .delete()
    .eq("project_id", projectId)
    .eq("invited_email", normalized)
    .eq("status", "pending")
    .lte("expires_at", new Date().toISOString());

  const { data: invitation, error } = await service
    .from("project_invitations")
    .insert({
      project_id: projectId,
      invited_email: normalized,
      invited_user_id: memberUser?.id ?? null,
      invited_by: actorId,
      status: "pending",
    })
    .select("id, project_id, invited_email, status, created_at, token")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, status: 409, errorKey: "invitationAlreadyPending" };
    }
    console.error("[members] invite failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }

  // An invitation lands in the inbox WITHOUT going through `notifications`: it
  // lives in his table, responds instead of reading himself, and disappears once
  // answered. It therefore escapes the push connection of `insertNotifications`, and
  // it’s precisely the inbox line that most expects a notification — we
  // push it here, by hand (MIN-183).
  if (memberUser) pushInvitation(memberUser.id, actorId);

  // Email delivery, when configured, happens AFTER the response via `afterOrNow`:
  // a detached promise could be frozen with the invocation and die in flight
  // (CLAUDE.md). The durable invitation does not depend on this best-effort
  // delivery and still attaches to the recipient's in-app inbox.
  //
  // The rendered line is RECOMPOSED field by field, and not obtained by subtracting
  // the token of a `...row`: two columns have nothing to do in the response —
  // the `token`, secret of the email, and `invited_user_id`, which would say if the address
  // has a minddy account. A whitelist keeps them both, including
  // the columns that the table will gain later; a restrictive `select`, he
  // allows itself to be expanded by a word without anything indicating it.
  const raw = invitation as Invitation & { token: string };
  const row: Invitation = {
    id: raw.id,
    project_id: raw.project_id,
    invited_email: raw.invited_email,
    status: raw.status,
    created_at: raw.created_at,
  };
  const consoleEmail =
    process.env.EMAIL_PROVIDER?.trim() === "console" &&
    process.env.NODE_ENV !== "production";
  if (capability("transactionalEmail").configured || consoleEmail) {
    const token = raw.token;
    afterOrNow(async () => {
      const inviters = await fetchAuthUsersById(getServiceClient(), [actorId]);
      const named = toNamed(inviters.get(actorId));
      await sendInvitationEmail({
        to: normalized,
        inviterName: displayName(named, ""),
        projectName: access.project.name,
        projectId: access.project.id,
        projectOrbSeed: access.project.orb_seed,
        projectIconUrl: access.project.icon_url,
        token,
        locale,
        origin,
      });
    });
  }

  // The token does NOT come out of the function: the caller would return it in JSON to
  // who invites, and he has nothing to do about it — it's a secret of the email.
  return { ok: true, invitation: row };
}

/**
 * Attaches invitations left pending on its address
 * to an account (MIN-197). Called at the arrival of a session (/auth/callback), where the email is
 * VERIFIED by Supabase — and it is the email, not the link token, which is authentic.
 * Best-effort end-to-end: the inviter will know nothing of a failure, and the invitee
 * will try again the next time session (`claimPendingInvitationsLate`).
 */
export async function attachPendingInvitations(user: {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
}): Promise<void> {
  const email = user.email?.trim().toLowerCase();
  // An unconfirmed email establishes nothing: without this guard, it would be enough to
  // register with someone else's address to retrieve their
  // invitations. OAuth (Google/GitHub) returns an already confirmed email.
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

/**
 * Catch-up (MIN-197). `/auth/callback` is NOT traversed by any session:
 * a password connection never passes through it. The case happens for real —
 * the recipient's email antivirus visits the confirmation link before
 * him, GoTrue confirms the account, the person ends up on /login with
 * `confirmation_failed` (MIN-117) and logs in by password. Her invitation
 * is then never claimed: she dies at 30 days old without anyone seeing her.
 *
 * Called upon reading someone's invitations — the only place where
 * the lack of attachment is visible.
 *
 * **The email verification is repeated here, on the service side.** The `user` that
 * `getAuthedUser` renders is reconstructed from the JWT claims and does not carry
 * `email_confirmed_at`; as for `user_metadata.email_verified`, it is
 * MODIFIABLE by the account itself (`auth.updateUser({ data })`) and does not prove
 * therefore nothing. We reread the account using the admin API, of which `fetchAuthUsersById` serves
 * a 60 s cache — otherwise the guard of `attachPendingInvitations` would be a silent no-op, or worse, a guard that we believe is held.
 *
 * A read probe first, so as not to pay for either the admin round trip or a
 * UPDATE in the common case, which is "there is nothing to claim."
 *
 * @returns `true` if something could be attached — the caller rereads then.
 */
export async function claimPendingInvitationsLate(user: {
  id: string;
  email?: string | null;
}): Promise<boolean> {
  const email = user.email?.trim().toLowerCase();
  if (!email) return false;

  const service = getServiceClient();
  const { data: waiting, error } = await service
    .from("project_invitations")
    .select("id")
    .eq("invited_email", email)
    .is("invited_user_id", null)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .limit(1);

  if (error) {
    console.error("[members] late claim probe failed:", error.message);
    return false;
  }
  if (!waiting || waiting.length === 0) return false;

  const account = (await fetchAuthUsersById(service, [user.id])).get(user.id);
  if (!account) return false;
  await attachPendingInvitations(account);
  return true;
}

/** The system notification of an invitation. Best-effort from start to finish. */
function pushInvitation(inviteeId: string, inviterId: string): void {
  if (!isPushConfigured() && !isApnsConfigured()) return;
  afterOrNow(async () => {
    const service = getServiceClient();
    const inviters = await fetchAuthUsersById(service, [inviterId]);
    const inviterName = displayName(toNamed(inviters.get(inviterId)), "");

    await sendPushToUser(service, inviteeId, (locale) => {
      const messages = locale === "fr" ? (fr as typeof en) : en;
      const t = createTranslator({ locale, messages, namespace: "Inbox" });
      return {
        // The title is the NAME OF THE THING everywhere else (the ticket, the
        // back) ; for an invitation, the thing is the inbox itself, where the
        // response is given.
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

  // Membership is the authority behind every active agent run. Revoke it in
  // the same lifecycle operation; the control plane also rechecks on each
  // later request in case membership changed outside this path.
  const { revokeMemberAgentAuthority } = await import("./agent/control-plane");
  await revokeMemberAgentAuthority({ projectId, userId }).catch((revocationError) => {
    console.error("[members] active agent authority revocation failed:", revocationError);
  });
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

/** Pending invitations of a project (for the assistant's member reads). Expired
 are not part of this: `status = 'pending'` is not enough to say
 that an invitation is alive (MIN-197). */
export async function listPendingInvitations(
  projectId: string
): Promise<Array<{ id: string; email: string; created_at: string }>> {
  const service = getServiceClient();
  const { data, error } = await service
    .from("project_invitations")
    .select("id, invited_email, created_at")
    .eq("project_id", projectId)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
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
