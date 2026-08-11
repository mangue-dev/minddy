// Les commentaires SUR LE BLOC (MIN-282) — le liseré, et la pastille qui ouvre
// le fil.
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
// ─── Deux décorations, et elles ne disent pas la même chose ─────────────────
//
//  • le LISERÉ (`Decoration.node`) : « il y a une discussion ici », visible en
//    parcourant la page sans rien cliquer ;
//  • la PASTILLE (`Decoration.widget`) : le compte des messages, et le bouton
//    qui ouvre le fil À CÔTÉ DU BLOC. C'est elle qui fait que la discussion vit
//    sur le texte dont elle parle plutôt que dans un pied de page.
//
// Le widget est du DOM nu, pas du React : ProseMirror le monte et le démonte
// lui-même à chaque rendu du nœud, et un portail React à cet endroit-là se
// monterait en pleine phase de commit. Il appelle donc un crochet posé sur le
// `storage` de l'extension, que le calque de commentaires renseigne (cf.
// components/pages/page-comment-layer.tsx).

import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { PAGE_BLOCK_ID_ATTRIBUTE } from "@/lib/pages-mentions";

/** Les classes que peint app/globals.css. */
const COMMENTED_CLASS = "page-block-commented";
const BADGE_CLASS = "page-block-comment-badge";

/** L'attribut qui porte l'ancre : le calque le lit sur le clic. */
const BLOCK_ATTR = "data-block-id";

export const blockCommentsKey = new PluginKey<DecorationSet>("blockComments");

/** Combien de messages par bloc commenté — le compte que porte la pastille. */
export type CommentedBlocks = ReadonlyMap<string, number>;

/** Ce que l'extension garde pour le calque : le crochet d'ouverture du fil, et
    le libellé de la pastille (le widget ne peut pas lire le catalogue i18n). */
export interface BlockCommentsStorage {
  open: ((blockId: string) => void) | null;
  label: string;
}

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

/** La pastille : le compte, et le clic qui ouvre le fil. */
function badge(
  blockId: string,
  count: number,
  storage: BlockCommentsStorage
): HTMLElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = BADGE_CLASS;
  button.setAttribute(BLOCK_ATTR, blockId);
  button.setAttribute("aria-label", storage.label);
  button.title = storage.label;
  button.contentEditable = "false";
  button.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
    `<span>${count}</span>`;
  // `mousedown` plutôt que `click`, et `preventDefault` avec : sans ça
  // ProseMirror place d'abord le curseur, ce qui referme le fil qu'on ouvre en
  // déplaçant la sélection sous lui.
  button.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    storage.open?.(blockId);
  });
  return button;
}

function decorationsFor(
  doc: Node,
  blocks: CommentedBlocks,
  storage: BlockCommentsStorage
): Decoration[] {
  const out: Decoration[] = [];
  if (blocks.size === 0) return out;
  doc.descendants((node, pos) => {
    const id = node.attrs?.[PAGE_BLOCK_ID_ATTRIBUTE];
    const count = typeof id === "string" ? blocks.get(id) : undefined;
    if (typeof id === "string" && count) {
      out.push(
        Decoration.node(pos, pos + node.nodeSize, {
          class: COMMENTED_CLASS,
          [BLOCK_ATTR]: id,
        })
      );
      // Le widget est posé À LA FIN du bloc, et rendu hors flux par le CSS : au
      // début, il s'intercalerait avant la première lettre et décalerait le
      // texte d'un bloc commenté par rapport à ses voisins.
      out.push(
        Decoration.widget(pos + node.nodeSize - 1, () => badge(id, count, storage), {
          side: 1,
          // Il n'est PAS du document : ni copié avec la sélection, ni compté
          // dans les positions que manipulent les commandes de bloc.
          ignoreSelection: true,
          marks: [],
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
export const BlockComments = Extension.create<
  Record<string, never>,
  BlockCommentsStorage
>({
  name: "blockComments",

  addStorage() {
    return { open: null, label: "Comments" };
  },

  addProseMirrorPlugins() {
    const storage = this.storage;
    return [
      new Plugin<DecorationSet>({
        key: blockCommentsKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set) {
            const meta = tr.getMeta(blockCommentsKey) as CommentedBlocks | undefined;
            if (meta) {
              return DecorationSet.create(
                tr.doc,
                decorationsFor(tr.doc, meta, storage)
              );
            }
            // Personne n'a rien annoncé : les décorations suivent leurs blocs.
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

/** Annonce les blocs qui portent un fil ouvert, et leur compte de messages. */
export function setCommentedBlocks(
  editor: Editor,
  blocks: CommentedBlocks
): void {
  if (editor.isDestroyed) return;
  editor.view.dispatch(
    editor.state.tr
      .setMeta(blockCommentsKey, blocks)
      // Ni dans l'historique, ni traité comme une écriture venue de l'extérieur
      // par les extensions qui distinguent les deux (la poignée de bloc).
      .setMeta("addToHistory", false)
  );
}
