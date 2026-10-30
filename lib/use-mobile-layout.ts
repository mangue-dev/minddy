"use client";

import { useEffect, useSyncExternalStore } from "react";

import { isMobileLayout, subscribeAppLayout } from "./app-layout";
import { isKeyboardOpen, keyboardInset, revealDelta } from "./mobile-keyboard";

export { MOBILE_LAYOUT_QUERY } from "./app-layout";
const serverSnapshot = () => undefined;

/** Resolve the viewport before mounting anything that writes desktop tabs. */
export function useMobileLayout() {
  return useSyncExternalStore(subscribeAppLayout, isMobileLayout, serverSnapshot);
}

const SHELL_SELECTOR = ".app-workspace";
// A sheet, dialog or popover, wherever its portal is rendered.
const OVERLAY_SELECTOR = '[role="dialog"], [role="alertdialog"]';

/** Who makes room for a field: the workspace itself, or the surface over it. */
function keyboardOwner(field: HTMLElement) {
  return field.closest(SHELL_SELECTOR) && !field.closest(OVERLAY_SELECTOR) ? "shell" : "overlay";
}
const TEXT_INPUT_TYPES = new Set(["", "text", "search", "email", "url", "tel", "password", "number"]);

/** A field that brings up the software keyboard. */
function isTextField(element: EventTarget | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  if (element.isContentEditable) return true;
  if (element instanceof HTMLTextAreaElement) return !element.readOnly && !element.disabled;
  if (element instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(element.type) && !element.readOnly && !element.disabled;
  return false;
}

function focusedTextField(): HTMLElement | null {
  const element = document.activeElement;
  return isTextField(element) ? element : null;
}

/**
 * Safari scrolls the document to center a field it focuses, and a later
 * `scrollTo(0, 0)` does not undo it. A field translated far above the
 * viewport for the frame of its focus gives it nothing to scroll to — the
 * technique of react-aria's `usePreventScroll`, which vaul ships too.
 */
const OFFSCREEN = "translateY(-2000px)";
function focusWithoutScroll(field: HTMLElement, focus: boolean) {
  // Focusing from a tap fires the focus handler too: one transform, one restore.
  if (field.style.transform !== OFFSCREEN) {
    const previous = field.style.transform;
    field.style.transform = OFFSCREEN;
    requestAnimationFrame(() => {
      field.style.transform = previous;
    });
  }
  if (focus) field.focus({ preventScroll: true });
}

/** The caret of a rich text field, else the field itself. */
function fieldRect(field: HTMLElement): DOMRect {
  if (field.isContentEditable) {
    const selection = window.getSelection();
    if (selection?.rangeCount && field.contains(selection.anchorNode)) {
      const range = selection.getRangeAt(0);
      const rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
      if (rect.height > 0) return rect;
    }
  }
  return field.getBoundingClientRect();
}

function scrollParent(element: HTMLElement): HTMLElement | null {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const { overflowY } = getComputedStyle(parent);
    if ((overflowY === "auto" || overflowY === "scroll") && parent.scrollHeight > parent.clientHeight) return parent;
  }
  return null;
}

/**
 * What Safari would have done by scrolling the document, done inside the
 * field's own scroll area once the document is pinned: bring the field (or
 * the caret of a rich text field) above the keyboard.
 */
function revealField(field: HTMLElement, viewport: VisualViewport) {
  const container = scrollParent(field);
  if (!container) return;
  const box = container.getBoundingClientRect();
  const area = {
    top: Math.max(box.top, viewport.offsetTop),
    bottom: Math.min(box.bottom, viewport.offsetTop + viewport.height),
  };
  const rect = fieldRect(field);
  const delta = revealDelta(rect, area);
  if (delta) container.scrollBy({ top: delta, behavior: "smooth" });
}

/**
 * The keyboard's height, remembered per layout size: Safari only reports it
 * once its animation is over, so a sheet that waited for it jumped up after
 * the keyboard instead of rising with it. Per viewer, best effort.
 */
const KEYBOARD_STORAGE_KEY = "minddy:keyboard-height";

/**
 * The keyboard differs by field: a search field gets no suggestion bar, so
 * its keyboard is shorter than a text field's. Remembered per screen and kind.
 */
function keyboardKey(root: HTMLElement, field: HTMLElement) {
  const kind = field.isContentEditable
    ? "rich"
    : `${field.tagName.toLowerCase()}:${field.getAttribute("type") ?? ""}:${field.getAttribute("autocorrect") ?? ""}`;
  return `${root.clientWidth}x${root.clientHeight}:${kind}`;
}

function readKnownKeyboard(root: HTMLElement, field: HTMLElement): number | null {
  try {
    const known = JSON.parse(localStorage.getItem(KEYBOARD_STORAGE_KEY) ?? "{}") as Record<string, number>;
    const key = keyboardKey(root, field);
    if (known[key]) return known[key];
    // Another kind on the same screen is still a better guess than nothing.
    const screen = key.slice(0, key.indexOf(":") + 1);
    const sibling = Object.keys(known).find((candidate) => candidate.startsWith(screen));
    return sibling ? known[sibling] : null;
  } catch {
    return null;
  }
}

function rememberKeyboard(root: HTMLElement, field: HTMLElement, height: number) {
  try {
    const known = JSON.parse(localStorage.getItem(KEYBOARD_STORAGE_KEY) ?? "{}") as Record<string, number>;
    const key = keyboardKey(root, field);
    if (known[key] === height) return;
    known[key] = height;
    localStorage.setItem(KEYBOARD_STORAGE_KEY, JSON.stringify(known));
  } catch {
    // Private mode or blocked storage: the next opening waits for Safari.
  }
}

/** How long a predicted keyboard waits for the real one before giving up. */
const PREDICTION_MS = 800;
/**
 * How long the keyboard tokens animate after the keyboard opens or closes
 * (app/globals.css, `--mobile-keyboard-duration`, plus a margin). Outside that
 * window they follow the keyboard as it is: a suggestion bar appearing must
 * not crawl over 380 ms.
 */
const MOVING_MS = 450;
// A mobile sheet, alert or drawer is open: what lies under it is its color.
const SURFACE_SELECTOR = '[data-slot="sheet-content"], [data-slot="alert-dialog-content"], [data-vaul-drawer]';

/**
 * Keep sheets above the software keyboard on browsers with a visual viewport.
 *
 * Publishes `--mobile-viewport-height` and `--mobile-keyboard-inset` on the
 * root, and `data-mobile-keyboard` while a text field holds the keyboard:
 * `shell` when the field belongs to the workspace (a composer, a page),
 * `overlay` when it sits in a portaled sheet or dialog (app/globals.css).
 *
 * `pinDocument` is for the app shell, whose document never scrolls (MIN-870):
 * iOS Safari ignores `interactive-widget` and scrolls the whole document to
 * bring a focused field above the keyboard, sliding the app under the status
 * bar. The pin cancels that scroll; the shell or the sheet then makes room
 * itself, and the field is revealed inside its own scroll area. Pages that
 * scroll the window (documentation) leave it off.
 */
export function useMobileViewport({ pinDocument = false }: { pinDocument?: boolean } = {}) {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    let frame = 0;
    let revealed: HTMLElement | null = null;
    let predicted: { height: number; until: number } | null = null;
    let expire = 0;
    let wasOpen = false;
    let moving = 0;
    const baselines = new Map<number, number>();

    const pin = () => {
      if (!pinDocument || viewport.scale > 1.01) return;
      if (window.scrollY !== 0 || window.scrollX !== 0) window.scrollTo(0, 0);
    };
    const update = () => {
      frame = 0;
      pin();
      const baselineHeight = Math.max(baselines.get(root.clientWidth) ?? 0, root.clientHeight);
      baselines.set(root.clientWidth, baselineHeight);
      let sample = {
        layoutHeight: root.clientHeight,
        viewportHeight: viewport.height,
        offsetTop: viewport.offsetTop,
        scale: viewport.scale,
        baselineHeight,
      };
      const focused = focusedTextField();
      if (isKeyboardOpen(sample)) {
        predicted = null;
        const inset = keyboardInset(sample);
        if (pinDocument && focused && sample.offsetTop === 0 && inset) rememberKeyboard(root, focused, inset);
      } else if (predicted && (!focused || performance.now() > predicted.until)) {
        predicted = null;
      }
      if (pinDocument && predicted) {
        // The keyboard is on its way: lay out for it now.
        sample = { ...sample, viewportHeight: sample.layoutHeight - predicted.height, offsetTop: 0 };
      } else if (pinDocument && !focused && isKeyboardOpen(sample)) {
        // No field holds it any more: the keyboard is on its way out.
        sample = { ...sample, viewportHeight: sample.layoutHeight, baselineHeight: sample.layoutHeight, offsetTop: 0 };
      }
      root.style.setProperty("--mobile-viewport-height", `${sample.viewportHeight}px`);
      root.style.setProperty("--mobile-keyboard-inset", `${keyboardInset(sample)}px`);
      const field = isKeyboardOpen(sample) ? focused : null;
      if (field) root.setAttribute("data-mobile-keyboard", keyboardOwner(field));
      else root.removeAttribute("data-mobile-keyboard");
      root.toggleAttribute("data-mobile-surface", Boolean(document.querySelector(SURFACE_SELECTOR)));
      if (Boolean(field) !== wasOpen) {
        wasOpen = Boolean(field);
        root.setAttribute("data-mobile-keyboard-moving", "");
        window.clearTimeout(moving);
        moving = window.setTimeout(() => root.removeAttribute("data-mobile-keyboard-moving"), MOVING_MS);
      }
      // Once per field: afterwards, the caret is the editor's business. In
      // the next frame, once a tapped field is back from its off-screen focus.
      // A ProseMirror editor keeps its caret in view itself
      // (components/editor/mobile-editor-toolbar.tsx): two scrolls aiming at
      // two places made the text jump.
      if (pinDocument && field && field !== revealed && !field.closest(".ProseMirror")) {
        requestAnimationFrame(() => revealField(field, viewport));
      }
      revealed = field;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    // Safari's own scroll to the focused field ends after the last resize
    // event: check again once the keyboard has settled.
    let settle = 0;
    const onViewportChange = () => {
      schedule();
      window.clearTimeout(settle);
      settle = window.setTimeout(schedule, 300);
    };
    // A field takes the focus with the keyboard still closed: start moving
    // with the keyboard, at the height it had last time on this screen.
    const onFocusIn = (event: FocusEvent) => {
      if (pinDocument && isMobileLayout() && isTextField(event.target) && !predicted) {
        const keyboardClosed = root.clientHeight - viewport.height < 80;
        const known = keyboardClosed ? readKnownKeyboard(root, event.target) : null;
        if (known) {
          predicted = { height: known, until: performance.now() + PREDICTION_MS };
          cancelAnimationFrame(frame);
          update();
          window.clearTimeout(expire);
          expire = window.setTimeout(schedule, PREDICTION_MS);
        }
      }
      onViewportChange();
    };
    // Synchronous: cancelling the scroll before the next paint keeps the app
    // from flashing under the status bar.
    const onWindowScroll = () => {
      pin();
      schedule();
    };
    // A tap must be caught before Safari's focus: focus the field ourselves.
    // Not a rich text field, whose caret goes where the finger lands; its
    // focus event below is enough in practice.
    let touchStart: { x: number; y: number } | null = null;
    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      touchStart = touch ? { x: touch.clientX, y: touch.clientY } : null;
    };
    const onTouchEnd = (event: TouchEvent) => {
      const target = event.target;
      if (!isMobileLayout() || !isTextField(target) || target.isContentEditable || target === document.activeElement) return;
      // The end of a scroll that started on a field is not a tap.
      const touch = event.changedTouches[0];
      if (!touch || !touchStart || Math.hypot(touch.clientX - touchStart.x, touch.clientY - touchStart.y) > 10) return;
      event.preventDefault();
      focusWithoutScroll(target, true);
    };
    // Focus moved another way: keyboard arrows, the editor, a script.
    const onFocus = (event: FocusEvent) => {
      if (isMobileLayout() && isTextField(event.target)) focusWithoutScroll(event.target, false);
    };

    update();
    viewport.addEventListener("resize", onViewportChange);
    viewport.addEventListener("scroll", onViewportChange);
    window.addEventListener("scroll", onWindowScroll, { passive: true });
    if (pinDocument) {
      document.addEventListener("touchstart", onTouchStart, { passive: true, capture: true });
      document.addEventListener("touchend", onTouchEnd, { passive: false, capture: true });
      document.addEventListener("focus", onFocus, true);
    }
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(settle);
      window.clearTimeout(expire);
      window.clearTimeout(moving);
      viewport.removeEventListener("resize", onViewportChange);
      viewport.removeEventListener("scroll", onViewportChange);
      window.removeEventListener("scroll", onWindowScroll);
      document.removeEventListener("touchstart", onTouchStart, { capture: true });
      document.removeEventListener("touchend", onTouchEnd, { capture: true });
      document.removeEventListener("focus", onFocus, true);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", schedule);
      root.style.removeProperty("--mobile-viewport-height");
      root.style.removeProperty("--mobile-keyboard-inset");
      root.removeAttribute("data-mobile-keyboard");
      root.removeAttribute("data-mobile-keyboard-moving");
      root.removeAttribute("data-mobile-surface");
    };
  }, [pinDocument]);
}
