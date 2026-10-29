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
// The bar sits at the top right of the pane its document scrolls in — under
// the content header on a page, at the top of the side panel or the notebook
// — and stays there while the document scrolls; on a phone it spans the pane.
// Replace is only offered when the document is editable.

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import { useTranslations } from "next-intl";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Cancel01Icon,
  ReplaceIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { useMobileLayout } from "@/lib/use-mobile-layout";
import { scrollPane } from "@/lib/scroll-pane";
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

/** An option of the search (match case, whole word, expression, replace):
    a ghost button that stays pressed while the option is on. */
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
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      tooltip={label}
      aria-pressed={pressed}
      onClick={onToggle}
      className={cn(BAR_BUTTON, "text-xs font-semibold aria-pressed:text-primary aria-pressed:hover:text-primary")}
    >
      {children}
    </Button>
  );
}

/**
 * The bar's buttons: radius concentric with the bar's (12px surface, 8px
 * padding, so 4px inside it), like the selection card's rows.
 */
const BAR_BUTTON = "rounded-sm app-mobile:size-10";

/** A thin vertical divider between the bar's groups. */
const Divider = () => <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-border" />;

/** The bar's inset from its pane's edges. */
const PANE_INSET = 8;

/**
 * The box `position: fixed` is measured from for a child of `element`: the
 * viewport, or the nearest ancestor-or-self with a transform, filter or
 * containment (a sliding dialog), whose own rectangle then counts.
 */
function fixedFrame(element: HTMLElement): { top: number; left: number; right: number } {
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (
      (style.transform && style.transform !== "none") ||
      (style.translate && style.translate !== "none") ||
      (style.scale && style.scale !== "none") ||
      (style.filter && style.filter !== "none") ||
      /paint|layout|strict|content/.test(style.contain ?? "")
    ) {
      const rect = node.getBoundingClientRect();
      return { top: rect.top, left: rect.left, right: rect.right };
    }
  }
  return { top: 0, left: 0, right: window.innerWidth };
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
  // Inside the dialog that holds the document (the notebook), else the body:
  // a dialog keeps the focus within itself, so the field must live there.
  const [host, setHost] = useState<HTMLElement | null>(null);
  const mobile = useMobileLayout() === true;
  // Fixed at the top right of the document's pane, measured while open.
  const [place, setPlace] = useState<CSSProperties | null>(null);
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
    // `host`: the bar is portaled once its host is known, a render later.
    if (!open || focusRequest === 0 || !host) return;
    if (!editor.isDestroyed && editor.view.hasFocus()) (editor.view.dom as HTMLElement).blur();
    fieldRef.current?.focus();
    fieldRef.current?.select();
  }, [editor, open, focusRequest, host]);

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

  useLayoutEffect(() => {
    if (!open || editor.isDestroyed) return;
    const container = editor.view.dom.closest<HTMLElement>("[role=dialog]") ?? document.body;
    setHost(container);
    const measure = () => {
      if (editor.isDestroyed) return;
      const pane = scrollPane(editor.view.dom);
      const frame = fixedFrame(container);
      const box = pane === document.body
        ? { top: 0, left: 0, right: window.innerWidth }
        : pane.getBoundingClientRect();
      // Clear of the pane's scrollbar on the right.
      const scrollbar = pane === document.body ? 0 : pane.offsetWidth - pane.clientWidth;
      setPlace({
        top: box.top - frame.top + PANE_INSET,
        right: frame.right - box.right + scrollbar + PANE_INSET,
        ...(mobile ? { left: box.left - frame.left + PANE_INSET } : {}),
      });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [editor, open, mobile]);

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

  const bar = (
    <div
      ref={barRef}
      role="search"
      aria-label={t("findBar")}
      data-floating-surface
      style={place ?? undefined}
      className={cn(
        // The surface of the app's menus, over the document and above the
        // dialog that may hold it (the notebook), whose body ignores the pointer.
        "pointer-events-auto fixed z-[70] flex flex-col gap-1 rounded-xl bg-popover p-2 text-popover-foreground shadow-md ring-1 ring-foreground/10",
        mobile ? "" : "w-[26rem]",
        !place && "invisible"
      )}
    >
      <div className="flex items-center gap-0.5">
        <HugeiconsIcon icon={Search01Icon} className="ml-2 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
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
          className={cn(
            "h-8 min-w-0 flex-1 bg-transparent px-1.5 text-sm outline-none placeholder:text-muted-foreground app-mobile:h-10",
            invalid && "text-destructive"
          )}
        />
        <span aria-live="polite" className="shrink-0 px-1 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
          {statusText}
        </span>
        <Divider />
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
        {canReplace && (
          <OptionToggle
            label={replaceOpen ? t("findHideReplace") : t("findShowReplace")}
            pressed={replaceOpen}
            onToggle={() => setReplaceOpen((value) => !value)}
          >
            <HugeiconsIcon icon={ReplaceIcon} className="size-4" />
          </OptionToggle>
        )}
        <Divider />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("findPrevious")}
          shortcut={["⇧", "↵"]}
          disabled={!hasMatches}
          onClick={() => step(-1)}
          className={BAR_BUTTON}
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
          className={BAR_BUTTON}
        >
          <HugeiconsIcon icon={ArrowDown01Icon} className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={tCommon("close")}
          shortcut={["Esc"]}
          onClick={close}
          className={BAR_BUTTON}
        >
          <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
        </Button>
      </div>
      {invalid && (
        <p id={errorId} className="px-8 pb-1 text-xs text-destructive">
          {t("findInvalidRegex")}
        </p>
      )}
      {showReplace && (
        <div className="flex items-center gap-0.5 border-t border-border pt-1">
          <HugeiconsIcon icon={ReplaceIcon} className="ml-2 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            aria-label={t("findReplacePlaceholder")}
            placeholder={t("findReplacePlaceholder")}
            value={options.replace}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => update({ replace: event.target.value })}
            onKeyDown={onReplaceKey}
            className="h-8 min-w-0 flex-1 bg-transparent px-1.5 text-sm outline-none placeholder:text-muted-foreground app-mobile:h-10"
          />
          <Button
            variant="ghost"
            size="sm"
            aria-label={t("findReplace")}
            shortcut={["↵"]}
            tooltip={t("findReplace")}
            disabled={!hasMatches}
            onClick={replaceOne}
            className="rounded-sm app-mobile:h-10"
          >
            {t("findReplace")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={t("findReplaceAll")}
            shortcut={[modKey, "↵"]}
            tooltip={t("findReplaceAll")}
            disabled={!hasMatches}
            onClick={replaceAll}
            className="rounded-sm app-mobile:h-10"
          >
            {t("findReplaceAll")}
          </Button>
        </div>
      )}
    </div>
  );

  return host ? createPortal(bar, host) : null;
}
