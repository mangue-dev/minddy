// QUI a agi, tel qu'une notification le dira — le pendant « acteur » de
// notification-target.ts, et pour la même raison qu'elle : une notification se
// lit sur DEUX surfaces, et les deux doivent nommer la même personne.
//
// Module PUR (pas de `server-only`) : il ne fait que trancher entre trois
// drapeaux, et il vit à côté de la phrase et de la destination.

import type { NotificationRow } from "./server/notifications";

/**
 * Le petit bout de `NotificationRow` que tout producteur d'un geste
 * possiblement automatisé doit poser.
 *
 * `actor_id` reste le compte sous lequel l'écriture est passée — il faut bien un
 * id, et c'est lui qui porte les droits —, mais quand le geste est celui d'un
 * AGENT c'est l'agent que les deux surfaces nomment : la clé MCP quand il y en a
 * une (« Claude Code (mcp) »), Numo sinon (le chat, l'agent de code).
 *
 * **Les deux surfaces**, et c'est toute la raison d'être de ce helper. L'inbox
 * pouvait s'en passer pour un COMMENTAIRE : elle retombe sur le drapeau de la
 * ligne de commentaire (`comments.via_assistant`, app/api/notifications/route.ts).
 * La notification POUSSÉE, elle, ne lit que la ligne de notification
 * (lib/server/push/payload.ts) — sans ces champs, la bannière système annonce le
 * compte porteur là où l'inbox annonce l'agent. Concrètement : une réponse de
 * Numo à ma propre demande arrivait sur mon téléphone en « Clément a
 * commenté » — une notification de moi-même, pour un texte que je n'ai pas
 * écrit. Une description ou un ticket écrits par Numo avaient le même défaut,
 * et eux SANS le rattrapage de l'inbox : aucune ligne de commentaire derrière
 * où lire le drapeau.
 *
 * Les deux drapeaux ne se cumulent JAMAIS : l'affichage teste `via_assistant`
 * avant `via_mcp` (comme la timeline), donc les porter tous les deux ferait dire
 * « Numo » d'un geste dont on connaît l'agent par son nom.
 */
export function notificationActorSource(params: {
  viaAssistant?: boolean;
  mcpKeyId?: string | null;
}): Pick<NotificationRow, "via_mcp" | "api_key_id" | "via_assistant"> {
  if (params.mcpKeyId) return { via_mcp: true, api_key_id: params.mcpKeyId };
  if (params.viaAssistant) return { via_assistant: true };
  return {};
}
