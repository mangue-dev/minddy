"use client";

// The “/” menu of every rich text surface (MIN-728): it is ported to the body
// of the document, because in a scrolling panel a menu in absolute position is
// cut by its container.
//
// This menu has NO block list. It displays what `slashItems()` returns to it,
// plus the actions a surface adds, and places a block with `insertBlock()`.
// Adding a table block will not require coming back here.

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppIcon } from "@/components/icon";
import { Extension, type Editor, type Range } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import { Suggestion, type SuggestionProps } from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";
import { cn } from "@/lib/utils";
import {
  insertBlock,
  slashItems,
  type PageBlock,
} from "@/components/pages/blocks";

/** One entry of the menu, once the keys have been translated. The translation
 is done OUTSIDE: the register has no translator.

 A BLOCK entry carries its descriptor; a surface ACTION (the notebook's
 dictation, MIN-728) carries what it runs instead. Both filter and render the
 same way, so the menu itself never knows which is which. */
export type PageSlashItem =
  | { key: string; label: string; icon: PageBlock["icon"]; keywords: string[]; block: PageBlock }
  | {
      key: string;
      label: string;
      icon: PageBlock["icon"];
      keywords: string[];
      block?: undefined;
      run: (editor: Editor, range: Range) => void;
    };

/** The translated catalog, in menu order. `t` comes from the calling component
 (namespace `Pages`), typed with its namespace — without it, TypeScript gives up
 (TS2589) and no longer checks any keys. */
export function pageSlashItems(
  t: (key: PageBlock["labelKey"]) => string,
  options?: Parameters<typeof slashItems>[0]
): PageSlashItem[] {
  return slashItems(options).map((block) => ({
    key: block.id,
    block,
    label: t(block.labelKey),
    icon: block.icon,
    keywords: block.slash.keywords,
  }));
}

/** The menu filter: the TRANSLATED label first, then the aliases — which
 carry both languages, because we type “quote” on a French interface. */
export function filterSlashItems(
  items: PageSlashItem[],
  query: string
): PageSlashItem[] {
  const q = query.toLowerCase().trim();
  if (!q) return items;
  return items.filter(
    (item) =>
      item.label.toLowerCase().includes(q) ||
      item.keywords.some((k) => k.toLowerCase().includes(q))
  );
}

/** Whether a mouse event comes from the pointer actually moving. */
export function movedPointer(event: MouseEvent): boolean {
  return event.movementX !== 0 || event.movementY !== 0;
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
    // A REAL movement only. Browsers dispatch a synthetic `mousemove` after
    // scrolling content under a still pointer — exactly what holding an
    // arrow does — and waking on it let the row under the pointer take the
    // selection back between two key repeats: options seemed skipped.
    const wake = (event: MouseEvent) => {
      if (!movedPointer(event)) return;
      setKeyboard(false);
    };
    window.addEventListener("mousemove", wake);
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
    const Icon = item.icon;
    return (
      <button
        type="button"
        key={item.key}
        data-slash-index={index}
        onMouseDown={(e) => e.preventDefault()}
        // `mousemove` with a real movement, not `mouseenter`: a row scrolled
        // under a still pointer must not take the selection.
        onMouseMove={(event) => {
          if (!keyboard && movedPointer(event.nativeEvent)) setSelected(index);
        }}
        onClick={() => choose(index)}
        className={cn(
          // No color transition: with a held arrow the highlight moves faster
          // than a fade, which smeared it over several rows.
          "flex w-full items-center gap-2.5 scroll-my-1.5 rounded-lg px-2 py-1.5 text-left text-sm",
          index === selected ? "bg-muted text-foreground" : "text-foreground/90",
          // During keyboard navigation, the mouse no longer paints anything:
          // two lines lit, that would be two responses to “Enter”.
          keyboard && "pointer-events-none"
        )}
      >
        <AppIcon icon={Icon} className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{item.label}</span>
      </button>
    );
  });

  return (
    <div
      role="listbox"
      data-floating-surface
      className="min-w-52 overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-lg"
    >
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
export const PageSlashCommand = Extension.create<{
  /** The catalog, or a reader of it: a surface whose actions arrive after the
   editor is built (a routine's repository skills) passes a reader, read at
   each "/" — the plugin is built once. */
  items: PageSlashItem[] | (() => PageSlashItem[]);
}>({
  name: "pageSlashCommand",

  addOptions() {
    return { items: [] };
  },

  addProseMirrorPlugins() {
    const items = () => {
      const { items: catalog } = this.options;
      return typeof catalog === "function" ? catalog() : catalog;
    };
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
        command: ({ editor, range, props }) => {
          if (props.block) insertBlock(props.block, editor as unknown as Editor, range as Range);
          else props.run(editor as unknown as Editor, range as Range);
        },
        render: renderSlashMenu,
      }),
    ];
  },
});
