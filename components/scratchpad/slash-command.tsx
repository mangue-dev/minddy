"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
  type ComponentType,
} from "react";
import { Extension, type Editor, type Range } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import { Suggestion, type SuggestionProps } from "@tiptap/suggestion";
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
  useEffect(() => setSelected(0), [props.items]);

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

/** Imperative render for the suggestion utility: the menu lives INSIDE the
    editor wrapper (absolute, wrapper-local coordinates) so it isn't affected by
    the dialog's transform and doesn't count as an "outside" click. */
function renderSlashMenu() {
  let renderer: ReactRenderer<SlashMenuRef, SlashProps> | null = null;
  let menuEl: HTMLElement | null = null;
  let wrapperEl: HTMLElement | null = null;

  const place = (rect: DOMRect | null | undefined) => {
    if (!menuEl || !wrapperEl || !rect) return;
    const wrap = wrapperEl.getBoundingClientRect();
    const menuH = menuEl.offsetHeight;
    const openBelow = rect.bottom + 6 + menuH <= window.innerHeight - 8;
    menuEl.style.position = "absolute";
    menuEl.style.zIndex = "50";
    menuEl.style.top = `${
      openBelow ? rect.bottom - wrap.top + 6 : rect.top - wrap.top - menuH - 6
    }px`;
    menuEl.style.left = `${rect.left - wrap.left}px`;
  };

  return {
    onStart: (props: SlashProps) => {
      renderer = new ReactRenderer(SlashMenu, {
        props,
        editor: props.editor,
      });
      menuEl = renderer.element as HTMLElement;
      wrapperEl =
        (props.editor.view.dom.closest(".scratchpad-editor") as HTMLElement) ??
        null;
      wrapperEl?.appendChild(menuEl);
      place(props.clientRect?.());
    },
    onUpdate: (props: SlashProps) => {
      renderer?.updateProps(props);
      place(props.clientRect?.());
    },
    onKeyDown: (props: { event: KeyboardEvent }) => {
      if (props.event.key === "Escape") return false;
      return renderer?.ref?.onKeyDown(props.event) ?? false;
    },
    onExit: () => {
      menuEl?.remove();
      renderer?.destroy();
      renderer = null;
      menuEl = null;
      wrapperEl = null;
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
