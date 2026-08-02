import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { contentMentionScanner } from "@/lib/mention-scan";
import { toNamed, fetchAuthUsersById } from "@/lib/server/auth-users";
import {
  insertNotifications,
  projectMemberIds,
  type NotificationRow,
} from "@/lib/server/notifications";
import type { Member } from "@/lib/types";

/**
 * Qui vient d'être cité, et mérite donc d'être prévenu — la règle, isolée de la
 * base pour être vérifiable telle quelle.
 *
 * `members` est la liste des gens qui ONT ACCÈS : un nom qui n'y figure pas
 * n'est pas une mention, et ne notifie personne. `previousDescription` absente
 * = création, tout ce qui est cité est nouveau.
 */
export function newlyMentionedUserIds(params: {
  members: Member[];
  description: string | null | undefined;
  previousDescription?: string | null;
  actorId: string | null;
}): string[] {
  const scan = contentMentionScanner({ members: params.members });
  const mentionedIn = (text: string | null | undefined): Set<string> => {
    const ids = new Set<string>();
    if (!text) return ids;
    for (const segment of scan(text)) {
      if (segment.mention?.type === "member") ids.add(segment.mention.member.user_id);
    }
    return ids;
  };

  const before = mentionedIn(params.previousDescription);
  return [...mentionedIn(params.description)].filter(
    (userId) => userId !== params.actorId && !before.has(userId),
  );
}

/**
 * Prévenir les gens cités dans une DESCRIPTION (de ticket ou d'objectif).
 *
 * Trois règles, et la troisième est la seule qui demande un peu de soin :
 *
 *  1. ACCÈS. On ne cite que des membres du projet — la liste des citables est
 *     construite ici, depuis `project_members`, et pas depuis ce que le client
 *     a envoyé. Un nom qui ne correspond à personne d'ici ne notifie personne :
 *     prévenir quelqu'un d'un ticket qu'il ne peut pas ouvrir ne lui rendrait
 *     pas service, et lui apprendrait son existence.
 *
 *  2. JAMAIS SOI-MÊME. Se citer dans sa propre description n'est pas un appel.
 *
 *  3. LES NOUVELLES SEULEMENT. À l'édition, on compare aux mentions de la
 *     version PRÉCÉDENTE et on ne prévient que ceux qui viennent d'arriver.
 *     Sans ça, corriger une faute de frappe dix lignes plus bas repinguerait
 *     tout le monde — et une description se relit souvent.
 *
 * La règle de ce qui EST une mention est la même que celle du champ de saisie
 * (lib/mention-scan) : c'est ce qui garantit que la pilule affichée et la
 * personne prévenue désignent bien le même compte.
 */
export async function notifyDescriptionMentions(
  service: SupabaseClient,
  params: {
    projectId: string;
    /** L'auteur de l'écriture — jamais notifié de sa propre citation. */
    actorId: string | null;
    /** La description telle qu'elle vient d'être écrite. */
    description: string | null | undefined;
    /** La version d'avant, à la modification. Absente = création. */
    previousDescription?: string | null;
    /** La cible : l'un OU l'autre, comme partout dans `notifications`. */
    issueId?: string;
    objectiveId?: string;
    /** L'écriture est passée par le MCP : l'inbox nomme l'agent, pas la clé. */
    mcpKeyId?: string | null;
  },
): Promise<void> {
  const { projectId, actorId, description } = params;
  if (!description || !description.includes("@")) return;

  const memberIds = await projectMemberIds(service, projectId);
  if (memberIds.size === 0) return;

  const accounts = await fetchAuthUsersById(service, [...memberIds]);
  const members: Member[] = [...memberIds].map(
    (userId) => ({ user_id: userId, ...toNamed(accounts.get(userId)) }) as Member,
  );

  const recipients = newlyMentionedUserIds({
    members,
    description,
    previousDescription: params.previousDescription,
    actorId,
  });
  if (recipients.length === 0) return;

  const rows: NotificationRow[] = recipients.map((userId) => ({
    user_id: userId,
    project_id: projectId,
    type: "mention" as const,
    issue_id: params.issueId ?? null,
    objective_id: params.objectiveId ?? null,
    actor_id: actorId,
    via_mcp: !!params.mcpKeyId,
    api_key_id: params.mcpKeyId ?? null,
  }));
  await insertNotifications(service, rows);
}
