// Ce que le menu ⋯ FAIT — sans une ligne de React.
//
// Le menu, lui, n'est qu'une liste de libellés : tout ce qui touche au document
// est ici, en fonctions qui prennent un éditeur et rendent un booléen. C'est ce
// qui permet à lib/pages-chrome.test.ts de les jouer sur un vrai éditeur monté
// sur le vrai registre, sans monter d'interface.
//
// Le fil qui traverse le fichier : **rien ne travaille sur « le bloc »**, tout
// travaille sur une PLAGE DE BLOCS. Le cas d'un seul bloc n'est que celui d'une
// plage qui n'en contient qu'un — dupliquer, supprimer, colorer et copier le
// lien couvrent les deux sans une ligne de plus.
//
// Deux exceptions, et ce sont exactement les deux endroits où la sélection
// multi-blocs paraissait ne pas exister :
//
//  - `turnBlocksInto` — les commandes de conversion de tiptap lisent la
//    sélection elles-mêmes, et lisaient mal celle que pose la poignée ;
//  - `selectBlockFromHandle` — aller CHERCHER la poignée effaçait la sélection
//    qu'on venait de faire.
//
// Les deux sont écrits ci-dessous, avec ce qu'ils réparent.

import type { Editor, JSONContent } from "@tiptap/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import {
  BLOCK_ID_ATTRIBUTE,
  type PageBlock,
} from "@/components/pages/blocks/types";

/** Une plage de blocs entiers, en positions absolues du document. */
export interface BlockRange {
  from: number;
  to: number;
}

/**
 * La plage de blocs que porte la sélection courante.
 *
 * `blockRange` de ProseMirror remonte jusqu'au plus petit ancêtre commun qui
 * soit une suite de blocs : un curseur au milieu d'un paragraphe rend le
 * paragraphe entier, une sélection qui court sur trois blocs les rend tous les
 * trois, et une `NodeSelection` sur un dépliant rend le dépliant AVEC son
 * contenu — c'est ce dernier point qui fait que dupliquer ou supprimer emporte
 * les enfants sans qu'on ait à les chercher.
 */
export function blockRange(editor: Editor): BlockRange | null {
  const { $from, $to } = editor.state.selection;
  const range = $from.blockRange($to);
  if (!range) return null;
  return { from: range.start, to: range.end };
}

/**
 * Poser la sélection sur le bloc qui commence à `pos` — ce que fait un clic sur
 * la poignée avant d'ouvrir le menu. Sans ça, le menu agirait là où le curseur
 * traînait, pas sur le bloc survolé.
 */
export function selectBlockAt(editor: Editor, pos: number): boolean {
  const { doc } = editor.state;
  if (pos < 0 || pos > doc.content.size) return false;
  const node = doc.nodeAt(pos);
  if (!node) return false;
  const selection = NodeSelection.create(doc, pos);
  editor.view.dispatch(editor.state.tr.setSelection(selection));
  return true;
}

/**
 * Ce que sélectionne un clic sur la POIGNÉE, une fois qu'on tient compte de ce
 * qui était déjà sélectionné.
 *
 * Trois cas, et le deuxième est celui qui manquait :
 *
 *  - ⇧-clic : étendre depuis la sélection courante jusqu'à ce bloc ;
 *  - la sélection porte DÉJÀ plusieurs blocs et celui-ci en fait partie : on
 *    n'y touche pas. C'est ce qui rend la sélection multi-blocs utilisable —
 *    on balaye trois blocs à la souris, on va chercher la poignée, et la
 *    poignée gardait la sélection à un seul bloc, celui qu'elle survole. Le
 *    geste existait, il s'effaçait juste au moment de s'en servir ;
 *  - sinon : ce bloc, et lui seul.
 *
 * Rendre `true` sans rien dispatcher (cas 2) n'est pas un échec : c'est « la
 * sélection est déjà la bonne », et l'appelant ouvre son menu par-dessus.
 */
export function selectBlockFromHandle(
  editor: Editor,
  pos: number,
  extend: boolean
): boolean {
  const { doc, selection } = editor.state;
  const node = doc.nodeAt(pos);
  if (!node) return false;

  if (extend) {
    const from = Math.max(Math.min(selection.from, pos), 0);
    const to = Math.min(
      Math.max(selection.to, pos + node.nodeSize),
      doc.content.size
    );
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(doc, from, to))
    );
    return true;
  }

  const range = blockRange(editor);
  const covered =
    range !== null &&
    pos >= range.from &&
    pos + node.nodeSize <= range.to &&
    selectedBlockCount(editor) > 1;
  return covered ? true : selectBlockAt(editor, pos);
}

/**
 * Les blocs de PREMIER niveau que couvre la plage — pas leurs descendants.
 *
 * C'est la distinction qui compte pour le menu : trois blocs sélectionnés font
 * « 3 blocs », même quand l'un d'eux est une liste de dix items. Descendre dans
 * l'arbre donnerait un décompte que personne ne reconnaît.
 */
function blocksIn(editor: Editor, range: BlockRange) {
  const $from = editor.state.doc.resolve(range.from);
  const parent = $from.parent;
  const parentStart = $from.start();
  const blocks: Array<{ pos: number; id: string | null }> = [];
  parent.forEach((child, offset) => {
    const pos = parentStart + offset;
    if (pos < range.from || pos >= range.to) return;
    const id = child.attrs?.[BLOCK_ID_ATTRIBUTE];
    blocks.push({ pos, id: typeof id === "string" ? id : null });
  });
  return blocks;
}

/** Les ID des blocs couverts par la sélection, dans l'ordre du document. */
export function selectedBlockIds(editor: Editor): string[] {
  const range = blockRange(editor);
  if (!range) return [];
  return blocksIn(editor, range)
    .map((block) => block.id)
    .filter((id): id is string => id !== null);
}

/** Le nombre de blocs sur lesquels le menu va agir — ce qu'il annonce en tête
    quand il y en a plus d'un. */
export function selectedBlockCount(editor: Editor): number {
  const range = blockRange(editor);
  if (!range) return 0;
  return blocksIn(editor, range).length;
}

/**
 * La page citée quand la sélection est UN bloc sous-page, et rien d'autre.
 *
 * C'est ce qui fait basculer le menu ⋯ d'un vocabulaire de bloc à un
 * vocabulaire de PAGE (MIN-272) : dupliquer copie la page, supprimer la met à
 * la corbeille, et « transformer en » comme les couleurs disparaissent — un
 * lien vers un document ne se convertit pas en citation et n'a pas de couleur
 * de texte à choisir.
 *
 * `null` dès que la sélection porte sur autre chose ou sur plusieurs blocs :
 * une sélection mêlée retombe sur le menu ordinaire, où « dupliquer » veut dire
 * dupliquer des blocs. Deux vocabulaires dans un même menu, c'est un menu qui
 * ment sur la moitié de ce qu'il propose.
 */
export function selectedSubpageId(editor: Editor): string | null {
  const range = blockRange(editor);
  if (!range) return null;
  const $from = editor.state.doc.resolve(range.from);
  const parentStart = $from.start();

  let found: string | null = null;
  let count = 0;
  $from.parent.forEach((child, offset) => {
    const pos = parentStart + offset;
    if (pos < range.from || pos >= range.to) return;
    count += 1;
    const id = child.attrs?.pageId;
    if (child.type.name === "subpage" && typeof id === "string" && id) {
      found = id;
    }
  });
  return count === 1 ? found : null;
}

/**
 * Poser un bloc sous-page vers `pageId` à la position `at` — ce que fait
 * « dupliquer » sur un bloc sous-page, une fois la page copiée.
 *
 * La position est passée, et non relue : la copie est un aller-retour au
 * serveur, et pendant ce temps la sélection a pu partir ailleurs. La relire au
 * retour poserait la copie sous le bloc où l'on se trouve ALORS, pas sous celui
 * qu'on a dupliqué. Elle est bornée au document plutôt que refusée — le pire
 * qui puisse arriver est un bloc en fin de page, là où refuser perdrait une
 * page déjà écrite en base.
 *
 * Sans `focus()` non plus : reprendre le curseur une seconde après le clic le
 * volerait à qui s'est remis à taper entre-temps.
 */
export function insertSubpageAfter(
  editor: Editor,
  pageId: string,
  at: number
): boolean {
  const pos = Math.min(Math.max(at, 0), editor.state.doc.content.size);
  return editor
    .chain()
    .insertContentAt(pos, { type: "subpage", attrs: { pageId } })
    .run();
}

/* ── Deux pièges du DOM des vues de nœud ──────────────────────────────── */

/**
 * L'élément qui porte VRAIMENT le style d'un bloc, à partir de ce que
 * `view.nodeDOM` retourne.
 *
 * Une vue de nœud React (la sous-page, l'item de tâche) n'est pas rendue dans
 * cet élément-là : tiptap-react crée un `div.react-renderer` NU et monte le
 * `NodeViewWrapper` dedans. Tout le style du bloc — son rembourrage, sa hauteur
 * de ligne — vit donc un cran plus bas, et mesurer le conteneur revient à
 * mesurer rien : la gouttière (poignée + `+`) se calait sur un div sans
 * rembourrage et flottait au-dessus du texte, d'exactement la valeur du `py-`
 * du bloc.
 *
 * On descend d'un cran, et d'un seul : ce qu'on cherche est le bloc, pas son
 * contenu.
 */
export function styledBox(dom: HTMLElement): HTMLElement {
  const inner = dom.firstElementChild;
  return dom.classList.contains("react-renderer") &&
    inner instanceof HTMLElement
    ? inner
    : dom;
}

/** La marque d'une ancre rendue par une vue de nœud — celle que ni le style ni
    le clic de l'éditeur ne doivent traiter comme un lien du texte. */
export const BLOCK_LINK_CLASS = "page-block-link";

/**
 * Le clic sur le lien d'un BLOC n'appartient pas à l'extension Link.
 *
 * Elle attrape tout `<a>` du document, sans savoir d'où il vient, et fait
 * `window.open(href, target)` — donc un onglet neuf. Sur le bloc sous-page, ça
 * faisait DEUX navigations pour un clic : le nouvel onglet de l'extension, et
 * celle du navigateur qui suit l'ancre dans l'onglet courant. Aucune des deux
 * n'était voulue.
 *
 * Posé dans `editorProps`, qui passe AVANT tous les plugins dans `someProp` de
 * ProseMirror : rendre `true` suffit à couper l'extension. Le `preventDefault`
 * coupe l'autre moitié, et la vue du bloc prend le relais avec une navigation
 * d'application (blocks/subpage-view.tsx).
 *
 * Avec un MODIFICATEUR, on ne préempte que l'extension : ⌘/Ctrl-clic veut dire
 * « dans un nouvel onglet », et le navigateur le fait mieux que nous.
 */
export function handleBlockLinkClick(event: MouseEvent): boolean {
  const target = event.target as Element | null;
  if (!target?.closest?.(`.${BLOCK_LINK_CLASS}`)) return false;
  const modified =
    event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
  if (!modified) event.preventDefault();
  return true;
}

/* ── Les actions ──────────────────────────────────────────────────────── */

/**
 * L'attribut d'identité RETIRÉ de tout un sous-arbre.
 *
 * Dupliquer en recopiant les attributs tels quels donnerait deux blocs portant
 * le même `blockId` — donc deux ancres identiques, et une sauvegarde par bloc
 * (MIN-271) qui écrirait l'un par-dessus l'autre. On enlève l'ID, `UniqueID`
 * en pose un neuf à l'insertion.
 */
export function withoutBlockIds(content: JSONContent[]): JSONContent[] {
  return content.map((node) => {
    const attrs = { ...(node.attrs ?? {}) };
    delete attrs[BLOCK_ID_ATTRIBUTE];
    return {
      ...node,
      ...(node.attrs ? { attrs } : {}),
      ...(node.content ? { content: withoutBlockIds(node.content) } : {}),
    };
  });
}

/**
 * Poser une sélection de TEXTE qui court d'un bout à l'autre de la plage de
 * blocs. C'est la forme de sélection que les commandes de conversion de tiptap
 * savent lire ; une `NodeSelection` — celle que pose la poignée — n'en est pas
 * une, et c'est là que tout se jouait (cf. `turnBlocksInto`).
 *
 * `TextSelection.between` cherche les positions de texte les plus proches des
 * deux bords et retombe sur une sélection de nœud s'il n'y en a pas — un
 * séparateur, une sous-page. Rien à protéger de plus.
 */
function spreadOverBlocks(editor: Editor): boolean {
  const range = blockRange(editor);
  if (!range) return false;
  const { doc } = editor.state;
  editor.view.dispatch(
    editor.state.tr.setSelection(
      TextSelection.between(doc.resolve(range.from), doc.resolve(range.to))
    )
  );
  return true;
}

/**
 * « Transformer en » — sur TOUTE la sélection, et pas sur son premier bloc.
 *
 * C'est le geste que le menu ⋯ et les raccourcis du registre déclenchent tous
 * les deux, et il ne peut pas se contenter d'appeler `block.turnInto` : une
 * liste de trois items, convertie depuis la poignée, ressortait en une liste
 * numérotée d'UN item suivie de deux paragraphes nus. La poignée sélectionne le
 * bloc entier (`NodeSelection`), et `toggleOrderedList` ne sait pas quoi en
 * faire : il n'y voit pas de liste parente à retyper, retombe sur son chemin
 * générique, et celui-ci ne rattrape que le premier bloc.
 *
 * Deux gestes, donc, avant de convertir :
 *
 *  1. **étaler** la sélection sur la plage entière, en sélection de texte ;
 *  2. **aplatir** (`clearNodes`) : les items sortent de leur liste, le contenu
 *     sort du dépliant, tout redevient une suite de blocs de même niveau.
 *
 * Le deuxième est ce qui donne au menu une réponse dans TOUS les sens, et pas
 * seulement vers les listes : « liste → paragraphe » et « liste → citation » ne
 * faisaient, eux, strictement rien avant — `setParagraph` et `toggleBlockquote`
 * ne délistent pas. Une liste devient trois paragraphes, ou une citation qui
 * les porte tous les trois ; trois paragraphes deviennent une liste de trois
 * items. « Transformer en » veut dire la même chose dans les deux sens.
 *
 * Ce que ça coûte, et qui est assumé : la conversion repose des blocs NEUFS,
 * donc de nouveaux `blockId`. C'était déjà le cas d'un simple paragraphe → titre
 * avant ce changement — un bloc converti n'est pas le même bloc.
 */
export function turnBlocksInto(editor: Editor, block: PageBlock): boolean {
  if (!block.turnInto) return false;
  if (!spreadOverBlocks(editor)) return false;
  editor.commands.clearNodes();
  spreadOverBlocks(editor);
  return block.turnInto(editor);
}

/** Dupliquer la sélection JUSTE EN DESSOUS d'elle, enfants compris. */
export function duplicateBlocks(editor: Editor): boolean {
  const range = blockRange(editor);
  if (!range) return false;
  const slice = editor.state.doc.slice(range.from, range.to);
  const content = slice.content.toJSON() as JSONContent[] | null;
  if (!content || content.length === 0) return false;
  return editor
    .chain()
    .focus()
    .insertContentAt(range.to, withoutBlockIds(content))
    .run();
}

/** Supprimer la sélection, enfants compris. */
export function deleteBlocks(editor: Editor): boolean {
  const range = blockRange(editor);
  if (!range) return false;
  return editor.chain().focus().deleteRange(range).run();
}

/**
 * Insérer un paragraphe vide au-dessus ou en dessous du bloc qui commence à
 * `pos`, curseur dedans, et amorcer le menu « / » : le `+` de la marge ne pose
 * pas un paragraphe, il ouvre le catalogue — c'est le geste de Notion.
 *
 * Le « / » est tapé DANS le document plutôt que simulé au clavier : le menu est
 * une suggestion ProseMirror, elle s'ouvre sur le texte devant le curseur, d'où
 * qu'il vienne.
 */
export function insertBlockAround(
  editor: Editor,
  pos: number,
  where: "above" | "below"
): boolean {
  const node = editor.state.doc.nodeAt(pos);
  if (!node) return false;
  const at = where === "below" ? pos + node.nodeSize : pos;
  return editor
    .chain()
    .insertContentAt(at, { type: "paragraph" })
    .focus(at + 1)
    .insertContent("/")
    .run();
}

/**
 * L'URL d'un bloc : celle de la page, plus l'ID du bloc en fragment.
 *
 * Un fragment et pas un paramètre : il ne part pas au serveur, ne casse aucune
 * route, et le défilement vers l'ancre se branchera dessus (ticket de l'onglet
 * Pages). `href` est passé plutôt que lu ici pour que la fonction reste
 * testable hors navigateur.
 */
export function blockLink(href: string, blockId: string): string {
  const [base] = href.split("#");
  return `${base}#${blockId}`;
}

/** L'ID du premier bloc de la sélection — ce que « copier le lien » vise. */
export function selectedBlockId(editor: Editor): string | null {
  return selectedBlockIds(editor)[0] ?? null;
}

/** Rendre le curseur au document, au début de la plage — ce que fait le menu en
    se fermant, pour que `Échap` ne laisse pas le focus nulle part. */
export function focusBlockRange(
  editor: Editor,
  range: BlockRange | null
): void {
  if (!range) {
    editor.commands.focus();
    return;
  }
  const { doc } = editor.state;
  const pos = Math.min(range.from + 1, doc.content.size);
  editor.view.dispatch(
    editor.state.tr.setSelection(TextSelection.create(doc, pos))
  );
  editor.commands.focus();
}
