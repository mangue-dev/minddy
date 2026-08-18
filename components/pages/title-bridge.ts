// The TITLE and BODY of a page, sewn on the keyboard (MIN-270).
//
// The title is not the first block of the document — it is a column, and a
// `textarea` separately (see page-header.tsx). The price of this choice is paid here:
// for those who write, the two fields are a single surface, and the cursor must
// be able to move from one to the other as it moves from one line to the next.
//
// Three gestures, and only one meaning to remember — the title is the line ABOVE
// the first line of the body:
//
// - ⌫ at the very beginning of the document goes to the end of the title (nothing to delete there
// where we are, so nothing is lost);
// - ↑ from the first line of the body does the same;
// - ↓ from the title goes down into the body (page-header.tsx).
//
// The extension KNOWS NOTHING about the title: it notices that we exit from the top and
// says it. It is the caller who returns the focus, because he alone holds the field.
//
// **Priority 1, and this is the heart of the file.** tiptap mounts the keymaps in
// the reverse order of declaration, then sorts them by decreasing priority: to
// equal priority, the extension declared LAST is consulted FIRST.
// Our two keys are among the most loaded in the editor — ⌫ undoes one
// input rule, exits a list, joins two blocks; ↑ crosses the views of
// node. By walking past, we would have stolen the touch from all those people. With
// low priority, we are consulted last: we only act if no one
//no one else had anything to do.

import { Extension } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

export interface TitleBridgeOptions {
  /**
 * The cursor exits the document FROM THE TOP. Make `true` to say that the
 * gesture has been supported — `null` (the default) lets the key follow its usual
 * path, which is the behavior of an untitled surface.
 */
  onLeaveTop: (() => void) | null;
}

/**
 * Is the cursor stuck at the very beginning of the document?
 *
 * `depth === 1` is the guard that matters: a cursor at the start of the first item
 * of a list, or the first line of a quote, is at position 3 or
 * more and is NOT “the start of the document” — ⌫ must remove it from its list
 * before talking about leaving the body.
 */
export function atDocumentStart(state: EditorState): boolean {
  const { selection } = state;
  if (!selection.empty) return false;
  const { $from } = selection;
  return $from.depth === 1 && $from.pos === 1;
}

/**
 * Is the cursor in the FIRST top-level block?
 *
 * The pure half of "am I on the first line" — the other half
 * (`endOfTextblock`) measures rendering, and is only responsive in a browser.
 * Separated because a block can be ten lines on the screen: being in the
 * first block is not enough, and not being there is enough to answer no.
 */
export function inFirstBlock(state: EditorState): boolean {
  const { selection } = state;
  if (!selection.empty) return false;
  const { $from } = selection;
  if ($from.depth === 0) return false;
  return $from.before(1) === 0;
}

/** Is the cursor on the first visible line of the document? */
export function onFirstLine(view: EditorView): boolean {
  if (!inFirstBlock(view.state)) return false;
  return view.endOfTextblock("up");
}

export const TitleBridge = Extension.create<TitleBridgeOptions>({
  name: "titleBridge",
  priority: 1,

  addOptions() {
    return { onLeaveTop: null };
  },

  addKeyboardShortcuts() {
    // Read at the time of typing, and not captured: the option can be set
    // after editing.
    const leave = () => {
      const go = this.options.onLeaveTop;
      if (!go) return false;
      go();
      return true;
    };

    return {
      Backspace: ({ editor }) => atDocumentStart(editor.state) && leave(),
      ArrowUp: ({ editor }) => onFirstLine(editor.view) && leave(),
    };
  },
});
