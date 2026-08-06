import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { fetchAuthUsersById, toNamed } from "@/lib/server/auth-users";
import { displayName } from "@/lib/display-name";
import type { InvitationPreview } from "@/lib/types";

/**
 * Ce que le `?invite=<token>` du lien d'un email d'invitation permet de dire
 * sur l'écran de connexion (MIN-197) : qui invite, sur quel projet, et à quelle
 * adresse — de quoi remplir le bandeau et pré-remplir le champ email.
 *
 * Lecture en clé service, forcément : l'invité n'a pas encore de session, et
 * n'aurait de toute façon pas accès au projet.
 *
 * **Le token n'ouvre rien.** Il ne rattache personne, ne donne accès à rien, ne
 * fait qu'afficher trois chaînes. Le rattachement au compte se joue ailleurs et
 * sur autre chose : l'email VÉRIFIÉ de la session
 * (`attachPendingInvitations`). Un token qui traîne ne vaut donc que ce qu'il
 * montre — et il n'est parti qu'à l'adresse concernée.
 */

/** `null` si le token est inconnu, déjà répondu ou expiré — jamais une erreur :
    un lien périmé rend simplement l'écran de connexion ordinaire. */
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
  // PostgREST rend l'embed to-one comme un objet, mais le typage générique du
  // client le donne parfois en tableau — on accepte les deux.
  const projectEmbed = data.projects as
    | { name?: string }
    | Array<{ name?: string }>
    | null;
  const project = Array.isArray(projectEmbed) ? projectEmbed[0] : projectEmbed;
  // Sans nom de projet, le bandeau ne dirait rien : on n'en affiche pas.
  if (!project?.name) return null;

  return {
    projectName: project.name,
    inviterName: displayName(toNamed(inviters.get(inviterId)), ""),
    invitedEmail: data.invited_email as string,
  };
}
