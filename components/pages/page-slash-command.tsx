"use client";

// The “/” menu of every rich text surface (MIN-728): it is ported to the body
// of the document, because in a scrolling panel a menu in absolute position is
// cut by its container.
//
// This menu has NO block list. It displays what `slashItems()` returns to it,
// plus the actions a surface adds, and places a block with `insertBlock()`.
// Adding a table block will not require coming back here.

import { OVERLAY_COLLISION_PADDING } from "@/components/ui/menu-surface";
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
import { Suggestion, exitSuggestion, type SuggestionProps } from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";
import { cn } from "@/lib/utils";
import { MENU_ROW_ACTIVE_CLASS, MENU_ROW_CLASS } from "@/components/ui/menu-surface";
import {
  SLASH_GROUPS,
  insertBlock,
  slashItems,
  type PageBlock,
  type SlashGroup,
} from "@/components/pages/blocks";
import { groupBySection, stepSuggestion } from "@/lib/suggestion-menu";
import {
  SuggestionMenu,
} from "@/components/editor/suggestion-menu";
import {
  findSpacedSuggestionMatch,
  SUGGESTION_CHIP_CLASS,
  SUGGESTION_CHIP_EMPTY_CLASS,
  suggestionPlaceholder,
} from "@/components/editor/suggestion-chip";

/** The section an entry is listed under, with its translated header. */
export interface PageSlashSection {
  id: string;
  label: string;
}

/** One entry of the menu, once the keys have been translated. The translation
 is done OUTSIDE: the register has no translator.

 A BLOCK entry carries its descriptor; a surface ACTION (the notebook's
 dictation, MIN-728) carries what it runs instead. Both filter and render the
 same way, so the menu itself never knows which is which. An entry without a
 `section` (a routine's skills) is listed without a header. */
export type PageSlashItem =
  | {
      key: string;
      label: string;
      icon: PageBlock["icon"];
      keywords: string[];
      section?: PageSlashSection;
      block: PageBlock;
    }
  | {
      key: string;
      label: string;
      icon: PageBlock["icon"];
      keywords: string[];
      section?: PageSlashSection;
      block?: undefined;
      run: (editor: Editor, range: Range) => void;
    };

type PagesTranslator = (key: PageBlock["labelKey"]) => string;

/** The section of a registry group, translated: for a surface action listed
 with the blocks of that group. */
export function slashSection(t: PagesTranslator, group: SlashGroup): PageSlashSection {
  const entry = SLASH_GROUPS.find((candidate) => candidate.group === group) ?? SLASH_GROUPS[0];
  return { id: entry.group, label: t(entry.labelKey) };
}

/** The translated catalog, in menu order. `t` comes from the calling component
 (namespace `Pages`), typed with its namespace — without it, TypeScript gives up
 (TS2589) and no longer checks any keys. */
export function pageSlashItems(
  t: PagesTranslator,
  options?: Parameters<typeof slashItems>[0]
): PageSlashItem[] {
  return slashItems(options).map((block) => ({
    key: block.id,
    block,
    label: t(block.labelKey),
    icon: block.icon,
    keywords: block.slash.keywords,
    section: slashSection(t, block.slash.group),
  }));
}

/** The entries in the order the menu lists them: section by section, each
 section where its first entry stands. */
export function sectionedSlashItems(items: readonly PageSlashItem[]) {
  return groupBySection(items, (item) => item.section?.id);
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

type SlashProps = SuggestionProps<PageSlashItem> & {
  /** Closes the menu and leaves the typed text as text. */
  close: () => void;
};

const SlashMenu = forwardRef<SlashMenuRef, SlashProps>(function SlashMenu(
  props,
  ref
) {
  // The flat order the keyboard walks: section after section. Index
  // `items.length` is the “Close menu” row under the list.
  const { ordered: items, sections } = sectionedSlashItems(props.items);
  const count = items.length;
  const [selected, setSelected] = useState(0);
  // An empty list highlights no row, so Enter keeps its meaning in the text
  // during the render before a query with no match closes the menu.
  useEffect(() => setSelected(props.items.length ? 0 : -1), [props.items]);

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
  // The first row also brings its section header back into view.
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = listRef.current;
    if (!list || selected < 0 || selected >= count) return;
    if (selected === 0) {
      list.scrollTop = 0;
      return;
    }
    list
      .querySelector<HTMLElement>(`[data-slash-index="${selected}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selected, count]);

  const choose = (index: number) => {
    if (index === count) {
      props.close();
      return;
    }
    const item = items[index];
    if (item) props.command(item);
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: (event) => {
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        setKeyboard(true);
        setSelected((s) => stepSuggestion(s, count, event.key === "ArrowUp" ? "up" : "down"));
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        if (selected < 0) return false;
        choose(selected);
        return true;
      }
      return false;
    },
  }));

  return (
    <SuggestionMenu
      sections={sections}
      sectionLabel={(id) => sections.find((section) => section.id === id)?.items[0]?.section?.label ?? null}
      listRef={listRef}
      className="w-60"
      listClassName="max-h-80"
      quiet={keyboard}
      closeActive={selected === count}
      onClose={props.close}
      onCloseHover={() => {
        if (!keyboard) setSelected(count);
      }}
      closeWhenEmpty={props.query !== "" && !props.loading}
      renderItem={(item, index): ReactNode => (
        <button
          type="button"
          role="option"
          aria-selected={index === selected}
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
            MENU_ROW_CLASS,
            "text-foreground",
            index === selected && MENU_ROW_ACTIVE_CLASS,
            // During keyboard navigation, the mouse no longer paints anything:
            // two lines lit, that would be two responses to “Enter”.
            keyboard && "pointer-events-none"
          )}
        >
          <AppIcon icon={item.icon} className="size-4 shrink-0" />
          <span className="truncate">{item.label}</span>
        </button>
      )}
    />
  );
});

/** Marks the menu carried in the body of the document, so that a dialog can
 distinguish a click inside it from a click outside it. */
export const PAGE_SLASH_MENU_ATTR = "data-page-slash-menu";

const EDGE = OVERLAY_COLLISION_PADDING;
const GAP = 6;

/** The menu of one suggestion; `pluginKey` is that suggestion's, which
 “Close menu” exits as Escape does. */
export function renderSlashMenu(pluginKey: PluginKey) {
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

  const withClose = (suggestion: SuggestionProps<PageSlashItem>): SlashProps => ({
    ...suggestion,
    close: () => {
      const { view } = suggestion.editor;
      exitSuggestion(view, pluginKey);
      view.focus();
    },
  });

  return {
    onStart: (suggestion: SuggestionProps<PageSlashItem>) => {
      const props = withClose(suggestion);
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
    onUpdate: (suggestion: SuggestionProps<PageSlashItem>) => {
      const props = withClose(suggestion);
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
  /** The muted “Type to search” after an empty “/”, read at each state. */
  placeholder?: () => string;
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
    const pluginKey = new PluginKey("pageSlashCommand");
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
        pluginKey,
        char: "/",
        // One space stays in a typed query, two end it, and a space right
        // after the bare “/” ends it at once (the text stays): the same rule
        // as the “@” menu.
        allowSpaces: true,
        findSuggestionMatch: findSpacedSuggestionMatch,
        // The search chip (components/editor/suggestion-chip.ts).
        decorationClass: SUGGESTION_CHIP_CLASS,
        decorationEmptyClass: SUGGESTION_CHIP_EMPTY_CLASS,
        items: ({ query }) => filterSlashItems(items(), query),
        command: ({ editor, range, props }) => {
          if (props.block) insertBlock(props.block, editor as unknown as Editor, range as Range);
          else props.run(editor as unknown as Editor, range as Range);
        },
        render: () => renderSlashMenu(pluginKey),
      }),
      suggestionPlaceholder(pluginKey, "pageSlashCommand", () => this.options.placeholder?.()),
    ];
  },
});
