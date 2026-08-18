// The anchor of a NODE VIEW, and the click that goes with it.
//
// Two nodes make one: the subpage block of a page
// (components/pages/blocks/subpage-view.tsx) and the pill of a mention
// (components/markdown-mention.tsx). Both lead somewhere IN the app, and
// both run into the same thing: in a tiptap editor, the extension
// Link grabs any `<a>` from the document without knowing where it came from.
//
// Hence a common mark – a class – and a single hook to place in the
// `editorProps` of each editor that renders such anchors.

/** The mark of an anchor rendered by a node view: neither the style nor the click of
 the editor should treat it as a text link. */
export const NODE_LINK_CLASS = "editor-node-link";

/**
 * Clicking on the anchor of a node view does not belong to the Link extension.
 *
 * It grabs everything `<a>` in the document, without knowing where it comes from, and does
 * `window.open(href, target)` — therefore a new tab. On the subpage block, this
 * made TWO navigations for one click: the new extension tab, and
 * that of the browser which follows the anchor in the current tab. Neither
 * was not wanted.
 *
 * Placed in `editorProps`, which goes BEFORE all plugins in `someProp` of
 * ProseMirror: making `true` is enough to cut the extension. The `preventDefault`
 * cuts off the other half, and the node view takes over with navigation
 * (its own `onClick`).
 *
 * With a EDIT, we only preempt the extension: ⌘/Ctrl-click means
 * “in a new tab”, and the browser does it better than us.
 */
export function handleNodeLinkClick(event: MouseEvent): boolean {
  const target = event.target as Element | null;
  if (!target?.closest?.(`.${NODE_LINK_CLASS}`)) return false;
  const modified =
    event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
  if (!modified) event.preventDefault();
  return true;
}

/**
 * The ORDINARY click of a node view anchor: the one that should go through the
 * router rather than the browser.
 *
 * `false` for a ⌘-click, a middle click, a ⇧-click: these want a
 * tab or window, and the anchor serves them as is.
 */
export function isPlainNavigationClick(event: {
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  button: number;
}): boolean {
  return (
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    event.button === 0
  );
}
