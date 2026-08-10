// LE REGISTRE des blocs de page.
//
// Un seul tableau, `PAGE_BLOCKS`, et trois lectures dessus : le menu « / », le
// menu « transformer en », et le montage des extensions (donc, par ricochet, la
// sérialisation markdown). Aucun consommateur n'importe un bloc nommément —
// c'est LA règle de ce dossier, et c'est elle qui fait qu'ajouter un bloc
// tableau demandera un fichier et une ligne ici, pas six éditions dispersées.
//
// Ce que le registre garantit, et que personne n'a plus à penser :
//  - un nœud monté UNE fois même quand plusieurs blocs le partagent (les trois
//    titres, `listItem` des deux listes) ;
//  - la sérialisation déclarée sur le descripteur greffée sur le bon nœud ;
//  - un menu « / » groupé et ordonné, un « transformer en » qui n'offre que le
//    convertible.

import { Extension, type AnyExtension, type Editor, type Extensions, type Range } from "@tiptap/core";
import type { MessageKey } from "@/lib/i18n-keys";
import type { PageBlock, PageBlockId, SlashGroup } from "@/components/pages/blocks/types";

import { paragraphBlock } from "@/components/pages/blocks/paragraph";
import {
  heading1Block,
  heading2Block,
  heading3Block,
} from "@/components/pages/blocks/heading";
import { bulletListBlock } from "@/components/pages/blocks/bullet-list";
import { orderedListBlock } from "@/components/pages/blocks/ordered-list";
import { taskListBlock } from "@/components/pages/blocks/task-list";
import { quoteBlock } from "@/components/pages/blocks/quote";
import { codeBlock } from "@/components/pages/blocks/code";
import { dividerBlock } from "@/components/pages/blocks/divider";
import { detailsBlock } from "@/components/pages/blocks/details";
import { subpageBlock } from "@/components/pages/blocks/subpage";

export type { PageBlock, PageBlockId, SlashGroup } from "@/components/pages/blocks/types";
export {
  PAGE_COLORS,
  PAGE_COLOR_MARK,
  PAGE_COLOR_ATTRIBUTE,
  activePageColor,
  pageColorExtensions,
  setPageColor,
  type PageColor,
  type PageColorKind,
} from "@/components/pages/blocks/color";

/** Le catalogue v1. Ajouter un bloc = un fichier, et une ligne ICI. */
export const PAGE_BLOCKS: readonly PageBlock[] = [
  paragraphBlock,
  heading1Block,
  heading2Block,
  heading3Block,
  bulletListBlock,
  orderedListBlock,
  taskListBlock,
  quoteBlock,
  codeBlock,
  dividerBlock,
  detailsBlock,
  subpageBlock,
];

export const blockById = new Map<PageBlockId, PageBlock>(
  PAGE_BLOCKS.map((block) => [block.id, block])
);

/** Les blocs qui partagent un nœud, par nom de nœud — `heading` en porte trois.
    C'est ce que lit tout ce qui part du DOCUMENT plutôt que du menu. */
export const blocksByNodeName = PAGE_BLOCKS.reduce((map, block) => {
  const list = map.get(block.nodeName);
  if (list) list.push(block);
  else map.set(block.nodeName, [block]);
  return map;
}, new Map<string, PageBlock[]>());

/* ── L'identité d'un bloc dans le document ────────────────────────────── */

/** L'attribut qui porte l'ID stable d'un bloc. `blockId` et pas `id` : le
    document part en JSON dans la base, et un champ nommé `id` au milieu d'un
    arbre de nœuds se confond avec l'id de la PAGE à la première relecture.

    C'est lui qui donne à la poignée sa cible, au lien de bloc son ancre, à la
    sauvegarde sa fusion par bloc (MIN-271) et aux futurs commentaires la leur. */
export const BLOCK_ID_ATTRIBUTE = "blockId";

/** Les nœuds qui reçoivent un ID stable : TOUS ceux du catalogue. Se recalcule
    depuis le registre — un bloc neuf est identifié d'office. */
export const BLOCK_ID_TYPES = [
  ...new Set(PAGE_BLOCKS.map((block) => block.nodeName)),
];

/* ── Les extensions ───────────────────────────────────────────────────── */

/** Greffe le `toMarkdown` / `fromMarkdown` du descripteur sur le nœud, là où
    tiptap-markdown le lit. Sans déclaration, le nœud garde ce qu'il a déjà —
    la règle de tiptap-markdown pour les nœuds standards, sa propre sérialisation
    pour les tâches du carnet. */
function withMarkdown(block: PageBlock, extension: AnyExtension): AnyExtension {
  const { toMarkdown, fromMarkdown } = block.markdown;
  if (!toMarkdown && !fromMarkdown) return extension;
  return extension.extend({
    addStorage() {
      return {
        ...this.parent?.(),
        markdown: {
          ...(toMarkdown ? { serialize: toMarkdown } : {}),
          parse: fromMarkdown ? { setup: fromMarkdown } : {},
        },
      };
    },
  });
}

/**
 * Toutes les extensions du catalogue, dédoublonnées par nom.
 *
 * Le dédoublonnage n'est pas une précaution : il est ce qui permet à chaque
 * fichier de bloc de déclarer de quoi tenir DEBOUT SEUL (la liste numérotée
 * apporte `listItem` comme la liste à puces), sans que monter les deux fasse
 * lever tiptap sur une extension en double.
 *
 * `headless` retire les vues React des nœuds : le SCHÉMA et la sérialisation
 * markdown sans une ligne de rendu. C'est ce dont a besoin tout ce qui lit ou
 * écrit une page hors d'un navigateur — la projection markdown, les outils MCP,
 * et les tests. Sans ça, monter le catalogue demanderait React et un `<EditorContent>`.
 */
export function blockExtensions(
  options: { headless?: boolean } = {}
): Extensions {
  const seen = new Set<string>();
  const extensions: AnyExtension[] = [];
  for (const block of PAGE_BLOCKS) {
    for (const extension of block.extensions as AnyExtension[]) {
      if (seen.has(extension.name)) continue;
      seen.add(extension.name);
      const withStorage =
        extension.name === block.nodeName
          ? withMarkdown(block, extension)
          : extension;
      extensions.push(
        options.headless
          ? withStorage.extend({ addNodeView: undefined })
          : withStorage
      );
    }
  }
  return extensions;
}

/* ── Le menu « / » ────────────────────────────────────────────────────── */

/** Les sections du menu, dans l'ordre d'affichage, avec leur clé de libellé. */
export const SLASH_GROUPS: ReadonlyArray<{
  group: SlashGroup;
  labelKey: MessageKey<"Pages">;
}> = [
  { group: "basic", labelKey: "groupBasic" },
  { group: "lists", labelKey: "groupLists" },
  { group: "advanced", labelKey: "groupAdvanced" },
];

/** Le catalogue dans l'ordre du menu « / » : groupe par groupe, `order` par
    `order`. Les LIBELLÉS ne sont pas résolus ici — le registre n'a pas de
    traducteur, il rend des descripteurs et le menu les affiche. */
export function slashItems(): PageBlock[] {
  const rank = new Map(SLASH_GROUPS.map(({ group }, index) => [group, index]));
  return [...PAGE_BLOCKS].sort(
    (a, b) =>
      (rank.get(a.slash.group) ?? 0) - (rank.get(b.slash.group) ?? 0) ||
      a.slash.order - b.slash.order
  );
}

/** Poser le bloc à la place de la saisie « /… ». Sans `insert` déclaré, c'est
    « effacer la plage, puis convertir » — ce qui couvre tout bloc qui est une
    transformation du paragraphe courant. */
export function insertBlock(
  block: PageBlock,
  editor: Editor,
  range: Range
): void {
  if (block.insert) {
    block.insert(editor, range);
    return;
  }
  editor.chain().focus().deleteRange(range).run();
  if (block.turnInto) block.turnInto(editor);
}

/* ── Les raccourcis de conversion ─────────────────────────────────────── */

/**
 * Les raccourcis `shortcut` du catalogue, montés en une seule extension.
 *
 * Deux propriétés qui justifient de reprendre à la main ce que les extensions
 * tiptap font déjà chacune de leur côté :
 *
 *  - un raccourci se DÉCLARE avec le bloc, à côté de son libellé et de son
 *    icône. Le menu affiche celui-là même que le clavier déclenche : ils ne
 *    peuvent pas diverger, parce qu'il n'y en a qu'un ;
 *  - tous ont la même sémantique de BASCULE — le raccourci du bloc actif ramène
 *    au paragraphe. Sans ça, `⌘⌥1` bascule (Heading) mais `⌘⌥D` non (Details),
 *    et l'éditeur répond différemment selon le bloc sous le curseur.
 *
 * `priority` au-dessus des 100 par défaut : la liaison du registre passe donc
 * AVANT celle de l'extension du nœud, et c'est elle qui répond.
 */
export const PageBlockShortcuts = Extension.create({
  name: "pageBlockShortcuts",
  priority: 200,

  addKeyboardShortcuts() {
    const bindings: Record<string, () => boolean> = {};
    for (const block of PAGE_BLOCKS) {
      const { shortcut, turnInto } = block;
      if (!shortcut || !turnInto) continue;
      bindings[shortcut.keys] = () => {
        const editor = this.editor as unknown as Editor;
        if (block.id !== "paragraph" && block.isActive(editor)) {
          return paragraphBlock.turnInto
            ? paragraphBlock.turnInto(editor)
            : false;
        }
        return turnInto(editor);
      };
    }
    return bindings;
  },
});

/* ── Le menu « transformer en » ───────────────────────────────────────── */

/** Ce vers quoi la sélection courante peut être transformée, avec l'entrée
    active marquée. Ordre du menu « / » — un seul ordre à retenir. */
export function turnIntoItems(
  editor: Editor
): Array<{ block: PageBlock; active: boolean }> {
  return slashItems()
    .filter((block) => block.turnInto !== false)
    .map((block) => ({ block, active: block.isActive(editor) }));
}
