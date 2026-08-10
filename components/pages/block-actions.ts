// Ce que le menu ⋯ FAIT — sans une ligne de React.
//
// Le menu, lui, n'est qu'une liste de libellés : tout ce qui touche au document
// est ici, en fonctions qui prennent un éditeur et rendent un booléen. C'est ce
// qui permet à lib/pages-chrome.test.ts de les jouer sur un vrai éditeur monté
// sur le vrai registre, sans monter d'interface.
//
// Le fil qui traverse le fichier : **rien ne travaille sur « le bloc »**, tout
// travaille sur une PLAGE DE BLOCS. Le cas d'un seul bloc n'est que celui d'une
// plage qui n'en contient qu'un — c'est pour ça que la sélection multi-blocs
// (`NodeRange`, ⇧-clic dans la marge) n'a demandé aucun code en plus : les
// mêmes quatre fonctions couvrent les deux.

import type { Editor, JSONContent } from "@tiptap/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { BLOCK_ID_ATTRIBUTE } from "@/components/pages/blocks";

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
export function focusBlockRange(editor: Editor, range: BlockRange | null): void {
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
