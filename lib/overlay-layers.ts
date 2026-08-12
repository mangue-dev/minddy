/**
 * Les calques PORTÉS, et les deux questions qu'un panneau « maison » doit leur
 * poser (MIN-284).
 *
 * Un panneau qui se ferme au clic extérieur le décide en regardant si la cible
 * est dans son propre DOM. C'est juste — tant que rien ne s'ouvre par-dessus
 * lui. Or un menu, un dialogue de confirmation ou un toast sont montés en
 * PORTAIL, en fin de `body` : au sens du DOM, ils sont « ailleurs », et le
 * panneau se referme sur le clic qui les vise.
 *
 * Le symptôme, sur le fil de commentaires d'un bloc : cliquer « Supprimer »
 * dans le menu « ⋯ » fermait le panneau, donc démontait le commentaire, donc
 * emportait le dialogue de confirmation avant qu'on ait pu confirmer. Le geste
 * ne supprimait rien, et ne disait rien non plus — il ressemblait à une fermeture
 * voulue. Même chose pour « Modifier », et pour ÉCHAP, que le panneau
 * interceptait en capture avant que le dialogue l'ait vu.
 *
 * Les sélecteurs sont ceux de Radix (via mangue-ui) et de Sonner. Ils décrivent
 * une CONVENTION de bibliothèque plutôt qu'un composant à nous : c'est pourquoi
 * ils vivent ici, en un seul endroit, plutôt que recopiés dans chaque panneau.
 */

/** Ce qui se pose PAR-DESSUS : un clic dedans n'est pas un clic « ailleurs ». */
const OVERLAY_SELECTOR = [
  // Menus, popovers, sélecteurs, infobulles — tout ce que Radix positionne.
  "[data-radix-popper-content-wrapper]",
  '[data-slot="alert-dialog-overlay"]',
  '[data-slot="dialog-overlay"]',
  '[role="menu"]',
  '[role="dialog"]',
  '[role="alertdialog"]',
  "[data-sonner-toaster]",
].join(",");

/**
 * Ce à quoi ÉCHAP appartient d'abord.
 *
 * Plus étroit que ci-dessus, et volontairement : une infobulle ne prend pas
 * ÉCHAP, donc le panneau doit rester fermable au clavier pendant qu'on en
 * survole une.
 */
const DISMISSIBLE_SELECTOR = '[role="menu"],[role="dialog"],[role="alertdialog"]';

/** La cible d'un clic est-elle dans un calque posé par-dessus le panneau ? */
export function isInOverlayLayer(node: Element | null | undefined): boolean {
  return !!node?.closest(OVERLAY_SELECTOR);
}

/** Un menu ou un dialogue est-il ouvert quelque part ? Alors ÉCHAP est à lui. */
export function hasOpenDismissibleLayer(root: ParentNode): boolean {
  return !!root.querySelector(DISMISSIBLE_SELECTOR);
}
