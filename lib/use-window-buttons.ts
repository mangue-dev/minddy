"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  desktopBridgePlatform,
  getDesktopBridge,
} from "./desktop/bridge";
import { trace } from "./desktop/trace";

/**
 * macOS buttons: who removes them, what they do, and what the bar
 * side must show (MIN-291).
 *
 * **What they do is asked in the main process, it cannot be guessed.** Two
 * things decide: the page, who knows when they get in the way — folded bar, box of
 * open dialogue; and FULL SCREEN, where macOS takes them to the top of the screen,
 * under his own custody, without warning anyone. A layout connected to the
 * request rather than on the result leaves a hole of 78 px as soon as we switch to
 * full screen. Seen in use.
 */

/**
 * The reasons for removing them, in progress. A `Set` and not a Boolean: they are
 * cumulate — a dialog box may open while the bar is already at
 * rail — and the last one to rise must not return them for the others.
 *
 * State lives outside of React, at the module level: it is a property of the
 * WINDOW, no component tree, and the requesters are scattered (the
 * sidebar, the modal watcher) without a common ancestor that is not the
 * layout entier.
 */
const holds = new Set<string>();

let flush = 0;

function macDesktopBridge() {
  const bridge = getDesktopBridge();
  if (!bridge || typeof navigator === "undefined") return null;
  return desktopBridgePlatform(bridge, navigator.platform) === "darwin"
    ? bridge
    : null;
}

/**
 * We announce the state of the reasons **once the pile is down**, not every time
 * movement — and this is what stops the buttons from FLASHING.
 *
 * A reason can be released and then resumed in the same loop: React
 * disassembles the effects of one subtree before mounting those of the next, and two
 * screens that ask the same thing take turns exactly like that. Pushed
 * as it is, it gives two messages — “show them”, then “hide them” — that the
 * main process executes one after the other. The buttons are NATIVE: they
 * appear instantly, outside of any rendering of the page, and the composer
 * has plenty of time to paint them in between. We see them emerge then
 * disappear, without anything on the screen having moved.
 *
 * A postponement at the end of the turn is enough: the two movements cancel each other out, and there is no
 * leaves only ONE message, carrying the fallen state. What really changes is
 * the following image — no one can see the difference.
 *
 * ⚠ We do NOT add deduplication to the value sent, and this is deliberate:
 * `useWindowButtonsSlot` is waiting for a response from the bridge to unfreeze its layout
 * (see `settling`). Silencing a message because it repeats the previous one — real case:
 * a dialog that opens and closes while the rail is already holding the buttons —
 * would leave her waiting for an answer that would never come. One message too many
 * only costs one `setWindowButtonVisibility` more.
 */
function pushToBridge(): void {
  if (flush) return;
  flush = window.setTimeout(() => {
    flush = 0;
    const wanted = holds.size === 0;
    // The two ends of the bridge are traced (MIN-307): what we ASK here, what
    // COMES BACK to `useWindowButtonsSlot`. It's the gap between the two that says
    // that a message was lost or arrived at the wrong time.
    //
    // The trace is placed IN the report, not in the call: this is the message
    // actually sent that it must describe, and several calls of the same
    // image n'en produisent qu'un.
    trace("wb:push", { wanted, holds: [...holds].join("|") || "—" });
    macDesktopBridge()?.setWindowButtonsVisible(wanted);
  }, 0);
}

/**
 * Remove buttons as long as `active` is true, under a named reason.
 *
 * The reason is not decorative: it is what allows two applicants to
 * coexist without one canceling the other. Release is automatic when
 * unmount — zen mode unmounts the sidebar, and a window without a bar
 * ni boutons n'aurait plus de fermeture visible.
 */
export function useHoldWindowButtons(reason: string, active: boolean): void {
  useEffect(() => {
    if (!active || !macDesktopBridge()) return;
    watchContradiction();
    holds.add(reason);
    pushToBridge();
    return () => {
      holds.delete(reason);
      pushToBridge();
    };
  }, [reason, active]);
}

/**
 * The safeguard: **the request can be reset without the page
 * know**, and it must then be reaffirmed.
 *
 * The shell resets `wantsWindowButtons` to true for each new document —
 * legitimate, a new page has never asked for anything. But she did it for a long time
 * on an event that is too broad (`did-start-loading`, which also covers
 * navigations of the SPA), and the result was silent: the buttons returned by
 * above a bar to the rail, definitely, because no one on the page side had
 * reason to ask again. Nothing in the page's code could let it
 * see — the `Set` was correct, it was the other end who was no longer listening to it.
 *
 * The event is corrected (desktop/src/main.ts), and **this guardrail remains**: it
 * does not depend on any particular event, only on the contradiction
 * herself. The buttons are announced PRESENT even though the page has reasons
 * to remove them? Something has taken over; we ask again. Full screen
 * the shell announces `false`, so this case is never triggered wrongly, and
 * il n'y a pas de boucle possible : notre demande fait publier `false`.
 *
 * A single subscription for the entire page, open to the first reason asked and
 * kept afterwards — this is a property of the window, not of a component.
 */
let contradictionWatcher: (() => void) | null = null;

function watchContradiction(): void {
  if (contradictionWatcher) return;
  contradictionWatcher =
    macDesktopBridge()?.onWindowButtons((visible) => {
      if (visible && holds.size > 0) pushToBridge();
    }) ?? null;
}

/**
 * Reaffirms, once per document, what THIS document wants (MIN-304).
 *
 * **A window without lights is a window that can no longer be closed or reduced to
 * the mouse.** But the two halves of the state do not live in the same place:
 * `wantsWindowButtons` is a MAIN variable that survives documents,
 * `holds` is a PAGE module that dies with it. The hand returns its half
 * to `true` at the start of a full load — but its message goes to the old one
 * document, still alive, and the new one starts with an empty `holds` without
 * never push anything: `useHoldWindowButtons` comes out on `if (!active) return`.
 * No one, on the page side, then has any reason to ask for them again, and what repairs
 * is not navigation but a cycle of reason — in practice, open then
 * close the ⌘K palette.
 *
 * Hence this UNCONDITIONAL call for editing. It costs a message and closes it
 * hole for good: whatever state the hand has kept, it is then worth
 * what this document asks for, that is to say nothing as long as nothing is opened.
 *
 * ⚠ To mount in the ROOT layout (components/desktop-chrome.tsx), especially not in
 * `DesktopWindowButtons`: this one only lives under app/(app)/app-providers.tsx,
 * so it is missing from connection, `/f/`, `/p/` and page 404 —
 * exactly the screens that are reached by a full load.
 *
 * ⚠ This hook and `watchContradiction` above do not duplicate: they
 * covers the START of a document (a new `holds` that no one pushed),
 * the other covers the SUITE (a request taken up during the life of the page).
 */
export function useAffirmWindowButtons(): void {
  useEffect(() => {
    pushToBridge();
  }, []);
}

/* ─── Ce qui couvre l'app ──────────────────────────────────────────────── */

/**
 * Quelque chose couvre-t-il l'app — dialogue, wizard, panneau, tiroir ?
 *
 * **Two markers, because there are two families**, and neither is enough
 * alone — the three cases were noted in the DOM rather than assumed:
 *
 * - the **veil** of mango-ui (`data-slot="…-overlay"`). He grabs the notebook
 * notes, NON-modal dialogue — we continue reading behind, so no
 *   d'`aria-modal` — mais qui pose bien son voile ;
 * - **`aria-modal="true"`**. He grabs the ⌘K palette, which comes of its own
 * package: neither `data-slot`, nor mango-ui veil, but indeed a modal.
 *
 * What we dismiss in passing, and that is the goal: `role="dialog"` quite simply, that
 * Radix ALSO gives popovers and selectors. They don't cover anything, and
 * buttons would flash with each opened menu.
 */
const MODAL_SELECTOR = [
  '[data-slot="dialog-overlay"]',
  '[data-slot="alert-dialog-overlay"]',
  '[data-slot="sheet-overlay"]',
  '[data-slot="side-panel-overlay"]',
  '[data-slot="drawer-overlay"]',
  '[role="dialog"][aria-modal="true"]',
  '[role="alertdialog"][aria-modal="true"]',
].join(", ");

/**
 * AN observer for all readers. Two components raise the question (the
 * spotter who removes the buttons, the bar which draws the lures) and nothing
 * justifies two `MutationObserver` on the document.
 *
 * Observation: the arrival of the portal is not enough — the attributes are established
 * after the insertion — so we also listen to those, but **in the same
 * `observe()`**. This is the trap that cost me a ride: a second call on the
 * same node is not added to the first, it REPLACES its options. The exam is
 * carried over by one frame: one DOM read per burst, not one per inserted node.
 *
 * **What we tried and discarded (MIN-312), so as not to try it again.**
 *
 * The idea was to split into two observers — the attributes in `subtree`, the
 * pose des portails en enfants DIRECTS de `<body>` sans `subtree` —, ce qui
 * would have removed the allocation of one `MutationRecord` per inserted node regardless
 * where in the app. It does not fit here: **the ⌘K palette is not portalized**,
 * it is rendered in place in the tree (lib/command-palette/CommandPalette.tsx),
 * deep under `<body>`. And its `aria-modal="true"` is placed BEFORE
 * insertion, so no attribute record is emitted either: a
 * `childList` without `subtree` would have remained silent about her, forever.
 *
 * There remain the two gestures which hold:
 *
 * - **nothing at all out of the shell.** `useAnyModalOpen` only has one
 * consumer, `DesktopWindowButtons`, which is only used to remove buttons
 * natives. On the web, the observer worked for no one;
 * - **one `querySelector` per USEFUL burst.** The dominant case — the strike in
 * tiptap, the agent thread that fills — only inserts TEXT nodes, and
 * a text node cannot carry either `data-slot` or `aria-modal`. We don't
 * therefore only crosses the document if the burst contains at least one element.
 */
let modalOpen = false;
let observer: MutationObserver | null = null;
let scheduled = 0;
const modalListeners = new Set<() => void>();

/** Can this burst change the answer? (see comment above) */
function mayAffectModal(records: MutationRecord[]): boolean {
  for (const record of records) {
    if (record.type !== "childList") return true;
    for (const node of record.addedNodes) {
      if (node.nodeType === Node.ELEMENT_NODE) return true;
    }
    for (const node of record.removedNodes) {
      if (node.nodeType === Node.ELEMENT_NODE) return true;
    }
  }
  return false;
}

function readModalOpen(): void {
  const next = !!document.querySelector(MODAL_SELECTOR);
  if (next === modalOpen) return;
  modalOpen = next;
  for (const listener of modalListeners) listener();
}

function subscribeModal(listener: () => void): () => void {
  // Outside of the shell, there are no native buttons to remove: nothing to observe.
  if (!macDesktopBridge()) return () => {};

  modalListeners.add(listener);
  if (!observer) {
    readModalOpen();
    observer = new MutationObserver((records) => {
      if (scheduled || !mayAffectModal(records)) return;
      scheduled = requestAnimationFrame(() => {
        scheduled = 0;
        readModalOpen();
      });
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-slot", "data-state", "aria-modal"],
    });
  }
  return () => {
    modalListeners.delete(listener);
    if (modalListeners.size > 0) return;
    if (scheduled) cancelAnimationFrame(scheduled);
    scheduled = 0;
    observer?.disconnect();
    observer = null;
  };
}

export function useAnyModalOpen(): boolean {
  return useSyncExternalStore(
    subscribeModal,
    () => modalOpen,
    // Server rendering: nothing is open, and there is no DOM to query.
    () => false
  );
}

/* ─── Who hosts the buttons ────────────────────── ────────────────────── */

/**
 * The layout toggle point (`--breakpoint-desktop` of the app).
 * Below this width, the AppShell no longer renders the sidebars: this is
 * the header which is found in the top left corner, therefore under the buttons.
 */
const DESKTOP_BREAKPOINT_PX = 768;

/**
 * Is the sidebar rendered? (≥768px)
 *
 * What depends on it: **who hosts the macOS buttons**. They live in the line
 * mark of the bar, but the AppShell removes it below 768 px — it remains
 * CLIMB (`display: none`), which is the trap: without this question, it
 * continued to request their removal when its rail folded, and their
 * reserve a place that no one saw. Under 768 px, it is the header which
 * welcomes them.
 *
 * `false` au premier rendu, serveur comme client — il n'y a pas de `matchMedia`
 * to query on the server side, and assuming it would cause the hydration to diverge.
 */
export function useWideLayout(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT_PX}px)`);
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return wide;
}

/* ─── What the brand line should show ───────────────────────────── */

export interface WindowButtonsSlot {
  /** Does the brand line keep their place? (the mark goes to the right) */
  reserved: boolean;
  /** Should we draw LURES, the real ones being removed for the duration of a modal? */
  decoy: boolean;
  /**
   * Have we received the first state of the window?
   *
   * For ANIMATION only: the mark slides from one edge to the other when the
   * place opens or closes (full screen, rail), and it must not be
   * slides at the very first display — before the bridge responds, the place is worth
   * “closed” by default, and animating this catch-up would start the app on
   * un logo qui traverse sa barre.
   */
  ready: boolean;
}

const CLOSED: WindowButtonsSlot = { reserved: false, decoy: false, ready: false };

/**
 * What the surface that hosts them should display in their place.
 *
 * `hosts`: is this surface the one that welcomes them at the moment? There
 * sidebar above 768 px, header below — view
 * `useWideLayout`. A surface that does not host reserves nothing.
 *
 * The delicate point, and it is this which justifies this hook: **a box of
 * dialogue should not blow the bar**. Removing the buttons is
 * necessary — they are native, drawn by the system on top of the web view,
 * and no `z-index` passes in front: otherwise they remain across the corner of the
 * dialogue, over her veil. But if the layout stupidly followed their
 * disappearance, the mark would jump to the left at each opening and return to
 * closing, for an object that we don't even look at.
 *
 * Hence: the place remains RESERVED — frozen at what it was worth at the time the
 * dialogue has opened — and we draw three identical pellets. They
 * go under the veil like the rest of the app, which is exactly the effect
 * that we were initially looking for.
 *
 * ⚠ **Thawing cannot follow the closing of the dialog: it must follow the
 * RETURN of the buttons.** This is the whole story of the ~50 ms burst that we saw
 * upon closing. The two news do not come from the same place: the
 * dialog left the DOM (immediate), the buttons return from the main process
 * (an IPC round trip further). Thawing on the first one reads `visible`
 * while it is still worth `false` — the place closes, the mark jumps to
 * left, and the IPC comes right after to put everything back. Hence `settling`: at the
 * closing, we remain on the frozen value until the NEXT message from the bridge.
 * It always happens — releasing the request republishes it (`applyWindowButtons`).
 */
export function useWindowButtonsSlot(hosts = true): WindowButtonsSlot {
  const [visible, setVisible] = useState(false);
  const [started, setStarted] = useState(false);
  const [ready, setReady] = useState(false);
  const modal = useAnyModalOpen();

  // Is the closure of dialogue still being digested by the
  // main process? Adjusted DURING rendering (not in an effect): an effect
  // runs after painting, and the offending frame would already be on screen.
  const [settling, setSettling] = useState(true);
  const [wasModal, setWasModal] = useState(false);
  if (wasModal !== modal) {
    setWasModal(modal);
    if (!modal) setSettling(true);
  }

  // What the place was worth at the last moment STABLE — no open dialogue, no
  // fermeture en cours de digestion.
  const frozen = useRef(false);
  useEffect(() => {
    if (!modal && !settling) frozen.current = visible;
  }, [modal, settling, visible]);

  useEffect(() => {
    const bridge = macDesktopBridge();
    if (!bridge) return;
    // The current state is replayed upon subscription: the window can be in full
    // screen when loading, and then no one would have anything to announce.
    return bridge.onWindowButtons((next) => {
      trace("wb:state", { visible: next });
      setVisible(next);
      setSettling(false);
      setStarted(true);
    });
  }, []);

  /**
   * The animation sets one FRAME AFTER the first position, never with it.
   *
   * A transition starts when it is declared at the time the property
   * change: putting the duration and the arrival position in the same rendering would
   * drag mark when starting the app, what this flag is precisely
   * there to avoid. Two `requestAnimationFrame` — the first leaves React
   * paint the position, the second arms the movement for the SUITE.
   */
  useEffect(() => {
    if (!started) return;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setReady(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [started]);

  if (!hosts) return CLOSED;
  const reserved = modal || settling ? frozen.current : visible;
  return { reserved, decoy: reserved && !visible, ready };
}
