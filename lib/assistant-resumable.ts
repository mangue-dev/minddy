/**
 * « Y a-t-il un fil de Numo à REPRENDRE ? »
 *
 * Une seule surface pose la question : l'accueil. Son composer fait déjà le
 * travail du FAB — commencer à parler à Numo —, et le FAB posé par-dessus ne
 * proposait rien de plus que ce que la page montre en grand au milieu de
 * l'écran. Il n'y garde donc qu'un usage : REVENIR à une conversation qui
 * existe. Sans conversation, il ne s'affiche pas.
 *
 * Trois choses peuvent dire qu'il y en a une, et elles n'arrivent pas au même
 * moment :
 *
 * - la conversation VIVANTE dans le provider (`conversationId`), et avant même
 *   qu'elle porte un id, les messages déjà à l'écran et le tour en cours — un
 *   envoi depuis l'accueil ouvre un fil bien avant que le serveur l'ait nommé ;
 * - le POINTEUR relu au chargement de la page (`probedConversationId`), qui est
 *   la seule source pour un fil d'hier : la reprise du panneau, elle, ne se
 *   joue qu'à sa première ouverture, et sur l'accueil elle n'a pas eu lieu ;
 * - rien, et alors le FAB s'efface.
 *
 * Le pointeur ne vaut que TANT QUE le panneau n'a pas repris la main
 * (`restored`). Après, il est périmé par construction : « nouvelle
 * conversation » efface le fil vivant ET le pointeur en base, mais pas la
 * lecture qu'on en avait faite au chargement — s'y fier plus longtemps
 * laisserait le FAB promettre un fil que l'utilisateur vient de refermer.
 */

export interface ResumableConversationInput {
  /** La conversation vivante du provider, `null` si l'écran est vide. */
  conversationId: string | null;
  /** Les messages déjà à l'écran (un envoi précède l'id du serveur). */
  messageCount: number;
  /** Numo produit un tour — flux client ou génération côté serveur. */
  busy: boolean;
  /**
   * Le pointeur de conversation ouverte, relu une fois par la surface qui
   * demande. `null` = aucun, ou pas encore lu : dans le doute on n'affiche pas
   * plutôt que d'allumer le FAB pour l'éteindre une seconde plus tard.
   */
  probedConversationId: string | null;
  /** Le panneau a déjà repris (ou écarté) la conversation ouverte. */
  restored: boolean;
}

export function hasResumableConversation({
  conversationId,
  messageCount,
  busy,
  probedConversationId,
  restored,
}: ResumableConversationInput): boolean {
  if (conversationId !== null || messageCount > 0 || busy) return true;
  return !restored && probedConversationId !== null;
}
