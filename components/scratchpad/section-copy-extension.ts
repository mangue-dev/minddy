import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/**
 * Hover buttons glued to every heading in the WYSIWYG note: “copy the
 * section” and “launch an agent” on the section (MIN-84) — the section = the
 * heading + its content until the next heading. Implemented as ProseMirror
 * widget decorations (not NodeViews) so they never touch the heading's editable
 * content or the cursor. `onCopy` / `onLaunch` get the heading's 0-based index
 * among all headings — the caller maps it to the section markdown.
 *
 * While a button is hovered/focused it also shows two pieces of shared "hover
 * chrome", both parented to the `.scratchpad-editor` container:
 * - a tinted box behind the exact section targeted (heading → the last block
 * before the next heading of the SAME or a shallower level, sub-sections
 * included), so the target is unmistakable;
 * - a styled tooltip on the button (matching the app's tooltips) instead of a
 * raw browser `title`.
 */
export interface SectionCopyOptions {
  onCopy: (headingIndex: number) => void;
  label: string;
  /** “Launch an agent” on the section (absent → button not rendered). */
  onLaunch?: (headingIndex: number) => void;
  launchLabel?: string;
}

const COPY_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';

/** Numo's face, drawn without JS (components/numo-face.tsx) but as an inline
 * string, like the copy icon above — the ProseMirror widget builds DOM by hand.
 * Same 48×39 viewBox as NumoFace, scaled to sit in a 24px round button. */
const NUMO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="11.4" viewBox="0 0 48 39" fill="none" stroke="currentColor" stroke-width="4"><path d="M23.8996 3.21557C25.4759 2.44665 29.3385 1.05454 33.2319 3.27615C35.0641 4.33347 36.6562 6.00186 37.7947 8.13354C38.145 8.78951 38.7431 9.33539 39.52 9.5761C40.6291 9.9197 41.6323 10.6383 42.3712 11.736L42.5156 11.961C43.4434 13.4863 43.584 15.2825 43.4928 16.6594L43.4412 17.2221C43.3542 17.9629 43.5188 18.7418 43.9467 19.393C44.3102 19.9464 44.6176 20.5596 44.859 21.2186L44.863 21.2274C44.8949 21.3133 44.9204 21.3924 44.9617 21.5131L44.9627 21.5131C46.0659 24.8969 45.0541 28.8267 42.6654 31.0035L42.6557 31.0124C41.4435 32.1318 40.0583 32.8799 38.6154 33.2331L38.3266 33.2987C37.7481 33.4176 37.163 33.4712 36.5782 33.4617C35.5552 33.4384 34.5359 33.2231 33.5562 32.8171C32.5162 32.3862 31.3991 32.6321 30.6206 33.3148L30.4697 33.457C28.6657 35.2811 26.7176 36.0813 24.6799 36.0458C23.827 36.0229 22.9763 35.8766 22.146 35.6054L21.792 35.4818C20.5759 35.0276 19.4043 34.3936 18.3051 33.59L17.8379 33.2344L17.6763 33.1158C16.9064 32.5899 15.9319 32.4753 15.058 32.8262L14.8728 32.9089C13.6741 33.4923 12.401 33.7704 11.1289 33.7388L11.1211 33.7389C10.7578 33.7313 10.3942 33.7009 10.0328 33.6483L10.0319 33.6483C7.90779 33.3326 5.97346 32.1957 4.5896 30.4096C4.43645 30.2113 3.50228 28.9604 2.81913 27.1401C2.13631 25.3204 1.75602 23.0761 2.48491 20.7673L2.48393 20.7663C2.96063 19.2693 3.80805 18.019 4.87988 17.0881C5.64744 16.4214 5.98314 15.4525 5.95213 14.5575C5.90789 13.2808 6.08932 11.4891 7.08327 9.83242L7.08425 9.83144C8.34469 7.72609 10.1388 7.13277 11.0575 6.95863C11.8334 6.81157 12.3558 6.31912 12.6431 5.85971L12.648 5.85286C13.5742 4.35935 14.8686 3.39572 16.2357 3.02841C16.359 2.99627 16.4863 2.96573 16.6133 2.93808L16.6621 2.92715C18.3402 2.57703 20.0655 2.71004 21.7027 3.32172C22.4249 3.59157 23.2144 3.5497 23.8996 3.21557Z" stroke-linejoin="round"/><rect x="16" y="12" width="4" height="6" rx="2" fill="currentColor" stroke="none"/><rect x="27" y="12" width="4" height="6" rx="2" fill="currentColor" stroke="none"/><path d="M20.5 21L20.7519 21.1679C21.5657 21.7105 22.5219 22 23.5 22C24.4946 22 25.4663 21.7014 26.2893 21.143L26.5 21" stroke-width="3" stroke-linecap="round"/></svg>';

/** Rank of a title (1–3 in the editor), 0 for any other block. */
const headingRank = (el: Element): number =>
  /^H[1-6]$/.test(el.tagName) ? Number(el.tagName[1]) : 0;

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
      // heading of the same or a shallower level (or the document end): the
      // subsections are part of the section, and the gesture takes them away (cf.
      // scratchpadSectionSubtree) — the box should say the same thing.
      const rank = headingRank(heading);
      let last: HTMLElement = heading;
      for (
        let el = heading.nextElementSibling;
        el;
        el = el.nextElementSibling
      ) {
        const r = headingRank(el);
        if (r > 0 && r <= rank) break;
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
            // FIRST LEVEL titles only: a section of the notebook is
            // a title of the note, not a `#` lost in a quote or a
            // list. This is also what keeps this index equal to that which counts
            // markdown (lib/scratchpad.ts) — a nested title is written there
            // “> #…” and does not count there, so the gesture would apply elsewhere.
            state.doc.forEach((node, pos) => {
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
              // “Launch an agent” on the section (MIN-84) — to the left of the copy.
              if (options.onLaunch) {
                const onLaunch = options.onLaunch;
                decorations.push(
                  Decoration.widget(
                    pos + 1,
                    () =>
                      makeButton(
                        "scratchpad-section-launch",
                        NUMO_SVG,
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
