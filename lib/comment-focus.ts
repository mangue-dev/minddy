"use client";

// ⇧C (MIN-803): go to an item's comment field, ready to type, with the thread
// scrolled to its latest message — from an issue card, from a row of a
// collection sidebar (objectives, feedback, pull requests, pages, triage), or
// on the item's own view.
//
// The gesture and the field rarely live in the same component: a card opens a
// panel the page owns, a sidebar row navigates, a page keeps its thread in an
// Activity sheet mounted on demand, and the panel's content renders in a
// portal one render after the panel itself. So the gesture leaves a REQUEST
// naming its target (`issue:<id>`, `page:<id>`…), and the two halves meet here:
//
// • a SURFACE (the view showing an item) registers how to bring its thread on
//   screen — open the Activity sheet, switch to the conversation tab — and is
//   what ⇧C targets when no row is hovered;
// • a COMPOSER registers how to focus itself; it takes the request as soon as
//   both exist, whichever comes first, and only then consumes it.
//
// Module state, like lib/keyboard/selection-keys.ts: the decision happens at
// keystroke time. A request that no composer takes (a reader who cannot
// comment, a navigation that failed) expires, so it cannot fire later when
// the same item opens for another reason.

import { useEffect, useRef } from "react";

export type CommentTargetKind = "issue" | "objective" | "feedback" | "pr" | "page";

/** The key a request, a surface and a composer agree on. */
export function commentTarget(kind: CommentTargetKind, id: string): string {
  return `${kind}:${id}`;
}

/** Long enough for a navigation and the lazy editor; short enough to never surprise. */
export const COMMENT_FOCUS_TTL_MS = 10_000;

interface Surface {
  target: string;
  open?: () => void;
}

let pending: { target: string; at: number } | null = null;
/** In registration order: the last one is the surface most recently shown. */
const surfaces: Surface[] = [];
const composers = new Map<string, () => void>();

function livePending(): string | null {
  if (pending && Date.now() - pending.at > COMMENT_FOCUS_TTL_MS) pending = null;
  return pending?.target ?? null;
}

function deliver(): void {
  const target = livePending();
  if (!target) return;
  const focus = composers.get(target);
  if (!focus) return;
  pending = null;
  focus();
}

/** Asks the composer of `target` to take the focus, now or once it mounts. */
export function requestCommentFocus(target: string): void {
  pending = { target, at: Date.now() };
  for (const surface of surfaces) {
    if (surface.target === target) surface.open?.();
  }
  deliver();
}

/**
 * ⇧C with no row under the pointer: the surface most recently shown. Returns
 * false when no view showing a comment thread is mounted.
 */
export function focusCurrentCommentSurface(): boolean {
  const current = surfaces.at(-1);
  if (!current) return false;
  requestCommentFocus(current.target);
  return true;
}

export function registerCommentSurface(target: string, open?: () => void): () => void {
  const surface: Surface = { target, open };
  surfaces.push(surface);
  if (livePending() === target) open?.();
  return () => {
    const index = surfaces.indexOf(surface);
    if (index !== -1) surfaces.splice(index, 1);
  };
}

export function registerCommentComposer(target: string, focus: () => void): () => void {
  composers.set(target, focus);
  deliver();
  return () => {
    if (composers.get(target) === focus) composers.delete(target);
  };
}

/** Test seam: forget every request and registration. */
export function resetCommentFocus(): void {
  pending = null;
  surfaces.length = 0;
  composers.clear();
}

/**
 * Declares the view showing `target`'s thread. `open` brings that thread on
 * screen when it is not (a closed sheet, another tab). `null` while the view
 * shows nothing or its viewer cannot comment.
 */
export function useCommentSurface(target: string | null, open?: () => void): void {
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    if (!target) return;
    return registerCommentSurface(target, () => openRef.current?.());
  }, [target]);
}

/** Declares the comment field of `target`; `focus` runs when ⇧C asks for it. */
export function useCommentComposerFocus(target: string | null, focus: () => void): void {
  const focusRef = useRef(focus);
  focusRef.current = focus;
  useEffect(() => {
    if (!target) return;
    return registerCommentComposer(target, () => focusRef.current());
  }, [target]);
}

/**
 * Scrolls the thread of the surface holding `from` (a composer) to its latest
 * entry, then brings `from` itself into view. The thread may still be loading
 * when the panel has just opened: it stays pinned to its end while it grows,
 * for a moment, until the user scrolls on their own.
 */
export function revealLatestComment(from: HTMLElement | null): void {
  const surface = from?.closest("[data-comment-surface]");
  if (!from || !surface) return;
  const reveal = () => {
    const thread = surface.querySelector("[data-comment-thread]");
    thread?.lastElementChild?.scrollIntoView({ block: "end" });
    from.scrollIntoView({ block: "nearest" });
  };
  reveal();
  const observer = new MutationObserver(reveal);
  observer.observe(surface, { childList: true, subtree: true });
  const stop = () => {
    observer.disconnect();
    clearTimeout(timer);
    window.removeEventListener("wheel", stop, true);
    window.removeEventListener("touchmove", stop, true);
  };
  const timer = setTimeout(stop, 1500);
  window.addEventListener("wheel", stop, { capture: true, passive: true });
  window.addEventListener("touchmove", stop, { capture: true, passive: true });
}
