"use client";

// Global navigation keyboard chords, a la AutoKap. A leader key **G** (Go) arms
// a chord; the next key picks the destination. While a chord is armed, the
// sidebar surfaces each option's second key as a <Kbd> hint (see AppSidebar).
//
//   Global:      G H home · G I inbox · G R pull requests · G J agents · G U routines
//                G A assistant (Numo) · Mod+Shift+N notes
//                G B all issues (every project) · G M my issues
//   In a project: G P the project's own board · G O objectives · G T triage
//                 G F feedback · G S project settings
//
// The listener runs in the capture phase and, once G is armed, consumes the
// next key outright (preventDefault + stopImmediatePropagation) so it never
// leaks to the per-card field shortcuts (S/P/E/A/L/D/O) — e.g. `G A` opens the
// assistant instead of the assignee picker even while hovering an issue card.
//
// It also owns the `?` cheat sheet, co-located here like AutoKap's keyboard
//store. The sidebar no longer has a manual fold: the only rail is
// that of pages with secondary sidebar, and it unfolds on hover.

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
import { projectIdFromPath } from "@/lib/project-id-from-path";
import { useAssistantPanel } from "@/lib/assistant-panel-context";
import { useScratchpad } from "@/lib/scratchpad-context";
import { useSecondarySidebar } from "@/lib/secondary-sidebar-context";
import { eventKey } from "@/lib/keyboard/event-key";
import { matchesModShiftCombo } from "@/lib/keyboard/mod-combo";
import { trackEvent } from "@/lib/analytics";

/** Leader key that arms a navigation chord. */
export const CHORD_PREFIX = "g";
const CHORD_TIMEOUT_MS = 1500;

const ChordContext = createContext<string | null>(null);

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
  const { present: secondaryPresent } = useSecondarySidebar();
  const [chordPrefix, setChordPrefix] = useState<string | null>(null);
  const [cheatsheetOpen, setCheatsheetOpen] = useState(false);
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
  const secondaryPresentRef = useRef(secondaryPresent);
  secondaryPresentRef.current = secondaryPresent;
  // Mirrors chordPrefix synchronously for the listener (state is async).
  const armedRef = useRef(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const disarm = () => {
      armedRef.current = false;
      setChordPrefix(null);
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
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
        case "r":
          go("/pull-requests");
          return true;
        case "j":
          go("/agents");
          return true;
        case "u":
          go("/routines");
          return true;
        case "a":
          toggleAssistantRef.current();
          return true;
        // B reaches the cross-project tickets board from anywhere, a project
        // included — the project's own board is G P. M is that same /all board
        // with the "Mes tickets" system view pre-selected (?view= one-shot).
        case "b":
          go("/all");
          return true;
        case "m":
          go("/all?view=my");
          return true;
        default:
          break;
      }
      if (!projectId) return false;
      const base = `/projects/${projectId}`;
      switch (key) {
        case "p":
          go(base);
          return true;
        case "f":
          go(`${base}/feedback`);
          return true;
        case "o":
          go(`${base}/objectives`);
          return true;
        case "w":
          go(`${base}/pages`);
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
      if (matchesModShiftCombo(e, "n")) {
        if (isTypingTarget(e.target) || isDialogOpen()) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        openScratchpadRef.current("shortcut");
        disarm();
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
      <CheatsheetContext.Provider value={cheatsheetValue}>
        {children}
      </CheatsheetContext.Provider>
    </ChordContext.Provider>
  );
}
