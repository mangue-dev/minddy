"use client";

// Global navigation keyboard chords, à la AutoKap. A leader key **G** (Go) arms
// a chord; the next key picks the destination. While a chord is armed, the
// sidebar surfaces each option's second key as a <Kbd> hint (see AppSidebar) and
// a short "G then…" toast appears (covers the collapsed-sidebar case).
//
//   Global:      G H home · G I inbox · G J agents · G A assistant (Numo) · G N notes
//   In a project: G B all issues · G M my issues · G O objectives
//                 G T triage · G S project settings
//
// The listener runs in the capture phase and, once G is armed, consumes the
// next key outright (preventDefault + stopImmediatePropagation) so it never
// leaks to the per-card field shortcuts (S/P/E/A/L/D/O) — e.g. `G A` opens the
// assistant instead of the assignee picker even while hovering an issue card.
//
// It also owns two singleton shortcuts, co-located here like AutoKap's keyboard
// store: ⌘/Ctrl+B toggles the app sidebar (whose collapse state is lifted here
// so a keystroke can flip it).

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast, Kbd } from "mangue-ui";
import { projectIdFromPath } from "@/lib/project-id-from-path";
import { useAssistantPanel } from "@/lib/assistant-panel-context";
import { useScratchpad } from "@/lib/scratchpad-context";
import { eventKey } from "@/lib/keyboard/event-key";
import { trackEvent } from "@/lib/analytics";

/** Leader key that arms a navigation chord. */
export const CHORD_PREFIX = "g";
const CHORD_TIMEOUT_MS = 1500;

const ChordContext = createContext<string | null>(null);

interface SidebarCollapse {
  collapsed: boolean;
  setCollapsed: Dispatch<SetStateAction<boolean>>;
  toggle: () => void;
}

const SidebarContext = createContext<SidebarCollapse | null>(null);

interface Cheatsheet {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
}

const CheatsheetContext = createContext<Cheatsheet | null>(null);

/**
 * The leader key of the chord currently being typed (`"g"`), or `null` when no
 * chord is armed. Tolerates being called outside a `KeyboardProvider` (returns
 * `null`) so shared components can read it without forcing the provider.
 */
export function useChordPrefix(): string | null {
  return useContext(ChordContext);
}

/** App-sidebar collapse state, shared so ⌘/Ctrl+B can toggle it globally. */
export function useSidebarCollapse(): SidebarCollapse {
  const ctx = useContext(SidebarContext);
  if (!ctx) {
    throw new Error("useSidebarCollapse must be used within a KeyboardProvider");
  }
  return ctx;
}

/** Open state of the keyboard-shortcuts cheat sheet (opened by `?` or palette). */
export function useCheatsheet(): Cheatsheet {
  const ctx = useContext(CheatsheetContext);
  if (!ctx) {
    throw new Error("useCheatsheet must be used within a KeyboardProvider");
  }
  return ctx;
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return target.getAttribute("role") === "textbox";
}

function isDialogOpen(): boolean {
  if (typeof document === "undefined") return false;
  return !!document.querySelector('[role="dialog"][data-state="open"]');
}

export function KeyboardProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { toggle: toggleAssistant } = useAssistantPanel();
  const { open: openScratchpad } = useScratchpad();
  const tk = useTranslations("Keyboard");
  const [chordPrefix, setChordPrefix] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [cheatsheetOpen, setCheatsheetOpen] = useState(false);
  const sidebarValue = useMemo<SidebarCollapse>(
    () => ({
      collapsed: sidebarCollapsed,
      setCollapsed: setSidebarCollapsed,
      toggle: () => setSidebarCollapsed((c) => !c),
    }),
    [sidebarCollapsed],
  );
  const cheatsheetValue = useMemo<Cheatsheet>(
    () => ({ open: cheatsheetOpen, setOpen: setCheatsheetOpen }),
    [cheatsheetOpen],
  );

  // The keydown listener is registered once; read the moving parts via refs so
  // it always sees the current route/handlers without re-subscribing.
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const routerRef = useRef(router);
  routerRef.current = router;
  const toggleAssistantRef = useRef(toggleAssistant);
  toggleAssistantRef.current = toggleAssistant;
  const openScratchpadRef = useRef(openScratchpad);
  openScratchpadRef.current = openScratchpad;
  const thenRef = useRef(tk("then"));
  thenRef.current = tk("then");
  // Mirrors chordPrefix synchronously for the listener (state is async).
  const armedRef = useRef(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let prefixToastId: string | number | null = null;

    const disarm = () => {
      armedRef.current = false;
      setChordPrefix(null);
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      if (prefixToastId !== null) {
        toast.dismiss(prefixToastId);
        prefixToastId = null;
      }
    };

    /** Route the second key of the chord. Returns true when it was a real target. */
    const runChord = (key: string): boolean => {
      const projectId = projectIdFromPath(pathnameRef.current);
      const go = (path: string) => routerRef.current.push(path);
      switch (key) {
        case "h":
          go("/home");
          return true;
        case "i":
          go("/inbox");
          return true;
        case "j":
          go("/agents");
          return true;
        case "a":
          toggleAssistantRef.current();
          return true;
        case "n":
          openScratchpadRef.current();
          return true;
        default:
          break;
      }
      // B reaches the tickets board (cross-project on Home, the project's
      // inside one); M is the same board with the "Mes tickets" system view
      // pre-selected (the ?view= one-shot instruction).
      if (!projectId) {
        switch (key) {
          case "m":
            go("/all?view=my");
            return true;
          case "b":
            go("/all");
            return true;
          default:
            return false;
        }
      }
      const base = `/projects/${projectId}`;
      switch (key) {
        case "b":
          go(base);
          return true;
        case "m":
          go(`${base}?view=my`);
          return true;
        case "o":
          go(`${base}/objectives`);
          return true;
        case "t":
          go(`${base}/triage`);
          return true;
        case "s":
          go(`${base}/settings`);
          return true;
        default:
          return false;
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // ⌘/Ctrl+B toggles the app sidebar. Stand down while typing or in a
      // dialog so rich editors keep ⌘B for bold.
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.altKey &&
        !e.shiftKey &&
        eventKey(e) === "b"
      ) {
        if (isTypingTarget(e.target) || isDialogOpen()) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        setSidebarCollapsed((c) => !c);
        return;
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Second key of an armed chord: always consume it so it never reaches the
      // per-card field shortcuts, then route (if it maps to a destination).
      if (armedRef.current) {
        e.preventDefault();
        e.stopImmediatePropagation();
        runChord(eventKey(e));
        disarm();
        return;
      }

      // `?` (Shift+/ on most layouts) opens the shortcuts cheat sheet.
      if (e.key === "?") {
        if (isTypingTarget(e.target) || isDialogOpen()) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        trackEvent("cheatsheet_opened", {});
        setCheatsheetOpen(true);
        return;
      }

      if (e.shiftKey) return;
      if (isTypingTarget(e.target) || isDialogOpen()) return;
      if (eventKey(e) !== CHORD_PREFIX) return;

      // Arm the chord.
      e.preventDefault();
      e.stopImmediatePropagation();
      armedRef.current = true;
      setChordPrefix(CHORD_PREFIX);
      prefixToastId = toast(
        <span className="flex items-center gap-2">
          <Kbd size="sm">{CHORD_PREFIX.toUpperCase()}</Kbd>
          <span className="text-xs text-muted-foreground">{thenRef.current}…</span>
        </span>,
        { duration: CHORD_TIMEOUT_MS },
      );
      timer = setTimeout(disarm, CHORD_TIMEOUT_MS);
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      disarm();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ChordContext.Provider value={chordPrefix}>
      <SidebarContext.Provider value={sidebarValue}>
        <CheatsheetContext.Provider value={cheatsheetValue}>
          {children}
        </CheatsheetContext.Provider>
      </SidebarContext.Provider>
    </ChordContext.Provider>
  );
}
