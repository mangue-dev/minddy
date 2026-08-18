// The BLINK of a block — “that’s the one,” after going there.
//
// Two surfaces use it: the anchor of a block link, at the opening of the
// page (components/pages/page-view.tsx), and the table of contents, on click
// (components/pages/page-toc.tsx).
//
// ─── Why a DECORATION, and not a class placed on the element ──────────
//
// Because a hand-laid class does not hold a single image. ProseMirror
// monitors the DOM of its editable area and UNDOES anything it didn't write:
// it sees the attribute mutation, marks the node dirty, and re-renders it from
// the state of the document. Measured in the browser, on the real editor: at
// the moment of `classList.add`, PM adds a node and removes the old one, so
// that the class is found on an already detached element — present in the
// mutation log, missing from the document, invisible on screen.
//
// The symptom is cruel: the class IS installed (the code seems correct, a test
// jsdom on the element passes), the CSS IS correct (it paints in isolation), and
// yet nothing appears. Three passes went through before a navigator
// don't say it.
//
// A decoration belongs to ProseMirror: he places it himself each time
// render the node, so it survives anything that re-renders the document.

import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/** Blink duration — that of `page-block-pulse` (app/globals.css), plus the
 margin needed to avoid cutting off the last beat. */
export const FLASH_MS = 1_700;

/** The class that app/globals.css paints. */
const FLASH_CLASS = "page-block-target";

export const blockFlashKey = new PluginKey<DecorationSet>("blockFlash");

/**
 * The extension to mount in the editor (components/pages/page-editor.tsx).
 *
 * It does NOT touch the document: it only carries a decoration, so nothing
 * of what it does goes into the base, does not enter the history cancellation,
 * nor triggers automatic saving (a transaction without
 * document change does not issue `update`).
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
            // The block can move while it blinks (someone else
            // written above): the decoration follows its node.
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
      // Neither in history, nor treated as a change from outside
      // by the extensions which distinguish the two (the block handle).
      .setMeta("addToHistory", false)
  );
}

/**
 * Turns on the block that starts at `pos`. Makes enough to TURN IT OFF — essential
 * as soon as you can ask for it again: without that, the timer of the previous click turns off
 * the block that has just been turned on.
 */
export function flashBlockAt(editor: Editor, pos: number): () => void {
  const lit = blockFlashKey.getState(editor.state);
  // TURNING ON the same block again requires turning it off: a CSS animation does not
  // does not restart if the class never leaves the element. We cut, then we
  // power back on at the next frame — the time it takes for the browser to see
  // both states, and no one sees the 16 ms.
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
