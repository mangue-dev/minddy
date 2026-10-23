// Where a file dragged from outside lands in the editor.
//
// ProseMirror places a drop at the exact text position under the pointer: an
// image had to be aimed at the right gap between two blocks, with no line to
// say where it would go, and a drop on a task's text put the image inside the
// task. A file always lands BETWEEN top-level blocks instead, at the gap
// nearest the pointer, and a line shows that gap while the file is dragged.
//
// The line is a decoration, for the reason block-flash.ts gives: ProseMirror
// undoes any element it did not render itself.

import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

/** The class that app/globals.css paints. */
const LINE_CLASS = "editor-file-drop-line";

const fileDropKey = new PluginKey<number | null>("fileDrop");

/**
 * The gap between top-level blocks nearest a vertical coordinate: before the
 * first block whose middle is below it, or the end of the document. Blocks are
 * stacked in document order, so a binary search keeps a long page cheap while
 * `dragover` fires several times a second.
 */
export function blockGapAt(
  doc: PMNode,
  clientY: number,
  middleOf: (offset: number, node: PMNode) => number | null
): number {
  const offsets: number[] = [];
  doc.forEach((_node, offset) => {
    offsets.push(offset);
  });
  let low = 0;
  let high = offsets.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    const middle = middleOf(offsets[mid], doc.child(mid));
    if (middle !== null && clientY < middle) high = mid;
    else low = mid + 1;
  }
  return low < offsets.length ? offsets[low] : doc.content.size;
}

/** {@link blockGapAt} measured on the rendered view. */
export function viewBlockGapAt(view: EditorView, clientY: number): number {
  return blockGapAt(view.state.doc, clientY, (offset) => {
    const dom = view.nodeDOM(offset);
    if (!(dom instanceof HTMLElement)) return null;
    const rect = dom.getBoundingClientRect();
    return rect.top + rect.height / 2;
  });
}

/** Whether a drag carries files the editor would take. The files themselves
 stay hidden until the drop; their kind and type are readable while dragging. */
function carriesFiles(transfer: DataTransfer | null, imagesOnly: boolean): boolean {
  if (!transfer?.types.includes("Files")) return false;
  if (!imagesOnly) return true;
  return Array.from(transfer.items).some(
    (item) => item.kind === "file" && item.type.startsWith("image/")
  );
}

function setGap(view: EditorView, gap: number | null) {
  if (fileDropKey.getState(view.state) === gap) return;
  view.dispatch(view.state.tr.setMeta(fileDropKey, gap));
}

export interface FileDropOptions {
  /** Whether the editor takes files right now, and only images. Read at each
   drag: a surface's uploads can come and go after the editor is built. */
  accepts: () => { imagesOnly: boolean } | null;
}

export const FileDrop = Extension.create<FileDropOptions>({
  name: "fileDrop",

  addOptions() {
    return { accepts: () => null };
  },

  addProseMirrorPlugins() {
    const { accepts } = this.options;
    return [
      new Plugin<number | null>({
        key: fileDropKey,
        state: {
          init: () => null,
          apply(tr, gap) {
            const meta = tr.getMeta(fileDropKey) as number | null | undefined;
            if (meta !== undefined) return meta;
            return gap === null ? null : tr.mapping.map(gap);
          },
        },
        props: {
          decorations(state) {
            const gap = fileDropKey.getState(state);
            if (gap === null || gap === undefined) return null;
            return DecorationSet.create(state.doc, [
              Decoration.widget(
                gap,
                () => {
                  const line = document.createElement("div");
                  line.className = LINE_CLASS;
                  line.setAttribute("aria-hidden", "true");
                  return line;
                },
                { side: -1, key: "file-drop-line" }
              ),
            ]);
          },
          handleDOMEvents: {
            // Returning true keeps ProseMirror's own drop cursor, which marks a
            // text position, from showing a second place.
            dragover(view, event) {
              const accepted = accepts();
              if (!accepted || !carriesFiles(event.dataTransfer, accepted.imagesOnly)) return false;
              event.preventDefault();
              setGap(view, viewBlockGapAt(view, event.clientY));
              return true;
            },
            dragleave(view, event) {
              const next = event.relatedTarget;
              if (next instanceof Node && view.dom.contains(next)) return false;
              setGap(view, null);
              return false;
            },
            drop(view) {
              setGap(view, null);
              return false;
            },
            dragend(view) {
              setGap(view, null);
              return false;
            },
          },
        },
      }),
    ];
  },
});
