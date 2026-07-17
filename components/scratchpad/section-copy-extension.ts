import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/**
 * A hover "copy" button glued to every heading in the WYSIWYG note, so a whole
 * section (heading + its content, until the next heading) can be copied as an
 * agent prompt without leaving the single editable view. Implemented as a
 * ProseMirror widget decoration (not a NodeView) so it never touches the
 * heading's editable content or the cursor. `onCopy` gets the heading's 0-based
 * index among all headings — the caller maps it to the section markdown.
 */
export interface SectionCopyOptions {
  onCopy: (headingIndex: number) => void;
  label: string;
}

const COPY_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';

export const SectionCopy = Extension.create<SectionCopyOptions>({
  name: "sectionCopy",

  addOptions() {
    return { onCopy: () => {}, label: "Copy section" };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    return [
      new Plugin({
        key: new PluginKey("sectionCopy"),
        props: {
          decorations: (state) => {
            const decorations: Decoration[] = [];
            let headingIndex = -1;
            state.doc.descendants((node, pos) => {
              if (node.type.name !== "heading") return;
              headingIndex += 1;
              const index = headingIndex;
              decorations.push(
                Decoration.widget(
                  pos + 1,
                  () => {
                    const btn = document.createElement("button");
                    btn.type = "button";
                    btn.className = "scratchpad-section-copy";
                    btn.contentEditable = "false";
                    btn.setAttribute("aria-label", options.label);
                    btn.title = options.label;
                    btn.innerHTML = COPY_SVG;
                    // Keep focus/selection in the editor; just copy.
                    btn.addEventListener("mousedown", (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    });
                    btn.addEventListener("click", (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      options.onCopy(index);
                    });
                    return btn;
                  },
                  { side: -1, ignoreSelection: true, key: `section-copy-${index}` }
                )
              );
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
