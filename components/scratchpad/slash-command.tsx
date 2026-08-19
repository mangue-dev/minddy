"use client";

import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useState,
  type ComponentType,
} from "react";
import { Extension, type Editor, type Range } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import { Suggestion, type SuggestionProps } from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";
import { cn } from "mangue-ui";

/** One entry of the `/` menu. `run` receives the editor and the range of the
    `/query` text to replace. */
export interface SlashItem {
  title: string;
  icon: ComponentType<{ className?: string }>;
  keywords: string[];
  run: (editor: Editor, range: Range) => void;
}

interface SlashMenuRef {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

type SlashProps = SuggestionProps<SlashItem>;

const SlashMenu = forwardRef<SlashMenuRef, SlashProps>(function SlashMenu(
  props,
  ref
) {
  const [selected, setSelected] = useState(0);
  // Suggestion creates a fresh `items` array for every editor transaction,
  // including selection-only updates. Resetting from that array made a hovered
  // entry jump back to the first row while the pointer was still over the
  // menu. The query is the actual new search, so reset only when it changes.
  // Use a layout effect so the former highlighted row is never painted for a
  // newly filtered list.
  useLayoutEffect(() => setSelected(0), [props.query]);

  const choose = (index: number) => {
    const item = props.items[index];
    if (item) props.command(item);
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: (event) => {
      const n = props.items.length;
      if (n === 0) return false;
      if (event.key === "ArrowUp") {
        setSelected((s) => (s - 1 + n) % n);
        return true;
      }
      if (event.key === "ArrowDown") {
        setSelected((s) => (s + 1) % n);
        return true;
      }
      if (event.key === "Enter") {
        choose(selected);
        return true;
      }
      return false;
    },
  }));

  if (props.items.length === 0) return null;

  return (
    <div className="min-w-52 overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-lg">
      {props.items.map((item, index) => (
        <button
          type="button"
          key={item.title}
          onMouseDown={(e) => e.preventDefault()}
          onMouseEnter={() => setSelected(index)}
          onClick={() => choose(index)}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
            index === selected
              ? "bg-muted text-foreground"
              : "text-foreground/90"
          )}
        >
          <item.icon className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{item.title}</span>
        </button>
      ))}
    </div>
  );
});

/** Marks the portaled menu so the notebook dialog can tell a click in it apart
    from a click outside itself (see components/scratchpad/scratchpad-modal.tsx). */
export const SLASH_MENU_ATTR = "data-slash-menu";

/** Viewport breathing room, and the gap between the caret and the menu. */
const EDGE = 8;
const GAP = 6;

/**
 * Imperative render for the suggestion utility. The menu is portaled to <body>
 * and positioned in VIEWPORT coordinates: inside the note it was clipped by the
 * scroll container, and anchoring it to the dialog is no better — the dialog is
 * `-translate-1/2`, which makes it the containing block of any fixed child and
 * clips them anyway (`overflow-hidden`).
 *
 * Living outside the dialog costs two things, both handled: a modal Radix dialog
 * sets `pointer-events: none` on everything below it (so the menu re-enables its
 * own), and it reads a click in the menu as a click outside itself (so the menu
 * is tagged, and ScratchpadModal keeps the dialog open for those).
 */
function renderSlashMenu() {
  let renderer: ReactRenderer<SlashMenuRef, SlashProps> | null = null;
  let menuEl: HTMLElement | null = null;
  let caretRect: (() => DOMRect | null) | null = null;

  const place = () => {
    const rect = caretRect?.();
    if (!menuEl || !rect) return;
    const { offsetWidth: w, offsetHeight: h } = menuEl;
    const below = window.innerHeight - rect.bottom - GAP - EDGE;
    const above = rect.top - GAP - EDGE;
    // Below the caret by default; flip up when it doesn't fit there and the room
    // above is better. Then clamp, so a menu taller than either side still lands
    // inside the window instead of running off it.
    const openBelow = h <= below || below >= above;
    const top = openBelow ? rect.bottom + GAP : rect.top - GAP - h;
    const clamp = (v: number, max: number) =>
      Math.round(Math.min(Math.max(v, EDGE), Math.max(EDGE, max)));
    menuEl.style.top = `${clamp(top, window.innerHeight - h - EDGE)}px`;
    menuEl.style.left = `${clamp(rect.left, window.innerWidth - w - EDGE)}px`;
  };

  // React renders the menu through EditorContent's portals, so after a props
  // change the new size only lands on the next frame — measure again then, or a
  // filtered-down list would be placed with its previous height.
  const reposition = () => {
    place();
    requestAnimationFrame(place);
  };

  return {
    onStart: (props: SlashProps) => {
      renderer = new ReactRenderer(SlashMenu, {
        props,
        editor: props.editor,
      });
      menuEl = renderer.element as HTMLElement;
      menuEl.setAttribute(SLASH_MENU_ATTR, "");
      menuEl.style.position = "fixed";
      menuEl.style.zIndex = "60"; // above the dialog (z-50), like tooltips
      menuEl.style.pointerEvents = "auto";
      caretRect = () => props.clientRect?.() ?? null;
      document.body.appendChild(menuEl);
      reposition();
      // The caret moves under the menu when the note scrolls or the window is
      // resized, and the suggestion plugin only calls us on doc/selection change.
      window.addEventListener("scroll", place, true);
      window.addEventListener("resize", place);
    },
    onUpdate: (props: SlashProps) => {
      renderer?.updateProps(props);
      caretRect = () => props.clientRect?.() ?? null;
      reposition();
    },
    onKeyDown: (props: { event: KeyboardEvent }) => {
      if (props.event.key === "Escape") return false;
      return renderer?.ref?.onKeyDown(props.event) ?? false;
    },
    onExit: () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      menuEl?.remove();
      renderer?.destroy();
      renderer = null;
      menuEl = null;
      caretRect = null;
    },
  };
}

/** `/` menu extension. Configure with the (localized) item list. */
export const SlashCommand = Extension.create<{ items: SlashItem[] }>({
  name: "slashCommand",

  addOptions() {
    return { items: [] };
  },

  addProseMirrorPlugins() {
    const items = () => this.options.items;
    return [
      Suggestion<SlashItem>({
        // pnpm dual @tiptap/core (same 3.27.4) — Extension's editor reads as a
        // different identity than @tiptap/suggestion's. Runtime is fine.
        editor: this.editor as never,
        // A KEY to yourself. `Suggestion` sets one by default, the same for
        // everyone: two suggestions on the same editor (a “/” menu
        // and an “@”) cause ProseMirror to raise on editing. The notebook does not have
        // more mentions — the key is there so that the day we get it
        // add not an error screen (this is what happened to the
        // page, MIN-270).
        pluginKey: new PluginKey("scratchpadSlashCommand"),
        char: "/",
        allowSpaces: false,
        command: ({ editor, range, props }) =>
          props.run(editor as never, range as never),
        items: ({ query }) => {
          const q = query.toLowerCase().trim();
          const all = items();
          if (!q) return all;
          return all.filter(
            (item) =>
              item.title.toLowerCase().includes(q) ||
              item.keywords.some((k) => k.toLowerCase().includes(q))
          );
        },
        render: renderSlashMenu,
      }),
    ];
  },
});
