import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { newPageMentions, pageBlockTexts } from "@/lib/pages-mentions";
import { toNamed, fetchAuthUsersById } from "@/lib/server/auth-users";
import {
  insertNotifications,
  projectMemberIds,
  type NotificationRow,
} from "@/lib/server/notifications";
import type { Member } from "@/lib/types";

/**
 * Prévenir les gens cités dans une PAGE (MIN-278).
 *
 * Le jumeau de `notifyDescriptionMentions` : mêmes règles, même point
 * d'insertion, et donc les mêmes préférences de compte (le filtre de MIN-82 vit
 * dans `insertNotifications`, où tous les producteurs convergent). Ce qui
 * change tient en deux lignes — la cible est une page, et elle porte en plus le
 * BLOC où la citation a été posée, pour que le clic tombe sur le paragraphe.
 *
 * La liste des citables est reconstruite ICI, depuis `project_members`, et pas
 * depuis ce que le client a envoyé : prévenir quelqu'un d'une page qu'il ne peut
 * pas ouvrir ne lui rendrait pas service, et lui apprendrait son existence.
 */
export async function notifyPageMentions(
  service: SupabaseClient,
  params: {
    projectId: string;
    pageId: string;
    /** L'auteur de l'écriture — jamais notifié de sa propre citation. */
    actorId: string | null;
    /** Le document tel qu'il vient d'être écrit. */
    doc: unknown;
    /** Celui d'avant, à la modification. Absent = création. */
    previousDoc?: unknown;
  },
): Promise<void> {
  // Le raccourci d'`notifyDescriptionMentions`, et il compte plus encore ici :
  // ce chemin s'ouvre à CHAQUE sauvegarde, donc une seconde après la dernière
  // frappe. Sans arobase dans le document, il n'y a rien à chercher — et deux
  // requêtes (les membres, puis leurs comptes) à ne pas faire.
  if (!pageBlockTexts(params.doc).some((block) => block.text.includes("@"))) {
    return;
  }

  const memberIds = await projectMemberIds(service, params.projectId);
  if (memberIds.size === 0) return;

  const accounts = await fetchAuthUsersById(service, [...memberIds]);
  const members: Member[] = [...memberIds].map(
    (userId) => ({ user_id: userId, ...toNamed(accounts.get(userId)) }) as Member,
  );

  const mentions = newPageMentions({
    members,
    doc: params.doc,
    previousDoc: params.previousDoc,
    actorId: params.actorId,
  });
  if (mentions.length === 0) return;

  const rows: NotificationRow[] = mentions.map((mention) => ({
    user_id: mention.userId,
    project_id: params.projectId,
    type: "page_mention" as const,
    issue_id: null,
    page_id: params.pageId,
    block_id: mention.blockId,
    actor_id: params.actorId,
  }));
  await insertNotifications(service, rows);
}
