/**
 * La PORTÉE de Numo : sur quel projet il travaille, ou `null` en mode global.
 *
 * C'est elle qui décide de tout ce qui compte pour un tour — le jeu d'outils, le
 * prompt système, le projet où atterrit un ticket créé sans qu'on le nomme. D'où
 * la question, qui a l'air anodine et ne l'est pas : **qui la choisit ?**
 *
 * Avant MIN-353, l'URL. Une conversation vivante était jetée dès que la route
 * changeait de projet (`reset()`, puis restauration de la conversation de la
 * nouvelle portée). Écrire à Numo depuis un projet puis cliquer sur l'accueil
 * suffisait à faire disparaître le fil de l'écran — intact en base, mais plus
 * nulle part à l'écran.
 *
 * Depuis, **c'est la conversation** : elle porte sa portée (son `project_id`,
 * figé à sa création) et la garde jusqu'au bout. Naviguer ne déplace plus que le
 * CONTEXTE DE PAGE qui accompagne le prochain message — « ce ticket », l'onglet
 * ouvert —, ce qui est justement ce qu'on veut voir bouger.
 *
 * Deux cas seulement rendent la main à l'extérieur :
 *
 * - **Pas de conversation vivante.** La route décide, comme avant : un premier
 *   message écrit depuis un projet ouvre une conversation de ce projet, et
 *   « nouvelle conversation » repart de la page où l'on se trouve.
 * - **Une ouverture qui IMPOSE une portée** (`open({ projectId })`) et qui
 *   contredit la conversation vivante. C'est le « Demander à Numo » d'un tableau,
 *   d'une vue, d'un retour : un geste explicite, sur une chose précise, ici. Il
 *   ouvre un fil neuf dans la bonne portée plutôt que de poursuivre l'ancien avec
 *   un contexte qui ne lui appartient pas. Une navigation, elle, n'impose rien.
 *
 * Et jamais pendant un tour : `busy` fige la portée le temps que Numo réponde,
 * sans quoi la réponse en cours atterrirait dans une conversation qu'on vient de
 * remplacer.
 */

export interface AssistantScopeInput {
  /** La conversation vivante, ou `null` si le panneau part d'un écran vide. */
  conversationId: string | null;
  /** Le `project_id` de cette conversation (`null` = conversation globale). */
  conversationProjectId: string | null;
  /** Le projet de la route courante (`null` hors d'un projet). */
  routeProjectId: string | null;
  /**
   * Portée imposée à l'ouverture du panneau : `undefined` = suivre la route,
   * `null` = mode global explicite, `string` = ce projet-là.
   */
  overrideProjectId?: string | null;
  /** Numo produit un tour : rien ne bouge tant qu'il n'a pas rendu la main. */
  busy?: boolean;
}

export interface AssistantScopeResolution {
  /** La portée effective — celle du prochain message. */
  scopeProjectId: string | null;
  /**
   * La conversation vivante doit-elle céder la place à un fil neuf ? Vrai
   * uniquement sur une ouverture qui impose une portée incompatible.
   *
   * Reste vrai PENDANT le tour, alors que `scopeProjectId` n'a pas encore bougé :
   * c'est ce qui permet à l'appelant de faire patienter l'envoi qui accompagne
   * l'ouverture au lieu de l'expédier dans la conversation d'à côté (le serveur
   * le refuserait — un message dont la portée dément la conversation est un 404).
   */
  startsNewConversation: boolean;
}

export function resolveAssistantScope({
  conversationId,
  conversationProjectId,
  routeProjectId,
  overrideProjectId,
  busy = false,
}: AssistantScopeInput): AssistantScopeResolution {
  const requested =
    overrideProjectId !== undefined ? overrideProjectId : routeProjectId;

  if (!conversationId) {
    return { scopeProjectId: requested, startsNewConversation: false };
  }

  const hijacked =
    overrideProjectId !== undefined &&
    overrideProjectId !== conversationProjectId;

  if (!hijacked) {
    return {
      scopeProjectId: conversationProjectId,
      startsNewConversation: false,
    };
  }

  return {
    // La bascule attend la fin du tour : la portée reste celle de la
    // conversation qui répond, sinon sa réponse atterrirait à côté.
    scopeProjectId: busy ? conversationProjectId : overrideProjectId,
    startsNewConversation: true,
  };
}
