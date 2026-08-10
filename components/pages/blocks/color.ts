// La COULEUR d'un passage de page — texte et fond.
//
// Deux décisions tiennent tout ce fichier.
//
// 1. C'est une MARK, pas un attribut de nœud. Une couleur posée sur le nœud
//    colorerait le bloc entier ; une mark colore ce qui est sélectionné, donc
//    trois mots au milieu d'une phrase comme un bloc entier quand la sélection
//    le couvre. C'est le geste de Notion, et c'est aussi ce qui se sérialise en
//    HTML sans inventer d'attribut de bloc. Le prix, assumé : le markdown n'a
//    pas de couleur, elle ne survit donc pas à la projection (MIN-269).
//
// 2. La mark stocke un NOM de la palette (« red »), jamais une couleur. Un hex
//    figé dans le document serait juste dans un thème et faux dans l'autre — un
//    rouge lisible sur blanc est illisible sur noir. Le nom, lui, se résout en
//    CSS, où chaque thème donne sa valeur (`--page-color-*` dans
//    app/globals.css). Changer de thème recolore le document sans le réécrire.
//
// Et la palette n'est pas inventée : c'est CELLE DU PRODUIT, celle des
// étiquettes de catégorie (lib/category-colors.ts), avec ses noms déjà traduits
// dans `Categories.colors`. Une seule source de couleurs dans minddy — et
// lib/pages-color.test.ts vérifie que les jetons CSS lui correspondent encore.

import { Mark, mergeAttributes, type Editor } from "@tiptap/core";
import { CATEGORY_COLORS, CATEGORY_COLOR_NAMES } from "@/lib/category-colors";
import type { MessageKey } from "@/lib/i18n-keys";

/** Un nom de la palette — et, tel quel, une clé i18n de `Categories.colors`. */
export type PageColor = MessageKey<"Categories.colors">;

/** La palette des pages : celle des étiquettes, dans son ordre, par NOM. */
export const PAGE_COLORS: readonly PageColor[] = CATEGORY_COLORS.map(
  (hex) => CATEGORY_COLOR_NAMES[hex]
);

/** Les deux dimensions colorables. Une seule mark chacune : poser un fond ne
    doit pas effacer une couleur de texte, ni l'inverse. */
export type PageColorKind = "text" | "background";

/** L'attribut HTML porté par chaque mark. C'est LUI que le CSS cible, et c'est
    lui qui rend la couleur relisible après un copier-coller. */
export const PAGE_COLOR_ATTRIBUTE: Record<PageColorKind, string> = {
  text: "data-page-text",
  background: "data-page-back",
};

/** Le nom tiptap de chaque mark. */
export const PAGE_COLOR_MARK: Record<PageColorKind, string> = {
  text: "pageTextColor",
  background: "pageBackgroundColor",
};

function colorMark(kind: PageColorKind) {
  const attribute = PAGE_COLOR_ATTRIBUTE[kind];
  return Mark.create({
    name: PAGE_COLOR_MARK[kind],

    addAttributes() {
      return {
        color: {
          default: null as PageColor | null,
          parseHTML: (element: HTMLElement) => element.getAttribute(attribute),
          renderHTML: (attributes: { color?: PageColor | null }) =>
            attributes.color ? { [attribute]: attributes.color } : {},
        },
      };
    },

    // `span[…]` et pas `span` : sans le sélecteur d'attribut, la mark happerait
    // tout `<span>` collé depuis n'importe où et le document se remplirait de
    // marks sans couleur.
    parseHTML() {
      return [{ tag: `span[${attribute}]` }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["span", mergeAttributes(HTMLAttributes), 0];
    },
  });
}

/** Les deux marks, à monter avec le reste de l'éditeur. */
export const pageColorExtensions = () => [
  colorMark("text"),
  colorMark("background"),
];

/* ── Ce que le menu appelle ───────────────────────────────────────────────── */

/**
 * Poser (ou retirer, avec `null`) une couleur sur la sélection courante.
 *
 * Rien de particulier à faire pour la sélection multi-blocs : `setMark` opère
 * sur les PLAGES de la sélection, et une `NodeRangeSelection` en porte une par
 * bloc — trois blocs sélectionnés se colorent donc d'un seul appel.
 */
export function setPageColor(
  editor: Editor,
  kind: PageColorKind,
  color: PageColor | null
): boolean {
  const name = PAGE_COLOR_MARK[kind];
  const chain = editor.chain().focus();
  return color
    ? chain.setMark(name, { color }).run()
    : chain.unsetMark(name).run();
}

/** La couleur en vigueur là où est le curseur, ou `null` pour « aucune ». */
export function activePageColor(
  editor: Editor,
  kind: PageColorKind
): PageColor | null {
  const { color } = editor.getAttributes(PAGE_COLOR_MARK[kind]) as {
    color?: PageColor | null;
  };
  return color ?? null;
}
