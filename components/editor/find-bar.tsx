"use client";

// The find and replace bar of pages and the task notebook. RichEditor mounts
// it when a surface asks for `find`; the document logic is in
// find-replace.ts.
//
// ⌘F (Ctrl+F) opens it whenever its document owns the screen, wherever the
// caret is: in the editor, in the page title or nowhere. Everywhere else,
// and under a dialog that does not hold the document, the browser keeps its
// own find (lib/keyboard/find-shortcut.ts).
//
// The bar floats at the top right of the document column and follows the
// scroll; on a phone it spans the column under the header. Replace is only
// offered when the document is editable.

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import type { Editor } from "@tiptap/react";
import { useTranslations } from "next-intl";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  ArrowUp01Icon,
  Cancel01Icon,
  ReplaceAllIcon,
  ReplaceIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";
import { isImeComposing } from "@/lib/keyboard/ime";
import { matchesFindShortcut, surfaceOwnsScreen } from "@/lib/keyboard/find-shortcut";
import { resolveKeyToken } from "@/lib/keyboard/shortcuts";
import { useModKey } from "@/lib/keyboard/use-mod-shortcut";
import {
  currentMatchIndex,
  escapeRegExp,
  findMatches,
  findQuery,
  isInvalidPattern,
  matchFrom,
  replaceAllMatches,
  replaceCurrentMatch,
  selectMatch,
  setSearchState,
  stepMatch,
  type FindOptions,
} from "@/components/editor/find-replace";

const ACTIVE_MATCH = ".ProseMirror-active-search-match";

/** The nearest ancestor that scrolls vertically, or null for the window. */
function scrollParent(element: Element): HTMLElement | null {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) return node;
  }
  return null;
}

/**
 * Bring the current match into view, centered, unless it is already visible
 * below the bar. Done by hand rather than with ProseMirror's scrollIntoView,
 * which stops at the edge, where the bar covers it.
 */
function revealActiveMatch(editor: Editor, bar: HTMLElement | null) {
  if (editor.isDestroyed) return;
  const match = editor.view.dom.querySelector(ACTIVE_MATCH);
  if (!match) return;
  const scroller = scrollParent(match);
  const rect = match.getBoundingClientRect();
  const top = scroller ? scroller.getBoundingClientRect().top : 0;
  const bottom = scroller ? scroller.getBoundingClientRect().bottom : window.innerHeight;
  const covered = bar ? bar.getBoundingClientRect().bottom + 8 : top;
  if (rect.top >= Math.max(top, covered) && rect.bottom <= bottom - 16) return;
  const delta = rect.top - (top + (bottom - top) / 2);
  if (scroller) scroller.scrollBy({ top: delta });
  else window.scrollBy({ top: delta });
}

/** A short single-line selection seeds the search, as in a code editor. */
function selectedText(editor: Editor): string {
  const { from, to, empty } = editor.state.selection;
  if (empty) return "";
  const text = editor.state.doc.textBetween(from, to, "\n");
  return text.includes("\n") || text.length > 200 ? "" : text;
}

/** A letter toggle inside the field (match case, whole word, expression). */
function OptionToggle({
  label,
  pressed,
  onToggle,
  children,
}: {
  label: string;
  pressed: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <InputGroupButton
      size="icon-xs"
      aria-label={label}
      tooltip={label}
      aria-pressed={pressed}
      onClick={onToggle}
      className={cn(
        "text-2xs font-semibold text-muted-foreground hover:text-foreground",
        "aria-pressed:bg-primary/15 aria-pressed:text-foreground aria-pressed:ring-1 aria-pressed:ring-primary/60 aria-pressed:ring-inset"
      )}
    >
      {children}
    </InputGroupButton>
  );
}

export function FindBar({ editor, editable }: { editor: Editor; editable: boolean }) {
  const t = useTranslations("Pages");
  const tCommon = useTranslations("Common");
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<FindOptions>({
    search: "",
    replace: "",
    caseSensitive: false,
    wholeWord: false,
    regexp: false,
  });
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [status, setStatus] = useState({ current: -1, total: 0 });
  const [replaced, setReplaced] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  // Above the document while there is room for it there (the notebook's top
  // margin, a page's title row), so it does not cover the first lines; over
  // the text, at the top of the scrolling area, once the document scrolls up.
  const [above, setAbove] = useState(false);
  const fieldRef = useRef<HTMLInputElement>(null);
  // Where the caret was when the bar opened: each letter typed searches
  // again from there, as the browser's find does.
  const anchorRef = useRef(0);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const openRef = useRef(open);
  openRef.current = open;

  const errorId = useId();
  const modKey = useModKey();
  const invalid = isInvalidPattern(options);
  const canReplace = editable;

  // Each ⌘F takes the field and selects its text, once the bar is drawn.
  // The editor is blurred first, on its own: the selection toolbar stays up
  // when focus moves to another element of the page, and would cover the bar.
  const [focusRequest, setFocusRequest] = useState(0);
  useEffect(() => {
    if (!open || focusRequest === 0) return;
    if (!editor.isDestroyed && editor.view.hasFocus()) (editor.view.dom as HTMLElement).blur();
    fieldRef.current?.focus();
    fieldRef.current?.select();
  }, [editor, open, focusRequest]);

  const reveal = useCallback(() => {
    requestAnimationFrame(() => revealActiveMatch(editor, barRef.current));
  }, [editor]);

  // ⌘F: open, or take the field back and select its text.
  useEffect(() => {
    const mac = resolveKeyToken("mod") === "⌘";
    const onKey = (event: KeyboardEvent) => {
      // `defaultPrevented`: another document on screen already answered.
      if (event.defaultPrevented || !matchesFindShortcut(event, mac) || editor.isDestroyed) return;
      if (!surfaceOwnsScreen(editor.view.dom)) return;
      event.preventDefault();
      if (event.repeat && openRef.current) return;
      const seed = barRef.current?.contains(document.activeElement) ? "" : selectedText(editor);
      if (seed) {
        setOptions((current) => ({ ...current, search: current.regexp ? escapeRegExp(seed) : seed }));
      }
      if (!openRef.current) anchorRef.current = editor.state.selection.from;
      setOpen(true);
      setFocusRequest((request) => request + 1);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [editor]);

  const close = useCallback(() => {
    setOpen(false);
    setReplaced(null);
    // The current match is already in view: no scroll on the way back.
    if (!editor.isDestroyed) editor.commands.focus(null, { scrollIntoView: false });
  }, [editor]);

  // Escape belongs to the bar while it has focus. Captured on the window, so
  // the dialog holding the notebook or the side panel does not close too.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !(event.target instanceof Node) || !barRef.current?.contains(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      close();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, close]);

  // The query lives in the plugin, which highlights; a closed bar clears it.
  useEffect(() => {
    if (editor.isDestroyed) return;
    const query = findQuery(open ? options : { ...options, search: "" });
    editor.view.dispatch(setSearchState(editor.state.tr, query).setMeta("addToHistory", false));
  }, [editor, open, options]);

  // A new search jumps to the first match from where the bar opened.
  useEffect(() => {
    if (!open || editor.isDestroyed) return;
    const query = findQuery(optionsRef.current);
    const first = matchFrom(findMatches(editor.state, query), anchorRef.current);
    if (!first) return;
    editor.view.dispatch(selectMatch(editor.state, first));
    reveal();
  }, [editor, open, options.search, options.caseSensitive, options.wholeWord, options.regexp, reveal]);

  // “n of m” follows every change: typing in the document, a collaborator's
  // steps, a replacement, the selection moving.
  useEffect(() => {
    if (!open) return;
    const update = () => {
      if (editor.isDestroyed) return;
      const matches = findMatches(editor.state, findQuery(optionsRef.current));
      const current = currentMatchIndex(editor.state, matches);
      setStatus((previous) =>
        previous.current === current && previous.total === matches.length
          ? previous
          : { current, total: matches.length });
    };
    update();
    editor.on("transaction", update);
    return () => {
      editor.off("transaction", update);
    };
  }, [editor, open, options]);

  const step = (direction: 1 | -1) => {
    if (editor.isDestroyed) return;
    const query = findQuery(options);
    const next = stepMatch(editor.state, findMatches(editor.state, query), direction);
    if (!next) return;
    editor.view.dispatch(selectMatch(editor.state, next));
    reveal();
  };

  const replaceOne = () => {
    if (!canReplace || editor.isDestroyed) return;
    const tr = replaceCurrentMatch(editor.state, findQuery(options));
    if (!tr) return;
    editor.view.dispatch(tr);
    setReplaced(null);
    reveal();
  };

  const replaceAll = () => {
    if (!canReplace || editor.isDestroyed) return;
    const result = replaceAllMatches(editor.state, findQuery(options));
    if (!result) return;
    editor.view.dispatch(result.tr);
    setReplaced(result.count);
  };

  const update = (patch: Partial<FindOptions>) => {
    setReplaced(null);
    setOptions((current) => ({ ...current, ...patch }));
  };

  const onFieldKey = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || isImeComposing(event)) return;
    event.preventDefault();
    step(event.shiftKey ? -1 : 1);
  };

  const onReplaceKey = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || isImeComposing(event)) return;
    event.preventDefault();
    if (event.metaKey || event.ctrlKey) replaceAll();
    else replaceOne();
  };

  useEffect(() => {
    const strip = stripRef.current;
    if (!open || !strip) return;
    const scroller = scrollParent(strip);
    let frame = 0;
    const place = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const top = scroller ? scroller.getBoundingClientRect().top : 0;
        const room = strip.getBoundingClientRect().top - top;
        setAbove(room >= (barRef.current?.offsetHeight ?? 0) + 16);
      });
    };
    place();
    const target = scroller ?? window;
    target.addEventListener("scroll", place, { passive: true });
    window.addEventListener("resize", place);
    return () => {
      cancelAnimationFrame(frame);
      target.removeEventListener("scroll", place);
      window.removeEventListener("resize", place);
    };
  }, [open, replaceOpen, invalid]);

  if (!open) return null;

  const statusText = replaced !== null
    ? t("findReplaced", { count: replaced })
    : invalid || !options.search
      ? ""
      : status.total === 0
        ? t("findNoResults")
        : status.current === -1
          ? t("findCountTotal", { total: status.total })
          : t("findCount", { current: status.current + 1, total: status.total });
  const hasMatches = !invalid && status.total > 0;
  const showReplace = canReplace && replaceOpen;

  return (
    // A zero-height sticky strip: the bar keeps to the top of the scrolling
    // area without taking room in the document's flow.
    <div ref={stripRef} className="pointer-events-none sticky top-2 z-30 h-0 app-mobile:top-0">
      <div
        ref={barRef}
        role="search"
        aria-label={t("findBar")}
        data-floating-surface
        data-floating-surface-layer="local"
        className={cn(
          "pointer-events-auto absolute right-0 flex w-[min(27rem,100%)] flex-col gap-1 p-1",
          above ? "bottom-0.5" : "top-0",
          "rounded-xl bg-popover shadow-md ring-1 ring-foreground/10",
          "app-mobile:left-0 app-mobile:w-full"
        )}
      >
        <div className="flex items-center gap-0.5">
          {canReplace && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={replaceOpen ? t("findHideReplace") : t("findShowReplace")}
              aria-expanded={replaceOpen}
              onClick={() => setReplaceOpen((value) => !value)}
              className="text-muted-foreground hover:text-foreground app-mobile:size-10"
            >
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                className={cn("size-3.5 transition-transform", replaceOpen && "rotate-90")}
              />
            </Button>
          )}
          <InputGroup className="h-11 flex-1 app-desktop:h-8">
            <InputGroupInput
              ref={fieldRef}
              aria-label={t("findPlaceholder")}
              placeholder={t("findPlaceholder")}
              value={options.search}
              aria-invalid={invalid || undefined}
              aria-describedby={invalid ? errorId : undefined}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => update({ search: event.target.value })}
              onKeyDown={onFieldKey}
              className="h-full px-2.5"
            />
            <InputGroupAddon align="inline-end" className="gap-0.5">
              <span aria-live="polite" className="mr-1 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                {statusText}
              </span>
              <OptionToggle
                label={t("findMatchCase")}
                pressed={options.caseSensitive}
                onToggle={() => update({ caseSensitive: !options.caseSensitive })}
              >
                Aa
              </OptionToggle>
              <OptionToggle
                label={t("findWholeWord")}
                pressed={options.wholeWord}
                onToggle={() => update({ wholeWord: !options.wholeWord })}
              >
                <span className="underline decoration-1 underline-offset-2">ab</span>
              </OptionToggle>
              <OptionToggle
                label={t("findRegex")}
                pressed={options.regexp}
                onToggle={() => update({ regexp: !options.regexp })}
              >
                <span className="font-mono">.*</span>
              </OptionToggle>
            </InputGroupAddon>
          </InputGroup>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("findPrevious")}
            shortcut={["⇧", "↵"]}
            disabled={!hasMatches}
            onClick={() => step(-1)}
            className="app-mobile:size-10"
          >
            <HugeiconsIcon icon={ArrowUp01Icon} className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("findNext")}
            shortcut={["↵"]}
            disabled={!hasMatches}
            onClick={() => step(1)}
            className="app-mobile:size-10"
          >
            <HugeiconsIcon icon={ArrowDown01Icon} className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={tCommon("close")}
            shortcut={["Esc"]}
            onClick={close}
            className="text-muted-foreground hover:text-foreground app-mobile:size-10"
          >
            <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
          </Button>
        </div>
        {invalid && (
          <p id={errorId} className={cn("pr-2 pb-1 text-xs text-destructive", canReplace ? "pl-11 app-mobile:pl-13" : "pl-2.5")}>
            {t("findInvalidRegex")}
          </p>
        )}
        {showReplace && (
          <div className="flex items-center gap-0.5 pl-8.5 app-mobile:pl-10.5">
            <InputGroup className="h-11 flex-1 app-desktop:h-8">
              <InputGroupInput
                aria-label={t("findReplacePlaceholder")}
                placeholder={t("findReplacePlaceholder")}
                value={options.replace}
                spellCheck={false}
                autoComplete="off"
                onChange={(event) => update({ replace: event.target.value })}
                onKeyDown={onReplaceKey}
                className="h-full px-2.5"
              />
            </InputGroup>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("findReplace")}
              shortcut={["↵"]}
              disabled={!hasMatches}
              onClick={replaceOne}
              className="app-mobile:size-10"
            >
              <HugeiconsIcon icon={ReplaceIcon} className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("findReplaceAll")}
              shortcut={[modKey, "↵"]}
              disabled={!hasMatches}
              onClick={replaceAll}
              className="app-mobile:size-10"
            >
              <HugeiconsIcon icon={ReplaceAllIcon} className="size-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
