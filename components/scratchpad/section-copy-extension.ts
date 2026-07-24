import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/**
 * Hover buttons glued to every heading in the WYSIWYG note : « copier la
 * section » et « lancer un agent » sur la section (MIN-84) — la section = le
 * heading + son contenu jusqu'au heading suivant. Implemented as ProseMirror
 * widget decorations (not NodeViews) so they never touch the heading's editable
 * content or the cursor. `onCopy` / `onLaunch` get the heading's 0-based index
 * among all headings — the caller maps it to the section markdown.
 *
 * While a button is hovered/focused it also shows two pieces of shared "hover
 * chrome", both parented to the `.scratchpad-editor` container:
 *   - a tinted box behind the exact section targeted (heading → the last block
 *     before the next heading), so the target is unmistakable;
 *   - a styled tooltip on the button (matching the app's tooltips) instead of a
 *     raw browser `title`.
 */
export interface SectionCopyOptions {
  onCopy: (headingIndex: number) => void;
  label: string;
  /** « Lancer un agent » sur la section (absent → bouton non rendu). */
  onLaunch?: (headingIndex: number) => void;
  launchLabel?: string;
}

const COPY_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';

/** lucide `bot`, même rendu que les icônes React (13px, stroke 2). */
const BOT_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>';

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

    const showFor = (btn: HTMLElement, label: string) => {
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
      c.tip.textContent = label;
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
            // One action button (shared wiring: section chrome + tooltip + click).
            const makeButton = (
              className: string,
              svg: string,
              label: string,
              onClick: () => void
            ): HTMLElement => {
              const btn = document.createElement("button");
              btn.type = "button";
              btn.className = className;
              btn.contentEditable = "false";
              btn.setAttribute("aria-label", label);
              btn.innerHTML = svg;
              // Keep focus/selection in the editor; just act.
              btn.addEventListener("mousedown", (e) => {
                e.preventDefault();
                e.stopPropagation();
              });
              btn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                onClick();
              });
              // Reveal the section target + tooltip while the button is the
              // pointer/keyboard focus.
              btn.addEventListener("mouseenter", () => showFor(btn, label));
              btn.addEventListener("mouseleave", hide);
              btn.addEventListener("focus", () => showFor(btn, label));
              btn.addEventListener("blur", hide);
              return btn;
            };

            const decorations: Decoration[] = [];
            let headingIndex = -1;
            state.doc.descendants((node, pos) => {
              if (node.type.name !== "heading") return;
              headingIndex += 1;
              const index = headingIndex;
              decorations.push(
                Decoration.widget(
                  pos + 1,
                  () =>
                    makeButton("scratchpad-section-copy", COPY_SVG, options.label, () =>
                      options.onCopy(index)
                    ),
                  { side: -1, ignoreSelection: true, key: `section-copy-${index}` }
                )
              );
              // « Lancer un agent » sur la section (MIN-84) — à gauche du copy.
              if (options.onLaunch) {
                const onLaunch = options.onLaunch;
                decorations.push(
                  Decoration.widget(
                    pos + 1,
                    () =>
                      makeButton(
                        "scratchpad-section-launch",
                        BOT_SVG,
                        options.launchLabel ?? options.label,
                        () => onLaunch(index)
                      ),
                    { side: -1, ignoreSelection: true, key: `section-launch-${index}` }
                  )
                );
              }
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
