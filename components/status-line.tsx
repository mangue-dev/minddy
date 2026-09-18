"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSonner, type ToastT } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { Bell } from "lucide-react";
import { cn, Popover, PopoverContent, PopoverTrigger } from "mangue-ui";
import { useLocale, useTranslations } from "next-intl";
import { transitions } from "@/lib/motion";
import {
  clearErrorHistory,
  formatStatusAge,
  readErrorHistory,
  recordError,
  type StatusError,
} from "@/lib/status-history";

/**
 * The replacement for the floating toasts (MIN-555): a single status line that
 * lives in the bottom chrome, just before the Numo button on desktop and just
 * above the mobile nav — one line at a time, a colored dot carrying the code
 * color (blue = info/success, orange = warning, red = error), the message
 * truncated to fit, and a click opening the full text.
 *
 * HOW: the ~480 `toast.*` call sites still go through sonner (re-exported by
 * `mangue-ui`), but no sonner `<Toaster>` is mounted in the app shell anymore.
 * This component subscribes to the same store (`useSonner`) and renders the
 * latest publication as the line. Sonner only dismisses toasts through the
 * timers of its own `<Toast>` elements — which no longer exist here — so the
 * line owns its lifetime instead: 4s for info/success (sonner's old default),
 * 7s for errors and warnings.
 *
 * Errors are additionally recorded in `lib/status-history.ts` (localStorage,
 * capped) and surfaced by the bell button: it only appears once an error has
 * fired, lists the last ones and clears on demand — the toast used to appear,
 * vanish and be gone forever.
 *
 * Rendered TWICE on purpose: the desktop pill sits inside the assistant FAB
 * band (`StatusLine`, mounted by `components/assistant-fab.tsx`) and the mobile
 * pill floats above the bottom nav (`StatusLineFloating`, mounted by
 * `app/(app)/app-providers.tsx`). Each variant is hidden on the other
 * breakpoint, and the localStorage upsert makes the double recording of an
 * error harmless.
 *
 * Public surfaces without a bottom bar (auth pages, the `/f/` feedback board)
 * keep the classic sonner toaster — see `components/lazy-toaster.tsx`.
 */

type StatusKind = "info" | "success" | "warning" | "error";

/** How long the line stays before letting go. */
const SHOW_MS: Record<StatusKind, number> = {
  info: 4000,
  success: 4000,
  warning: 7000,
  error: 7000,
};

/** Sonner's `default` (bare `toast(...)`) shares the blue of `info` today. */
function kindOf(type: ToastT["type"]): StatusKind {
  if (type === "error") return "error";
  if (type === "warning") return "warning";
  if (type === "success") return "success";
  return "info";
}

const DOT_CLASS: Record<StatusKind, string> = {
  info: "bg-[var(--toast-info)]",
  success: "bg-[var(--toast-success)]",
  warning: "bg-[var(--toast-warning)]",
  error: "bg-[var(--toast-error)]",
};

interface StatusToast {
  id: string;
  kind: StatusKind;
  title: ReactNode;
  at: number;
}

/**
 * The whole status-line state, shared by both breakpoint variants: the toast
 * currently shown, whether it is still within its display window, and the
 * recorded error history behind the bell.
 *
 * Sonner publishes one event per commit, so exactly one entry differs in the
 * `toasts` array between two renders. The diff — not "the first entry" — is
 * what matters: a same-id update (`toast.info(…, { id })`, the dictation
 * in-flight marker) replaces its entry in place, anywhere in the array.
 */
function useStatusLine(hold: boolean) {
  const { toasts } = useSonner();
  const [current, setCurrent] = useState<StatusToast | null>(null);
  const [visible, setVisible] = useState(false);
  const [history, setHistory] = useState<StatusError[]>([]);
  const seenRef = useRef<Map<string, ToastT>>(new Map());

  // The bell reads its history after mount only: the server renders an empty
  // list, and reading localStorage during hydration would mismatch.
  useEffect(() => {
    setHistory(readErrorHistory());
  }, []);

  useEffect(() => {
    // Scan oldest-first so the last assignment wins with the newest entry.
    let changed: ToastT | null = null;
    for (let i = toasts.length - 1; i >= 0; i--) {
      const t = toasts[i];
      if (seenRef.current.get(String(t.id)) !== t) changed = t;
    }
    seenRef.current = new Map(toasts.map((t) => [String(t.id), t]));
    if (!changed) return;
    // Sonner titles can be render functions — resolve them like its Toaster does.
    const rawTitle = changed.title;
    const title: ReactNode =
      typeof rawTitle === "function" ? (rawTitle as () => ReactNode)() : (rawTitle ?? "");
    const entry: StatusToast = {
      id: String(changed.id),
      kind: kindOf(changed.type),
      title,
      at: Date.now(),
    };
    setCurrent(entry);
    setVisible(true);
    if (entry.kind === "error" && typeof entry.title === "string") {
      setHistory(recordError({ id: entry.id, message: entry.title, at: entry.at }));
    }
  }, [toasts]);

  // The line owns its lifetime; holding the details popover pauses the count.
  useEffect(() => {
    if (!current || !visible || hold) return;
    const timer = window.setTimeout(() => setVisible(false), SHOW_MS[current.kind]);
    return () => window.clearTimeout(timer);
  }, [current, visible, hold]);

  const clear = () => {
    clearErrorHistory();
    setHistory([]);
  };

  return { current, visible, history, clear };
}

/** The colored dot + truncated message, opening the full text on click. */
function StatusPill({
  entry,
  align,
  onOpenChange,
}: {
  entry: StatusToast;
  align: "center" | "end";
  onOpenChange?: (open: boolean) => void;
}) {
  const locale = useLocale();
  return (
    <Popover onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-7 min-w-0 max-w-full cursor-pointer items-center gap-2 rounded-full px-2.5",
            "text-sidebar-foreground/70 hover:text-sidebar-foreground",
            "hover:bg-sidebar-accent/70",
            "outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <span
            aria-hidden
            className={cn("size-1.5 shrink-0 rounded-full", DOT_CLASS[entry.kind])}
          />
          <span className="min-w-0 truncate text-[13px] leading-5">{entry.title}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align={align}
        sideOffset={8}
        className="w-80 gap-1.5"
      >
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span
            aria-hidden
            className={cn("size-1.5 rounded-full", DOT_CLASS[entry.kind])}
          />
          <span>{formatStatusAge(entry.at, locale)}</span>
        </div>
        <p className="whitespace-pre-wrap break-words text-[13px] leading-snug">
          {entry.title}
        </p>
      </PopoverContent>
    </Popover>
  );
}

/** The error-history bell: absent until an error fired, clearable forever. */
function StatusBell({
  history,
  onClear,
  align,
}: {
  history: StatusError[];
  onClear: () => void;
  align: "center" | "end";
}) {
  const t = useTranslations("StatusLine");
  const locale = useLocale();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  if (history.length === 0) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("bellLabel")}
          className={cn(
            "inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full",
            "text-sidebar-foreground/70 hover:text-sidebar-foreground",
            "hover:bg-sidebar-accent/70",
            "outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <Bell className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align={align} sideOffset={8} className="w-80 gap-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">{t("historyTitle")}</span>
          <button
            type="button"
            onClick={onClear}
            className="cursor-pointer rounded px-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {t("clear")}
          </button>
        </div>
        <ul className="flex flex-col">
          {history.map((error) => {
            const key = `${error.id}:${error.at}`;
            const expanded = expandedId === key;
            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : key)}
                  className={cn(
                    "flex w-full cursor-pointer items-start gap-2 rounded-md px-1.5 py-1.5 text-left",
                    "hover:bg-sidebar-accent/70",
                    "outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", DOT_CLASS.error)}
                  />
                  <span
                    className={cn(
                      "min-w-0 flex-1 text-xs leading-normal",
                      expanded ? "whitespace-pre-wrap break-words" : "truncate",
                    )}
                  >
                    {error.message}
                  </span>
                  <span className="shrink-0 pt-px text-[10px] text-muted-foreground">
                    {formatStatusAge(error.at, locale)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/** Enter/exit shared by both variants — the pill slides up from the bar. */
function StatusLinePresence({
  entry,
  align,
  onOpenChange,
}: {
  entry: StatusToast;
  align: "center" | "end";
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <motion.div
      key="status-line"
      initial={{ opacity: 0, y: 10, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.94 }}
      transition={transitions.snappy}
      className="min-w-0 max-w-full"
      role="status"
      aria-live="polite"
    >
      <StatusPill entry={entry} align={align} onOpenChange={onOpenChange} />
    </motion.div>
  );
}

/**
 * Desktop variant: the status pill inside the bottom chrome band, before the
 * Numo button. Mounted by `components/assistant-fab.tsx` (which hides the band
 * below the mobile cutover).
 */
export function StatusLine() {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const { current, visible, history, clear } = useStatusLine(detailsOpen);
  return (
    <div className="flex min-w-0 items-center gap-1">
      <AnimatePresence>
        {current && visible && (
          <div className="min-w-0 max-w-[300px]">
            <StatusLinePresence
              entry={current}
              align="end"
              onOpenChange={setDetailsOpen}
            />
          </div>
        )}
      </AnimatePresence>
      <StatusBell history={history} onClear={clear} align="end" />
    </div>
  );
}

/**
 * Mobile variant: the nav pill has no room for a text line, so the status
 * floats as its own pill just above the bottom nav instead — the same one-line
 * contract. Mounted by `app/(app)/app-providers.tsx`.
 */
export function StatusLineFloating() {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const { current, visible, history, clear } = useStatusLine(detailsOpen);
  return (
    <div
      className={cn(
        "desktop:hidden fixed left-1/2 z-40 flex -translate-x-1/2 items-center gap-1.5",
      )}
      style={{ bottom: "calc(var(--mobile-nav-height) + 0.5rem)" }}
    >
      <AnimatePresence>
        {current && visible && (
          <div className="min-w-0 max-w-[min(85vw,26rem)]">
            <StatusLinePresence
              entry={current}
              align="center"
              onOpenChange={setDetailsOpen}
            />
          </div>
        )}
      </AnimatePresence>
      <StatusBell history={history} onClear={clear} align="center" />
    </div>
  );
}
