// Le PLACEHOLDER d'un bloc vide (MIN-270) — un plugin à nous, et pourquoi.
//
// `Placeholder` de @tiptap/extensions n'a que deux modes, et aucun ne convient :
//
//  - par défaut (`includeChildren: false`), il ne regarde que le nœud de
//    PROFONDEUR 1. Pour un item de liste ou une ligne de citation, c'est le
//    `<ul>` ou le `<blockquote>` — pas un bloc de texte : rien n'était décoré,
//    et la moitié des blocs vides restaient muets ;
//  - avec `includeChildren`, il décore tout nœud dont la PLAGE contient le
//    curseur, bornes comprises. Deux blocs vides qui se touchent partagent une
//    borne : le curseur posé entre eux les allumait tous les deux, plus leurs
//    ancêtres vides. Trois placeholders pour un curseur.
//
// Et on ne peut pas rattraper le second depuis la callback de texte : elle est
// appelée pendant l'`apply` de la transaction, où `editor.state` est encore
// l'état d'AVANT. Le bloc qu'on vient d'atteindre y est donc invisible.
//
// D'où ce plugin. Il tient en une règle — le bloc de texte qui CONTIENT le
// curseur, s'il est vide — et la lit dans `props.decorations(state)`, à qui
// ProseMirror passe l'état courant. Un seul placeholder, à la bonne profondeur,
// jamais en retard d'une frappe.
//
// Pas de "use client" ni d'import de composant : ce module est monté par le
// registre de blocs, qui doit rester importable hors navigateur (cf. lib/cx.ts).

import { Extension } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { Node } from "@tiptap/pm/model";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { useTranslations } from "next-intl";

type PagesTranslator = ReturnType<typeof useTranslations<"Pages">>;

/** La classe posée sur le bloc décoré — le CSS de `.page-editor` la peint. */
export const PLACEHOLDER_CLASS = "is-empty";

export interface BlockPlaceholderOptions {
  /** Le texte à afficher, ou une chaîne vide pour ne rien afficher. */
  text: (context: { node: Node; depth: number }) => string;
}

export const BlockPlaceholder = Extension.create<BlockPlaceholderOptions>({
  name: "blockPlaceholder",

  addOptions() {
    return { text: () => "" };
  },

  addProseMirrorPlugins() {
    const { editor, options } = this;

    /**
     * L'éditeur a-t-il le CURSEUR ?
     *
     * Une sélection survit au focus : cliquer hors du document laisse le caret
     * là où il était, et le placeholder restait donc allumé sur une ligne que
     * plus personne n'éditait — une invitation à écrire posée sur un document
     * qu'on a quitté.
     *
     * Le drapeau est tenu ici plutôt que lu sur `editor.isFocused` : celui-ci
     * est mis à jour par les propres écouteurs de tiptap, et rien ne garantit
     * qu'ils passent avant les nôtres. Et comme un focus ne produit aucune
     * transaction, il faut en pousser une à vide pour que ProseMirror recalcule
     * les décorations — sans elle, le placeholder ne s'éteindrait qu'à la
     * frappe suivante.
     */
    let focused = false;

    return [
      new Plugin({
        key: new PluginKey("blockPlaceholder"),
        props: {
          handleDOMEvents: {
            focus: (view) => {
              focused = true;
              view.dispatch(view.state.tr);
              return false;
            },
            blur: (view) => {
              focused = false;
              view.dispatch(view.state.tr);
              return false;
            },
          },
          decorations(state: EditorState) {
            if (!editor.isEditable || !focused) return null;
            const { selection } = state;
            // Une SÉLECTION n'est pas un curseur : on n'invite pas à écrire là
            // où l'utilisateur est en train de choisir du texte.
            if (!selection.empty) return null;

            const { $anchor } = selection;
            if ($anchor.depth === 0) return null;
            const node = $anchor.parent;
            if (!node.type.isTextblock || node.content.size > 0) return null;

            const text = options.text({ node, depth: $anchor.depth });
            if (!text) return null;

            const pos = $anchor.before($anchor.depth);
            return DecorationSet.create(state.doc, [
              Decoration.node(pos, pos + node.nodeSize, {
                class: PLACEHOLDER_CLASS,
                "data-placeholder": text,
              }),
            ]);
          },
        },
      }),
    ];
  },
});

/**
 * Le texte, qui DÉPEND du bloc vide sous le curseur.
 *
 * Une invitation unique (« tapez / pour les blocs ») répétée sur un titre vide,
 * un item de liste vide et une ligne de citation vide dit trois fois la même
 * chose au mauvais moment : dans une liste, « / » n'est pas ce qu'on cherche,
 * c'est du texte. Un titre annonce donc son niveau, un bloc imbriqué invite
 * juste à écrire, et seule la ligne de premier niveau — la seule où le
 * catalogue est le bon geste — porte l'invitation complète.
 */
export function pagePlaceholder(t: PagesTranslator) {
  return ({ node, depth }: { node: Node; depth: number }): string => {
    if (node.type.name === "heading") {
      const level = node.attrs.level as number;
      if (level === 1) return t("blockHeading1");
      if (level === 2) return t("blockHeading2");
      return t("blockHeading3");
    }
    // Profondeur 1 = enfant direct du document. Au-delà, le bloc est DANS un
    // autre (liste, citation, dépliant, tâche).
    if (depth > 1) return t("placeholderNested");
    return t("placeholder");
  };
}
