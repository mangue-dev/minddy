"use client";

/**
 * Les pages créées PENDANT CETTE VISITE et pas encore écrites (MIN-270).
 *
 * Créer une page ne doit pas la sauvegarder : on ouvre le « + », on tombe sur
 * autre chose, on repart — et il ne doit rien rester. La page existe pourtant
 * en base dès le premier instant, et c'est délibéré : son id est ce qui donne
 * une URL partageable, une présence, un bloc sous-page dans le parent, et
 * l'enregistrement automatique dès la première lettre. Ce qu'on diffère n'est
 * donc pas la création, c'est le fait qu'elle SURVIVE.
 *
 * D'où cette table : elle retient quelles pages sont encore des brouillons.
 * Quitter l'une d'elles sans y avoir mis ni titre, ni icône, ni texte la
 * détruit (`discardPageApi`) ; la première lettre tapée l'en sort et elle
 * redevient une page comme les autres.
 *
 * Un ensemble au niveau du MODULE, et non un état React : l'information doit
 * survivre au démontage du composant qui la produit — c'est justement au moment
 * où `PageView` se démonte qu'on la lit. Elle est volontairement PERDUE au
 * rechargement de l'onglet : une page qu'on a quittée en fermant le navigateur
 * n'est plus rattrapable par personne, et la détruire au retour serait une
 * surprise plutôt qu'un service.
 */
const drafts = new Set<string>();

/** Cette page vient d'être créée : elle ne survit pas à un départ sans écrit. */
export function markDraftPage(pageId: string): void {
  drafts.add(pageId);
}

export function isDraftPage(pageId: string): boolean {
  return drafts.has(pageId);
}

/** Elle a été écrite, détruite, ou son sort est réglé : ce n'est plus un brouillon. */
export function forgetDraftPage(pageId: string): void {
  drafts.delete(pageId);
}

/**
 * Les destructions PROGRAMMÉES, et pourquoi elles ne sont pas immédiates.
 *
 * Le signal du départ est le démontage de `PageView`. En développement, React
 * monte, démonte et remonte chaque composant (Strict Mode) : une destruction
 * faite dans le démontage détruirait la page à la seconde où on la crée, sans
 * que personne ait rien quitté. On la programme donc, et un remontage immédiat
 * l'annule — le délai n'a besoin que d'être plus long que ce battement-là.
 *
 * Ce n'est pas qu'un artifice de développement : le même battement peut venir
 * d'une reprise de Suspense ou d'un rendu concurrent abandonné. Reporter d'un
 * cheveu une destruction n'a aucun coût ; la faire pour rien en a un.
 */
const DISCARD_DELAY_MS = 60;

const pending = new Map<string, ReturnType<typeof setTimeout>>();

export function scheduleDraftDiscard(pageId: string, discard: () => void): void {
  cancelDraftDiscard(pageId);
  pending.set(
    pageId,
    setTimeout(() => {
      pending.delete(pageId);
      drafts.delete(pageId);
      discard();
    }, DISCARD_DELAY_MS)
  );
}

/** On est revenu (ou on n'était jamais parti) : la page vit. */
export function cancelDraftDiscard(pageId: string): void {
  const timer = pending.get(pageId);
  if (timer === undefined) return;
  clearTimeout(timer);
  pending.delete(pageId);
}
