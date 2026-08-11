// Le CLIGNEMENT d'un bloc — « c'est celui-là », après y être allé.
//
// Deux surfaces s'en servent : l'ancre d'un lien de bloc, à l'ouverture de la
// page (components/pages/page-view.tsx), et la table des matières, au clic
// (components/pages/page-toc.tsx).
//
// ─── Pourquoi une DÉCORATION, et pas une classe posée sur l'élément ──────────
//
// Parce qu'une classe posée à la main ne tient pas une seule image. ProseMirror
// surveille le DOM de sa zone éditable et DÉFAIT tout ce qu'il n'a pas écrit :
// il voit la mutation d'attribut, marque le nœud sale, et le re-rend depuis
// l'état du document. Mesuré dans le navigateur, sur le vrai éditeur : à
// l'instant du `classList.add`, PM ajoute un nœud et retire l'ancien, si bien
// que la classe se retrouve sur un élément déjà détaché — présent dans le
// mutation log, absent du document, invisible à l'écran.
//
// Le symptôme est cruel : la classe EST posée (le code a l'air juste, un test
// jsdom sur l'élément passe), le CSS EST correct (il peint en isolation), et
// pourtant rien n'apparaît. Trois passes y sont passées avant qu'un navigateur
// ne le dise.
//
// Une décoration, elle, appartient à ProseMirror : il la pose lui-même à chaque
// rendu du nœud, donc elle survit à tout ce qui re-rend le document.

import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/** Durée du clignement — celle de `page-block-pulse` (app/globals.css), plus la
    marge qu'il faut pour ne pas couper le dernier battement. */
export const FLASH_MS = 1_700;

/** La classe que peint app/globals.css. */
const FLASH_CLASS = "page-block-target";

export const blockFlashKey = new PluginKey<DecorationSet>("blockFlash");

/**
 * L'extension à monter dans l'éditeur (components/pages/page-editor.tsx).
 *
 * Elle ne touche PAS au document : elle ne porte qu'une décoration, donc rien
 * de ce qu'elle fait ne part en base, ne rentre dans l'historique d'annulation,
 * ni ne déclenche l'enregistrement automatique (une transaction sans
 * changement de document n'émet pas `update`).
 */
export const BlockFlash = Extension.create({
  name: "blockFlash",

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: blockFlashKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set) {
            const meta = tr.getMeta(blockFlashKey) as number | null | undefined;
            if (meta === null) return DecorationSet.empty;
            if (typeof meta === "number") {
              const node = tr.doc.nodeAt(meta);
              if (!node) return DecorationSet.empty;
              return DecorationSet.create(tr.doc, [
                Decoration.node(meta, meta + node.nodeSize, {
                  class: FLASH_CLASS,
                }),
              ]);
            }
            // Le bloc peut bouger pendant que ça clignote (quelqu'un d'autre
            // écrit au-dessus) : la décoration suit son nœud.
            return set.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations: (state) => blockFlashKey.getState(state),
        },
      }),
    ];
  },
});

function setFlash(editor: Editor, pos: number | null): void {
  if (editor.isDestroyed) return;
  editor.view.dispatch(
    editor.state.tr
      .setMeta(blockFlashKey, pos)
      // Ni dans l'historique, ni traité comme un changement venu de l'extérieur
      // par les extensions qui distinguent les deux (la poignée de bloc).
      .setMeta("addToHistory", false)
  );
}

/**
 * Allume le bloc qui commence à `pos`. Rend de quoi l'ÉTEINDRE — indispensable
 * dès qu'on peut le redemander : sans ça, le minuteur du clic précédent éteint
 * le bloc qu'on vient d'allumer.
 */
export function flashBlockAt(editor: Editor, pos: number): () => void {
  const lit = blockFlashKey.getState(editor.state);
  // RALLUMER le même bloc demande de passer par l'éteint : une animation CSS ne
  // repart pas si la classe ne quitte jamais l'élément. On coupe, puis on
  // rallume à l'image suivante — le temps qu'il faut au navigateur pour voir
  // les deux états, et personne ne voit les 16 ms.
  const relight = !!lit && lit !== DecorationSet.empty;
  if (relight) setFlash(editor, null);

  let frame = 0;
  if (relight) frame = requestAnimationFrame(() => setFlash(editor, pos));
  else setFlash(editor, pos);

  const timer = setTimeout(() => setFlash(editor, null), FLASH_MS);

  return () => {
    if (frame) cancelAnimationFrame(frame);
    clearTimeout(timer);
    setFlash(editor, null);
  };
}
