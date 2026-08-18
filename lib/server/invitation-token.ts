import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { fetchAuthUsersById, toNamed } from "@/lib/server/auth-users";
import { displayName } from "@/lib/display-name";
import type { InvitationPreview } from "@/lib/types";

/**
 * What the `?invite=<token>` of an invitation email link allows to say
 * on the connection screen (MIN-197): who invites, on what project, and to what
 * address — enough to fill in the banner and pre-fill the email field.
 *
 * Reading in service key, necessarily: the guest does not yet have a session, and
 * would not have access to the project anyway.
 *
 * **The token does not open anything.** It does not connect anyone, does not give access to anything, does not
 * only display three strings. The connection to the account takes place elsewhere and
 * on something else: the VERIFIED email of the session
 * (`attachPendingInvitations`). A token lying around is therefore only worth what it
 * shows — and it only went to the address concerned.
 */

/** `null` if the token is unknown, already responded to, or expired — never an error:
 an expired link just makes the login screen plain. */
export async function resolveInvitationToken(
  token: string
): Promise<InvitationPreview | null> {
  const normalized = token.trim();
  if (!normalized || normalized.length > 128) return null;

  const service = getServiceClient();
  const { data, error } = await service
    .from("project_invitations")
    .select("invited_email, invited_by, expires_at, projects(name)")
    .eq("token", normalized)
    .eq("status", "pending")
    .maybeSingle();

  if (error) {
    console.error("[invitation-token] lookup failed:", error.message);
    return null;
  }
  if (!data) return null;
  if (data.expires_at && Date.parse(data.expires_at as string) <= Date.now()) {
    return null;
  }

  const inviterId = data.invited_by as string;
  const inviters = await fetchAuthUsersById(service, [inviterId]);
  // PostgREST makes the embed to-one as an object, but the generic typing of the
  // client sometimes gives it in a table — we accept both.
  const projectEmbed = data.projects as
    | { name?: string }
    | Array<{ name?: string }>
    | null;
  const project = Array.isArray(projectEmbed) ? projectEmbed[0] : projectEmbed;
  // Without the project name, the banner would not say anything: we do not display one.
  if (!project?.name) return null;

  return {
    projectName: project.name,
    inviterName: displayName(toNamed(inviters.get(inviterId)), ""),
    invitedEmail: data.invited_email as string,
  };
}
