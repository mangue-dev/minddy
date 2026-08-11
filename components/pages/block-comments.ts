// Le LISERÉ des blocs commentés (MIN-282) — « il y a une discussion ici ».
//
// ─── Pourquoi une DÉCORATION, et pas une mark dans le document ───────────────
//
// Une mark serait du CONTENU. Elle partirait donc en base avec le corps, puis
// dans la projection markdown (lib/pages-markdown.ts) que lisent Numo, l'agent
// de code et le MCP — qui n'ont aucune syntaxe pour la dire, la perdraient à la
// relecture, et rendraient un document légèrement différent de celui qu'ils ont
// lu. Un aller-retour qui invente du texte, pour une information qui n'est même
// pas dans le document : elle est dans `page_comments`.
//
// La même raison que le clignement (components/pages/block-flash.ts), plus une :
// ici l'ensemble des blocs concernés change à chaque commentaire écrit par
// n'importe qui, temps réel compris. Une décoration se remplace d'une
// transaction sans toucher au corps — donc sans historique d'annulation, sans
// enregistrement, sans conflit de version.
//
// Le liseré est POSÉ SUR LE BLOC et non dans la gouttière : celle-ci est déjà
// prise par la poignée et le `+`, et un troisième objet dans ces 56 px la
// rendrait illisible.

import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { PAGE_BLOCK_ID_ATTRIBUTE } from "@/lib/pages-mentions";

/** La classe que peint app/globals.css. */
const COMMENTED_CLASS = "page-block-commented";

/** L'attribut que porte le bloc commenté : le fil s'y accroche pour le clic. */
const COMMENTED_ATTR = "data-commented";

export const blockCommentsKey = new PluginKey<DecorationSet>("blockComments");

/** Les ids de blocs portés par un document — l'ensemble contre lequel se
    calcule le DÉTACHEMENT d'un fil (lib/page-comments.ts). Lu sur l'éditeur
    vivant, pas sur la dernière sauvegarde : un bloc supprimé il y a une seconde
    n'est plus là, même si la base l'a encore. */
export function documentBlockIds(editor: Editor | null): Set<string> {
  const ids = new Set<string>();
  if (!editor || editor.isDestroyed) return ids;
  editor.state.doc.descendants((node) => {
    const id = node.attrs?.[PAGE_BLOCK_ID_ATTRIBUTE];
    if (typeof id === "string" && id) ids.add(id);
    // Premier niveau seulement : c'est là que vit l'ancre (même granularité que
    // `pageBlockTexts` et que la poignée de bloc).
    return false;
  });
  return ids;
}

function decorationsFor(doc: Node, ids: ReadonlySet<string>): Decoration[] {
  const out: Decoration[] = [];
  if (ids.size === 0) return out;
  doc.descendants((node, pos) => {
    const id = node.attrs?.[PAGE_BLOCK_ID_ATTRIBUTE];
    if (typeof id === "string" && ids.has(id)) {
      out.push(
        Decoration.node(pos, pos + node.nodeSize, {
          class: COMMENTED_CLASS,
          [COMMENTED_ATTR]: id,
        })
      );
    }
    return false;
  });
  return out;
}

/**
 * L'extension à monter dans l'éditeur (components/pages/page-editor.tsx).
 *
 * Elle ne touche pas au document : rien de ce qu'elle fait ne part en base, ne
 * rentre dans l'historique d'annulation, ni ne déclenche l'enregistrement
 * automatique (une transaction sans changement de document n'émet pas `update`).
 */
export const BlockComments = Extension.create({
  name: "blockComments",

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: blockCommentsKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set) {
            const meta = tr.getMeta(blockCommentsKey) as
              | ReadonlySet<string>
              | undefined;
            if (meta) {
              return DecorationSet.create(tr.doc, decorationsFor(tr.doc, meta));
            }
            // Personne n'a rien annoncé : les liserés suivent leurs blocs.
            return set.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations: (state) => blockCommentsKey.getState(state),
        },
      }),
    ];
  },
});

/** Annonce l'ensemble des blocs qui portent un fil ouvert. Idempotent : rejouer
    le même ensemble ne coûte qu'une transaction vide de changement. */
export function setCommentedBlocks(
  editor: Editor,
  ids: ReadonlySet<string>
): void {
  if (editor.isDestroyed) return;
  editor.view.dispatch(
    editor.state.tr
      .setMeta(blockCommentsKey, ids)
      // Ni dans l'historique, ni traité comme une écriture venue de l'extérieur
      // par les extensions qui distinguent les deux (la poignée de bloc).
      .setMeta("addToHistory", false)
  );
}
