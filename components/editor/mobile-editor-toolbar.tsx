"use client";

// The KEYBOARD TOOLBAR of the editor on a phone, like Notion's or Notes':
// a strip held right above the software keyboard while an editor has the
// focus. It replaces what a touch screen cannot reach comfortably — the
// selection bubble, the block gutter, the “@” and “/” menus that open under a
// caret the keyboard hides:
// - “+” lists the blocks of this editor's catalog in a bottom sheet, and runs
//   the one picked at the caret like the “/” menu would;
// - “@” opens the mentions in a bottom sheet (typing “@” stays a letter);
// - the inline formats, indent/outdent inside a list, comment on a page;
// - the last button puts the keyboard away.
//
// It also keeps the caret in sight: after each change of selection, and when
// the keyboard opens, the line being written is scrolled above the toolbar
// with some room under it.
//
// Buttons prevent `pointerdown`/`mousedown`, so a tap never takes the focus
// away from the editor (which would close the keyboard and the toolbar).

import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  AtIcon,
  CheckIcon,
  CodeSimpleIcon,
  KeyboardOffIcon,
  Link02Icon,
  MessageAdd01Icon,
  TextBoldIcon,
  TextColorIcon,
  TextIndentLessIcon,
  TextIndentMoreIcon,
  TextItalicIcon,
  TextStrikethroughIcon,
} from "@hugeicons/core-free-icons";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { AppIcon } from "@/components/icon";
import { Input } from "@/components/ui/input";
import { Sheet, SheetTitle } from "@/components/ui/sheet";
import { MobileSheetContent, MobileSheetScrollArea } from "@/components/ui/mobile-sheet";
import { cn } from "@/lib/utils";
import { MarkdownLinkEditDialog } from "@/components/markdown-link-menu";
import { MentionFigure, filterMentions, type MentionOption } from "@/components/mention-suggest";
import { mentionAttrsFromOption } from "@/lib/mention-attributes";
import { isMentionLinkType } from "@/lib/mention-link";
import { primeMentionLabel } from "@/lib/mention-resolution";
import {
  PAGE_COLORS,
  activePageColor,
  insertBlock,
  setPageColor,
  type PageColor,
  type PageColorKind,
} from "@/components/pages/blocks";
import { PageColorName } from "@/components/pages/page-comment-bubble";
import { filterSlashItems, type PageSlashItem } from "@/components/pages/page-slash-command";

/** The island's height, and the gap it keeps around itself. */
const TOOLBAR_HEIGHT = 44;
const TOOLBAR_GAP = 8;
/** What the sheets above the keyboard reserve for it (app/globals.css). */
const TOOLBAR_RESERVE = TOOLBAR_HEIGHT + TOOLBAR_GAP * 2;
/** A visual viewport this much shorter than the window has a keyboard under it. */
const KEYBOARD_MIN_HEIGHT = 120;
/** The room kept between the caret's line and the toolbar. */
const CARET_ROOM = 48;

function scrollParent(node: HTMLElement | null): HTMLElement | null {
  for (let element = node?.parentElement ?? null; element; element = element.parentElement) {
    const { overflowY } = getComputedStyle(element);
    if ((overflowY === "auto" || overflowY === "scroll") && element.scrollHeight > element.clientHeight) {
      return element;
    }
  }
  return null;
}

/** Scroll the caret's line above the toolbar, with room to read what is typed. */
export function revealCaret(editor: Editor) {
  if (editor.isDestroyed || !editor.isFocused) return;
  const { view } = editor;
  let caret: { top: number; bottom: number };
  try {
    caret = view.coordsAtPos(view.state.selection.head);
  } catch {
    return;
  }
  const viewport = window.visualViewport;
  const top = viewport ? viewport.offsetTop : 0;
  const bottom = (viewport ? viewport.offsetTop + viewport.height : window.innerHeight) - TOOLBAR_RESERVE - CARET_ROOM;
  const delta = caret.bottom > bottom ? caret.bottom - bottom : caret.top < top + 8 ? caret.top - top - 8 : 0;
  if (!delta) return;
  const parent = scrollParent(view.dom as HTMLElement);
  if (parent) parent.scrollBy({ top: delta });
  else window.scrollBy({ top: delta });
}

/** A row of the two sheets: the blocks' list sets the size for both. */
function SheetRow({ onPick, children }: { onPick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex min-h-12 w-full min-w-0 items-center gap-3 rounded-lg px-3 text-left text-sm active:bg-control"
    >
      {children}
    </button>
  );
}

function ToolbarButton({ label, active = false, disabled = false, onPress, children }: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onPointerDown={(event) => event.preventDefault()}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPress}
      className="group/tool flex size-11 shrink-0 touch-manipulation items-center justify-center text-foreground/80 disabled:opacity-40"
    >
      {/* The highlight sits inside the touch target, with room around it. */}
      <span
        className={cn(
          "flex size-9 items-center justify-center rounded-lg group-active/tool:bg-control",
          active && "bg-control text-foreground",
        )}
      >
        {children}
      </span>
    </button>
  );
}

export function MobileEditorToolbar({
  editor,
  slashItems,
  mentionItems,
  onMentionQuery,
  onComment,
}: {
  editor: Editor;
  /** The “/” catalog of this editor, read when the sheet opens. */
  slashItems: () => PageSlashItem[];
  /** The mentions this surface offers; absent where it has none. */
  mentionItems?: () => MentionOption[];
  onMentionQuery?: () => void;
  /** Comment on the block under the caret (pages). */
  onComment?: () => void;
}) {
  const t = useTranslations("Pages");
  const tPicker = useTranslations("Picker");
  const colorName = useTranslations("Categories.colors");
  const [focused, setFocused] = useState(() => editor.isFocused);
  const [sheet, setSheet] = useState<"blocks" | "mentions" | "color" | null>(null);
  const [query, setQuery] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  // Where the caret was when a sheet opened: the sheet takes the focus.
  const insertAt = useRef(0);
  // A finger on the strip. A tap moves the focus off the editor before its
  // click arrives, whatever `pointerdown` prevents: the strip must stay for
  // that click instead of hiding with the editor's blur.
  const pressing = useRef(false);

  useEffect(() => {
    let frame = 0;
    const reveal = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => revealCaret(editor));
    };
    // A short grace on blur: a tap on the toolbar or a sheet opening moves
    // the focus for an instant, and the strip must not flicker.
    let blurTimer: ReturnType<typeof setTimeout> | undefined;
    const onFocus = () => {
      clearTimeout(blurTimer);
      setFocused(true);
      reveal();
    };
    const onBlur = () => {
      blurTimer = setTimeout(() => {
        if (!pressing.current) setFocused(editor.isFocused);
      }, 120);
    };
    editor.on("focus", onFocus);
    editor.on("blur", onBlur);
    editor.on("selectionUpdate", reveal);
    window.visualViewport?.addEventListener("resize", reveal);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(blurTimer);
      editor.off("focus", onFocus);
      editor.off("blur", onBlur);
      editor.off("selectionUpdate", reveal);
      window.visualViewport?.removeEventListener("resize", reveal);
    };
  }, [editor]);

  // The sheets above the keyboard make room for the strip while it shows.
  const visible = focused && sheet === null && !linkOpen;
  useEffect(() => {
    if (!visible) return;
    const root = document.documentElement;
    root.style.setProperty("--mobile-editor-toolbar", `${TOOLBAR_RESERVE}px`);
    // The bottom navigation steps aside: both sit right above the keyboard.
    root.dataset.mobileToolbarOpen = "";
    return () => {
      root.style.removeProperty("--mobile-editor-toolbar");
      delete root.dataset.mobileToolbarOpen;
    };
  }, [visible]);

  // Where the strip sits: the bottom edge of the VISUAL viewport, the part of
  // the page the keyboard leaves. A `bottom` anchored to the layout viewport
  // drifted while the page scrolled under an open keyboard; following the
  // visual viewport frame by frame keeps the strip glued above the keys.
  const [top, setTop] = useState<number | null>(null);
  useEffect(() => {
    if (!visible) return;
    const viewport = window.visualViewport;
    if (!viewport) return;
    let frame = 0;
    // The keyboard as the viewport shows it. Closing it from the OS's own key
    // only shrinks nothing back: the editor keeps the focus, and the strip
    // would stay over the page. Seen open, then closed: the editing is over.
    let keyboardSeen = false;
    const place = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const keyboard = window.innerHeight - viewport.height - viewport.offsetTop > KEYBOARD_MIN_HEIGHT;
        if (keyboard) keyboardSeen = true;
        else if (keyboardSeen && !pressing.current) {
          keyboardSeen = false;
          if (!editor.isDestroyed) editor.commands.blur();
          return;
        }
        setTop(Math.round(viewport.offsetTop + viewport.height - TOOLBAR_HEIGHT - TOOLBAR_GAP));
      });
    };
    place();
    viewport.addEventListener("resize", place);
    viewport.addEventListener("scroll", place);
    window.addEventListener("scroll", place, true);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", place);
      viewport.removeEventListener("scroll", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [visible, editor]);

  const active = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive("bold"),
      italic: current.isActive("italic"),
      strike: current.isActive("strike"),
      code: current.isActive("code"),
      link: current.isActive("link"),
      canIndent: current.can().sinkListItem("listItem") || current.can().sinkListItem("taskItem"),
      canOutdent: current.can().liftListItem("listItem") || current.can().liftListItem("taskItem"),
      text: activePageColor(current, "text"),
      background: activePageColor(current, "background"),
    }),
  });

  const open = (next: "blocks" | "mentions" | "color") => {
    insertAt.current = editor.state.selection.from;
    setQuery("");
    if (next === "mentions") onMentionQuery?.();
    setSheet(next);
  };
  const close = () => setSheet(null);
  const at = () => Math.min(insertAt.current, editor.state.doc.content.size);

  const blocks = useMemo(
    () => (sheet === "blocks" ? filterSlashItems(slashItems(), query) : []),
    [sheet, slashItems, query],
  );
  const mentions = useMemo(
    () => (sheet === "mentions" && mentionItems ? filterMentions(mentionItems(), query) : []),
    [sheet, mentionItems, query],
  );

  const pickBlock = (item: PageSlashItem) => {
    close();
    const range = { from: at(), to: at() };
    editor.commands.focus(range.from);
    if (item.block) insertBlock(item.block, editor, range);
    else item.run(editor, range);
  };
  const pickMention = (option: MentionOption) => {
    close();
    if (isMentionLinkType(option.type)) {
      primeMentionLabel(option.type, option.id, option.label, option.objectiveStatus);
    }
    editor
      .chain()
      .focus(at())
      .insertContentAt(at(), [
        { type: "mention", attrs: mentionAttrsFromOption(option) },
        { type: "text", text: " " },
      ])
      .run();
  };
  // The selection stays in the editor's state while the sheet has the focus:
  // the color applies to it once the editor takes the focus back.
  const pickColor = (kind: PageColorKind, color: PageColor | null) => {
    close();
    setPageColor(editor, kind, color);
  };
  const indent = () =>
    editor.chain().focus().sinkListItem("taskItem").run() ||
    editor.chain().focus().sinkListItem("listItem").run();
  const outdent = () =>
    editor.chain().focus().liftListItem("taskItem").run() ||
    editor.chain().focus().liftListItem("listItem").run();

  const strip = visible && typeof document !== "undefined"
    ? createPortal(
        <div
          role="toolbar"
          aria-label={t("mobileToolbar")}
          data-mobile-editor-toolbar
          // Listed by lib/overlay-dismiss: a tap here is not "outside" for the
          // sheet or dialog around the editor (the notebook closed on it).
          onPointerDownCapture={() => {
            pressing.current = true;
          }}
          onPointerUpCapture={() => {
            // Past the click that follows, or the drag that scrolled the strip.
            setTimeout(() => {
              pressing.current = false;
              if (!editor.isDestroyed && !editor.isFocused && sheet === null && !linkOpen) {
                setFocused(false);
              }
            }, 400);
          }}
          // An island above the keyboard, its own surface with margins: the
          // tools scroll inside it, and hiding the keyboard stays pinned on the
          // right. `pointer-events-auto`: on the body, under a modal sheet (the
          // notebook) that sets `pointer-events: none` on everything else.
          className="pointer-events-auto fixed inset-x-2 z-[80] flex items-center overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-lg"
          style={{
            height: TOOLBAR_HEIGHT,
            ...(top === null
              ? { bottom: `calc(var(--mobile-keyboard-inset, 0px) + ${TOOLBAR_GAP}px)` }
              : { top }),
          }}
        >
          <div className="no-scrollbar flex h-full min-w-0 flex-1 items-center gap-0.5 overflow-x-auto overflow-y-hidden overscroll-none px-1"
            style={{ touchAction: "pan-x" }}>
            <ToolbarButton label={t("mobileInsertBlock")} onPress={() => open("blocks")}>
              <HugeiconsIcon icon={Add01Icon} className="size-5" />
            </ToolbarButton>
            {mentionItems && (
              <ToolbarButton label={t("mobileMention")} onPress={() => open("mentions")}>
                <HugeiconsIcon icon={AtIcon} className="size-5" />
              </ToolbarButton>
            )}
            <span aria-hidden className="mx-0.5 h-6 w-px shrink-0 bg-border" />
            <ToolbarButton label={t("selectionBold")} active={active?.bold}
              onPress={() => editor.chain().focus().toggleBold().run()}>
              <HugeiconsIcon icon={TextBoldIcon} className="size-5" />
            </ToolbarButton>
            <ToolbarButton label={t("selectionItalic")} active={active?.italic}
              onPress={() => editor.chain().focus().toggleItalic().run()}>
              <HugeiconsIcon icon={TextItalicIcon} className="size-5" />
            </ToolbarButton>
            <ToolbarButton label={t("selectionStrike")} active={active?.strike}
              onPress={() => editor.chain().focus().toggleStrike().run()}>
              <HugeiconsIcon icon={TextStrikethroughIcon} className="size-5" />
            </ToolbarButton>
            <ToolbarButton label={t("selectionCode")} active={active?.code}
              onPress={() => editor.chain().focus().toggleCode().run()}>
              <AppIcon icon={CodeSimpleIcon} className="size-5" />
            </ToolbarButton>
            <ToolbarButton label={t("color")} active={!!(active?.text || active?.background)}
              onPress={() => open("color")}>
              <HugeiconsIcon icon={TextColorIcon} className="size-5" />
            </ToolbarButton>
            <ToolbarButton label={active?.link ? t("selectionEditLink") : t("selectionAddLink")}
              active={active?.link} onPress={() => setLinkOpen(true)}>
              <HugeiconsIcon icon={Link02Icon} className="size-5" />
            </ToolbarButton>
            <ToolbarButton label={t("mobileOutdent")} disabled={!active?.canOutdent} onPress={outdent}>
              <HugeiconsIcon icon={TextIndentLessIcon} className="size-5" />
            </ToolbarButton>
            <ToolbarButton label={t("mobileIndent")} disabled={!active?.canIndent} onPress={indent}>
              <HugeiconsIcon icon={TextIndentMoreIcon} className="size-5" />
            </ToolbarButton>
            {onComment && (
              <ToolbarButton label={t("commentSelection")} onPress={onComment}>
                <HugeiconsIcon icon={MessageAdd01Icon} className="size-5" />
              </ToolbarButton>
            )}
          </div>
          <span aria-hidden className="h-6 w-px shrink-0 bg-border" />
          <ToolbarButton label={t("mobileHideKeyboard")} onPress={() => editor.commands.blur()}>
            <HugeiconsIcon icon={KeyboardOffIcon} className="size-5" />
          </ToolbarButton>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      {strip}
      <Sheet open={sheet !== null} onOpenChange={(next) => { if (!next) close(); }}>
        <MobileSheetContent side="bottom" aria-describedby={undefined}
          className="mobile-picker-sheet gap-2 p-2 pt-12"
          // The search field would raise the keyboard over the list: the
          // list is reachable at once, the field on a tap.
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            // The selection is the editor's: right after a pick, or where it
            // was when the sheet was dismissed.
            if (!editor.isDestroyed) editor.commands.focus();
          }}>
          <SheetTitle className="mobile-picker-title truncate">
            {sheet === "mentions" ? t("mobileMention") : sheet === "color" ? t("color") : t("mobileInsertBlock")}
          </SheetTitle>
          {sheet !== "color" && <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tPicker("search")}
            aria-label={tPicker("search")}
            className="h-11"
          />}
          <MobileSheetScrollArea className="max-h-[min(50dvh,calc(var(--mobile-viewport-height,100dvh)-9rem))]">
            {sheet === "blocks" && blocks.map((item) => (
              <SheetRow key={item.key} onPick={() => pickBlock(item)}>
                <AppIcon icon={item.icon} className="size-5 shrink-0 text-muted-foreground" />
                <span className="truncate">{item.label}</span>
              </SheetRow>
            ))}
            {sheet === "color" && (["text", "background"] as const).map((kind) => (
              <div key={kind} className="pb-1">
                <div className="px-3 pb-1 pt-2 text-xs text-muted-foreground">
                  {kind === "text" ? t("colorText") : t("colorBackground")}
                </div>
                {[null, ...PAGE_COLORS].map((color) => (
                  <SheetRow key={`${kind}:${color ?? "none"}`} onPick={() => pickColor(kind, color)}>
                    <span className="min-w-0 flex-1">
                      <PageColorName kind={kind} color={color} label={color ? colorName(color) : t("colorNone")} />
                    </span>
                    {active?.[kind] === color && <HugeiconsIcon icon={CheckIcon} className="size-4 shrink-0" />}
                  </SheetRow>
                ))}
              </div>
            ))}
            {sheet === "mentions" && mentions.map((option) => (
              <SheetRow key={`${option.type}:${option.id}`} onPick={() => pickMention(option)}>
                <MentionFigure option={option} />
                <span className="min-w-0 truncate">
                  {option.label}
                  {option.detail && <span className="ml-1.5 text-muted-foreground">{option.detail}</span>}
                </span>
              </SheetRow>
            ))}
            {((sheet === "blocks" && blocks.length === 0) || (sheet === "mentions" && mentions.length === 0)) && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">{tPicker("noResults")}</p>
            )}
          </MobileSheetScrollArea>
        </MobileSheetContent>
      </Sheet>
      <MarkdownLinkEditDialog editor={editor} open={linkOpen} onOpenChange={setLinkOpen} />
    </>
  );
}
