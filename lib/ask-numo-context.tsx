"use client";

// Shortcut “@” (MIN-105): opens Numo with, in context, the element under the
// pointer — a ticket card, a yard line, a return line — or
// multiple selection when there is one. It is the keyboard counterpart of
// the “Ask Numo” action of the selection pill (see
// components/bulk-issue-actions.tsx): same `onAskNumo`, same pill
// contexte au-dessus du composer.
//
// Keyboard listening is UNIQUE and lives here, on the surface; the elements are
// just register. One listener per card (like the shortcuts of
// field) PLUS a global listener for the “selection without hover” case
// would walk on it: two openings for a single strike.
//
//Which element is under the pointer is read in the DOM AS YOU TYPE
// (`innermostHovered`), never in a state stored on hover: this one
// delays a passive effect on the pointer and still designates the element
// previous (MIN-158).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { eventKey } from "@/lib/keyboard/event-key";
import { isTypingTarget } from "@/lib/keyboard/keyboard-context";
import { innermostHovered } from "@/lib/keyboard/hover-keys";
import type { Issue } from "@/lib/types";

/**
 * “@” does not live on the same key depending on the layout: Shift+2 in QWERTY
 * US, bare key on a French Apple keyboard, AltGr+0 under Windows FR — and
 * AltGr raises both `ctrlKey` and `altKey`. We therefore read the produced CHARACTER
 * rather than the physical key, and we only discard the real combinations
 * ⌘/Ctrl. `eventKey` protects synthetic keydowns without `key`.
 */
function isAtSign(e: KeyboardEvent): boolean {
  if (eventKey(e) !== "@") return false;
  if (e.metaKey) return false;
  return !(e.ctrlKey && !e.altKey);
}

/** Nothing selected — a constant rather than a new `[]` each time it is rendered. */
const NOTHING: readonly never[] = [];

/**
 * Creates the provider + registration pair for ONE type of thing that we can
 * talk to Numo about. Provider and hook are born together because they share the same React context; calling it twice gives two waterproof registers.
 *
 * Two surfaces mounted at the same time do not interfere with each other, even if each one places
 * its listener: the one which has neither selection nor hovered element leaves without anything
 * consume (no `preventDefault`), and hovering cannot designate only one
 * register at a time.
 */
function createAskNumo<T>() {
  const Registry = createContext<{
    register: (el: Element, get: () => T) => () => void;
  } | null>(null);

  function AskProvider({
    selection,
    onAsk,
    children,
  }: {
    /** What is selected, and which takes precedence over hover. Empty if surface
 * does not have multi-select. */
    selection: readonly T[];
    onAsk: (targets: T[]) => void;
    children: ReactNode;
  }) {
    // The assembled elements, each knowing how to make their own fresh version of the thing
    // (a modified line under the pointer therefore never sends an outdated title).
    const targetsRef = useRef(new Map<Element, () => T>());
    // Mirror refs: the listener is placed only once and always reads the status
    // current, without resubscribing each time the selection changes.
    const selectionRef = useRef(selection);
    selectionRef.current = selection;
    const askRef = useRef(onAsk);
    askRef.current = onAsk;

    const register = useCallback((el: Element, get: () => T) => {
      const targets = targetsRef.current;
      targets.set(el, get);
      return () => {
        targets.delete(el);
      };
    }, []);

    useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
        if (!isAtSign(e)) return;
        // Never during an entry: “@” is a character (a mention, a
        // adresse e-mail), pas un raccourci.
        if (isTypingTarget(e.target)) return;
        const selected = selectionRef.current;
        const hovered = innermostHovered(targetsRef.current)?.();
        const targets =
          selected.length > 0 ? [...selected] : hovered ? [hovered] : [];
        if (targets.length === 0) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        askRef.current(targets);
      };
      window.addEventListener("keydown", onKey, true);
      return () => window.removeEventListener("keydown", onKey, true);
    }, []);

    const value = useMemo(() => ({ register }), [register]);

    return <Registry.Provider value={value}>{children}</Registry.Provider>;
  }

  /**
 * Declares an element as a possible target of "@". Returns a callback ref to
 * placed on it (merged with its other refs, without returning anything from the
 * merge: this is the callback with `null` which unsubscribes on disassembly — filter
 * view, drag). Outside of the surface (no provider), it's a no-op: the shortcut
 * simply does not exist there.
 */
  function useAskTarget(target: T): (el: Element | null) => void {
    const register = useContext(Registry)?.register;
    const targetRef = useRef(target);
    targetRef.current = target;
    const unregister = useRef<(() => void) | null>(null);

    return useCallback(
      (el: Element | null) => {
        unregister.current?.();
        unregister.current =
          el && register ? register(el, () => targetRef.current) : null;
      },
      [register]
    );
  }

  return { AskProvider, useAskTarget };
}

// ── Tickets: project board, global board, sorting column ───────────────

const issueAsk = createAskNumo<Issue>();

/**
 * Set up by a board (or the sorting column): arbitrates what “@” sends to
 * Numo. Selection takes precedence over hover — when the pill is there, it
 * is the current mode.
 */
export function AskNumoProvider({
  selectedIssues,
  onAskNumo,
  children,
}: {
  selectedIssues: Issue[];
  onAskNumo: (issues: Issue[]) => void;
  children: ReactNode;
}) {
  return (
    <issueAsk.AskProvider selection={selectedIssues} onAsk={onAskNumo}>
      {children}
    </issueAsk.AskProvider>
  );
}

/** Declares a ticket card as a possible target of "@". */
export const useAskNumoTarget = issueAsk.useAskTarget;

// ── Returns: column in the team tab ─────────────────────────────────────

/**
 * The minimum that a return line must be able to say about itself for Numo
 * to receive it in context. Deliberately structural rather than
 * `TeamFeedbackListItem`: this file does not have to know the form of a return.
 */
export interface AskNumoFeedback {
  id: string;
  /** The canonical title — the one carried by the composer's context pill. */
  title: string;
}

const feedbackAsk = createAskNumo<AskNumoFeedback>();

/**
 * Set up by the returns team tab: "@" on hovering over a line opens
 * Numo with THIS feedback in context, without having to open it first.
 *
 * No selection here — the returns are decided one by one — so hovering
 * decides alone, and the callback receives a return and not a list.
 */
export function AskNumoFeedbackProvider({
  onAskNumo,
  children,
}: {
  onAskNumo: (post: AskNumoFeedback) => void;
  children: ReactNode;
}) {
  const onAsk = useCallback(
    (targets: AskNumoFeedback[]) => onAskNumo(targets[0]),
    [onAskNumo]
  );
  return (
    <feedbackAsk.AskProvider selection={NOTHING} onAsk={onAsk}>
      {children}
    </feedbackAsk.AskProvider>
  );
}

/** Declares a return line as a possible target of "@". */
export const useAskNumoFeedbackTarget = feedbackAsk.useAskTarget;
