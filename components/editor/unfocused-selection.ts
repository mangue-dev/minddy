import { Extension } from "@tiptap/core";
import { NodeSelection, Plugin, PluginKey, Selection, type EditorState } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

/**
 * Keeps an editor nobody is in from showing a selected block.
 *
 * A document whose content is replaced from outside (the description an issue
 * loads, a session attaching, a remote edit) maps the untouched caret along:
 * from the start of the old content it lands at the end of the new one, and
 * when that end is an image or another atom, ProseMirror can only select the
 * whole block. The issue then opened with its image framed as selected,
 * though nobody had clicked it.
 *
 * Only a selection the transactions merely carried along is put back at the
 * start, and only while the editor has no focus: a click, the keyboard or a
 * command sets its selection itself, and keeps it.
 *
 * A field inside a block (an image's caption) is the other way in: on iOS a
 * tap in it went through WebKit's own selection, which ProseMirror read as
 * the whole block selected. Once such a field has the focus, the selection
 * moves off its block, to the nearest text.
 */
export function shouldDropCarriedNodeSelection(input: {
  focused: boolean;
  docChanged: boolean;
  selectionSet: boolean;
  nodeSelection: boolean;
}): boolean {
  return !input.focused && input.docChanged && !input.selectionSet && input.nodeSelection;
}

/** The nearest text selection outside a block, else the document's start. */
function selectionOutside(state: EditorState, from: number, to: number): Selection {
  const { doc } = state;
  return Selection.findFrom(doc.resolve(to), 1, true)
    ?? Selection.findFrom(doc.resolve(from), -1, true)
    ?? Selection.atStart(doc);
}

export const UnfocusedSelection = Extension.create({
  name: "unfocusedSelection",

  addProseMirrorPlugins() {
    let view: EditorView | null = null;
    return [
      new Plugin({
        key: new PluginKey("unfocusedSelection"),
        view(editorView) {
          view = editorView;
          const onFocusIn = (event: FocusEvent) => {
            const field = event.target;
            if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return;
            // After WebKit and ProseMirror have settled the tap's selection.
            requestAnimationFrame(() => {
              const live = view;
              if (!live || document.activeElement !== field) return;
              const { selection } = live.state;
              if (!(selection instanceof NodeSelection)) return;
              const blockDom = live.nodeDOM(selection.from);
              if (!(blockDom instanceof Node) || !blockDom.contains(field)) return;
              live.dispatch(live.state.tr.setSelection(selectionOutside(live.state, selection.from, selection.to)));
            });
          };
          editorView.dom.addEventListener("focusin", onFocusIn);
          return {
            destroy() {
              editorView.dom.removeEventListener("focusin", onFocusIn);
              view = null;
            },
          };
        },
        appendTransaction(transactions, _old, state) {
          const drop = shouldDropCarriedNodeSelection({
            focused: view?.hasFocus() ?? false,
            docChanged: transactions.some((tr) => tr.docChanged),
            selectionSet: transactions.some((tr) => tr.selectionSet),
            nodeSelection: state.selection instanceof NodeSelection,
          });
          return drop ? state.tr.setSelection(Selection.atStart(state.doc)) : null;
        },
      }),
    ];
  },
});
