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
 *
 * While the button is hovered/focused it also shows two pieces of shared "hover
 * chrome", both parented to the `.scratchpad-editor` container:
 *   - a tinted box behind the exact section that will be copied (heading → the
 *     last block before the next heading), so the copy target is unmistakable;
 *   - a styled tooltip on the button (matching the app's tooltips) instead of a
 *     raw browser `title`.
 */
export interface SectionCopyOptions {
  onCopy: (headingIndex: number) => void;
  label: string;
}

const COPY_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';

const HEADING_TAGS = new Set(["H1", "H2", "H3"]);

export const SectionCopy = Extension.create<SectionCopyOptions>({
  name: "sectionCopy",

  addOptions() {
    return { onCopy: () => {}, label: "Copy section" };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    const editor = this.editor;

    // Shared hover chrome (one tinted box + one tooltip, reused across headings),
    // created lazily and parented to the positioned `.scratchpad-editor` so both
    // can be placed with container-relative coordinates.
    let chrome: {
      container: HTMLElement;
      box: HTMLElement;
      tip: HTMLElement;
    } | null = null;

    const ensureChrome = () => {
      if (chrome) return chrome;
      const container = editor.view.dom.closest(
        ".scratchpad-editor"
      ) as HTMLElement | null;
      if (!container) return null;
      const box = document.createElement("div");
      box.className = "scratchpad-section-box";
      box.setAttribute("aria-hidden", "true");
      const tip = document.createElement("div");
      tip.className = "scratchpad-section-tip";
      tip.setAttribute("role", "tooltip");
      container.append(box, tip);
      chrome = { container, box, tip };
      return chrome;
    };

    const showFor = (btn: HTMLElement) => {
      const c = ensureChrome();
      if (!c) return;
      const heading = btn.closest("h1, h2, h3") as HTMLElement | null;
      if (!heading) return;
      const cRect = c.container.getBoundingClientRect();

      // Tinted box spans the heading down to the last block before the next
      // heading (or the document end).
      let last: HTMLElement = heading;
      for (
        let el = heading.nextElementSibling;
        el;
        el = el.nextElementSibling
      ) {
        if (HEADING_TAGS.has(el.tagName)) break;
        last = el as HTMLElement;
      }
      const hRect = heading.getBoundingClientRect();
      const lRect = last.getBoundingClientRect();
      c.box.style.top = `${hRect.top - cRect.top}px`;
      c.box.style.height = `${lRect.bottom - hRect.top}px`;
      c.box.classList.add("is-visible");

      // Tooltip centered above the button.
      const bRect = btn.getBoundingClientRect();
      c.tip.textContent = options.label;
      c.tip.style.left = `${bRect.left - cRect.left + bRect.width / 2}px`;
      c.tip.style.top = `${bRect.top - cRect.top}px`;
      c.tip.classList.add("is-visible");
    };

    const hide = () => {
      if (!chrome) return;
      chrome.box.classList.remove("is-visible");
      chrome.tip.classList.remove("is-visible");
    };

    return [
      new Plugin({
        key: new PluginKey("sectionCopy"),
        view() {
          return {
            destroy() {
              if (!chrome) return;
              chrome.box.remove();
              chrome.tip.remove();
              chrome = null;
            },
          };
        },
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
                    // Reveal the copy target + tooltip while the button is the
                    // pointer/keyboard focus.
                    btn.addEventListener("mouseenter", () => showFor(btn));
                    btn.addEventListener("mouseleave", hide);
                    btn.addEventListener("focus", () => showFor(btn));
                    btn.addEventListener("blur", hide);
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
