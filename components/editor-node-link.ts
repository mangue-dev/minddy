// L'ancre d'une VUE DE NŒUD, et le clic qui va avec.
//
// Deux nœuds en rendent une : le bloc sous-page d'une page
// (components/pages/blocks/subpage-view.tsx) et la pilule d'une mention
// (components/markdown-mention.tsx). Les deux mènent quelque part DANS l'app, et
// les deux se heurtent à la même chose : dans un éditeur tiptap, l'extension
// Link attrape tout `<a>` du document sans savoir d'où il vient.
//
// D'où une marque commune — une classe — et un seul crochet à poser dans les
// `editorProps` de chaque éditeur qui rend de telles ancres.

/** La marque d'une ancre rendue par une vue de nœud : ni le style ni le clic de
    l'éditeur ne doivent la traiter comme un lien du texte. */
export const NODE_LINK_CLASS = "editor-node-link";

/**
 * Le clic sur l'ancre d'une vue de nœud n'appartient pas à l'extension Link.
 *
 * Elle attrape tout `<a>` du document, sans savoir d'où il vient, et fait
 * `window.open(href, target)` — donc un onglet neuf. Sur le bloc sous-page, ça
 * faisait DEUX navigations pour un clic : le nouvel onglet de l'extension, et
 * celle du navigateur qui suit l'ancre dans l'onglet courant. Aucune des deux
 * n'était voulue.
 *
 * Posé dans `editorProps`, qui passe AVANT tous les plugins dans `someProp` de
 * ProseMirror : rendre `true` suffit à couper l'extension. Le `preventDefault`
 * coupe l'autre moitié, et la vue du nœud prend le relais avec une navigation
 * d'application (son propre `onClick`).
 *
 * Avec un MODIFICATEUR, on ne préempte que l'extension : ⌘/Ctrl-clic veut dire
 * « dans un nouvel onglet », et le navigateur le fait mieux que nous.
 */
export function handleNodeLinkClick(event: MouseEvent): boolean {
  const target = event.target as Element | null;
  if (!target?.closest?.(`.${NODE_LINK_CLASS}`)) return false;
  const modified =
    event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
  if (!modified) event.preventDefault();
  return true;
}

/**
 * Le clic ORDINAIRE d'une ancre de vue de nœud : celui qui doit passer par le
 * routeur plutôt que par le navigateur.
 *
 * `false` pour un ⌘-clic, un clic du milieu, un ⇧-clic : ceux-là veulent un
 * onglet ou une fenêtre, et l'ancre les sert telle quelle.
 */
export function isPlainNavigationClick(event: {
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  button: number;
}): boolean {
  return (
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    event.button === 0
  );
}
