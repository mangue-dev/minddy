"use client";

// The “/” menu of a page. Same mechanics as that of the notebook
// (components/scratchpad/slash-command.tsx) — including porting to the body of the
// document, for the same reason: in a scrolling panel, a menu in
// position absolue se fait couper par son conteneur.
//
// The difference is in one line, and that's the whole point of the ticket: this menu
// has NO block list. It displays what `slashItems()` returns to it and places
// the block by `insertBlock()`. Adding a table block will not require any
// revenir.

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Extension, type Editor, type Range } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import { Suggestion, type SuggestionProps } from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";
import { cn } from "mangue-ui";
import {
  insertBlock,
  slashItems,
  type PageBlock,
} from "@/components/pages/blocks";

/** What the menu needs to know in one block, once the keys have been translated.
 The translation is done OUTSIDE: the register has no translator. */
export interface PageSlashItem {
  block: PageBlock;
  label: string;
}

/** The translated catalog, in menu order. `t` comes from the calling component
 (namespace `Pages`), typed with its namespace — without it, TypeScript gives up
 (TS2589) and no longer checks any keys. */
export function pageSlashItems(
  t: (key: PageBlock["labelKey"]) => string
): PageSlashItem[] {
  return slashItems().map((block) => ({
    block,
    label: t(block.labelKey),
  }));
}

/** The menu filter: the TRANSLATED label first, then the aliases of the
 descriptor — which carry both languages, because we type “quote” on
 a French interface. */
export function filterSlashItems(
  items: PageSlashItem[],
  query: string
): PageSlashItem[] {
  const q = query.toLowerCase().trim();
  if (!q) return items;
  return items.filter(
    (item) =>
      item.label.toLowerCase().includes(q) ||
      item.block.slash.keywords.some((k) => k.toLowerCase().includes(q))
  );
}

interface SlashMenuRef {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

type SlashProps = SuggestionProps<PageSlashItem>;

const SlashMenu = forwardRef<SlashMenuRef, SlashProps>(function SlashMenu(
  props,
  ref
) {
  const [selected, setSelected] = useState(0);
  useEffect(() => setSelected(0), [props.items]);

  /**
 * The keyboard TAKES OVER the mouse.
 *
 * The two were fighting: arrows scroll the list, scrolling
 * passes a line under the stationary pointer, `mouseenter` triggers
 * and the selection jumps to where is the mouse — the next arrow starts again from
 * this line, and we no longer go down. As soon as you navigate with the keyboard, the
 * list therefore becomes insensitive to the pointer (and without a painted hover, which
 * would designate a second line), until the next REAL mouse movement.
 */
  const [keyboard, setKeyboard] = useState(false);
  useEffect(() => {
    if (!keyboard) return;
    const wake = () => setKeyboard(false);
    // `mousemove` and not `mouseover`: it is the movement which returns the hand to the
    // mouse, not the fact that a line went underneath by itself.
    window.addEventListener("mousemove", wake, { once: true });
    return () => window.removeEventListener("mousemove", wake);
  }, [keyboard]);

  // The SCROLLS menu with the arrows. Without that the active line would go out of the frame
  // from the fourth ↓: the keyboard continued to work, but we could not
  // could no longer see what we were choosing. `nearest`: we do not recenter a line
  // already visible, which would cause the list to jump with each press.
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-slash-index="${selected}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const choose = (index: number) => {
    const item = props.items[index];
    if (item) props.command(item);
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: (event) => {
      const n = props.items.length;
      if (n === 0) return false;
      if (event.key === "ArrowUp") {
        setKeyboard(true);
        setSelected((s) => (s - 1 + n) % n);
        return true;
      }
      if (event.key === "ArrowDown") {
        setKeyboard(true);
        setSelected((s) => (s + 1) % n);
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        choose(selected);
        return true;
      }
      return false;
    },
  }));

  if (props.items.length === 0) return null;

  const rows: ReactNode[] = props.items.map((item, index) => {
    const Icon = item.block.icon;
    return (
      <button
        type="button"
        key={item.block.id}
        data-slash-index={index}
        onMouseDown={(e) => e.preventDefault()}
        onMouseEnter={() => {
          if (!keyboard) setSelected(index);
        }}
        onClick={() => choose(index)}
        className={cn(
          "flex w-full items-center gap-2.5 scroll-my-1.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
          index === selected ? "bg-muted text-foreground" : "text-foreground/90",
          // During keyboard navigation, the mouse no longer paints anything:
          // two lines lit, that would be two responses to “Enter”.
          keyboard && "pointer-events-none"
        )}
      >
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{item.label}</span>
      </button>
    );
  });

  return (
    <div className="min-w-52 overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-lg">
      <div
        ref={listRef}
        className="scrollbar-quiet max-h-80 overflow-y-auto overscroll-contain"
      >
        {rows}
      </div>
    </div>
  );
});

/** Marks the menu carried in the body of the document, so that a dialog can
 distinguish a click inside it from a click outside it. */
export const PAGE_SLASH_MENU_ATTR = "data-page-slash-menu";

const EDGE = 8;
const GAP = 6;

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
    const openBelow = h <= below || below >= above;
    const top = openBelow ? rect.bottom + GAP : rect.top - GAP - h;
    const clamp = (v: number, max: number) =>
      Math.round(Math.min(Math.max(v, EDGE), Math.max(EDGE, max)));
    menuEl.style.top = `${clamp(top, window.innerHeight - h - EDGE)}px`;
    menuEl.style.left = `${clamp(rect.left, window.innerWidth - w - EDGE)}px`;
  };

  // The size of the menu only applies to the next frame after a change of
  // props: without this second pass, a filtered list is placed with its
  // height from before.
  const reposition = () => {
    place();
    requestAnimationFrame(place);
  };

  return {
    onStart: (props: SlashProps) => {
      renderer = new ReactRenderer(SlashMenu, { props, editor: props.editor });
      menuEl = renderer.element as HTMLElement;
      menuEl.setAttribute(PAGE_SLASH_MENU_ATTR, "");
      menuEl.style.position = "fixed";
      menuEl.style.zIndex = "60";
      menuEl.style.pointerEvents = "auto";
      caretRect = () => props.clientRect?.() ?? null;
      document.body.appendChild(menuEl);
      reposition();
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

/** The “/” extension of a page. Configured with the TRANSLATED catalog. */
export const PageSlashCommand = Extension.create<{ items: PageSlashItem[] }>({
  name: "pageSlashCommand",

  addOptions() {
    return { items: [] };
  },

  addProseMirrorPlugins() {
    const items = () => this.options.items;
    return [
      Suggestion<PageSlashItem>({
        // pnpm resolves @tiptap/core twice (same version) — the editor
        // Extension does not have the same identity as that of @tiptap/suggestion.
        // No effect at runtime, as in the notebook.
        editor: this.editor as never,
        // A KEY to yourself. `Suggestion` sets one by default, the same for
        // everyone (`suggestion$`): bring up the “/” menu and the
        // suggestion “@” on the same editor then raised ProseMirror
        // during assembly (“Adding different instances of a keyed plugin”). THE
        // two only crossed when opening a page, the only surface to
        // wear both.
        pluginKey: new PluginKey("pageSlashCommand"),
        char: "/",
        allowSpaces: false,
        items: ({ query }) => filterSlashItems(items(), query),
        command: ({ editor, range, props }) =>
          insertBlock(props.block, editor as unknown as Editor, range as Range),
        render: renderSlashMenu,
      }),
    ];
  },
});
