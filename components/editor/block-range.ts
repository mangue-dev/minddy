import { NodeRange } from "@tiptap/extension-node-range";

/**
 * Selecting several blocks with a drag or a ⇧-click (`NodeRange`), without
 * its ⌘A / Ctrl+A (MIN-728). Its select-all made a block-range selection,
 * which ProseMirror does not draw as text: the whole text looked unselected.
 * ⌘A keeps ProseMirror's own select-all, highlighted like any selection, and
 * every block action works on it. The ranges it does make are painted by
 * `.ProseMirror-selectednoderange` (app/globals.css).
 */
export const BlockRange = NodeRange.extend({
  addKeyboardShortcuts() {
    const shortcuts = { ...this.parent?.() };
    delete shortcuts["Mod-a"];
    return shortcuts;
  },
});
