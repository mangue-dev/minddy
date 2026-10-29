"use client";

// The geometry and the look of the buttons beside a page block, shared by the
// gutter (block-gutter.tsx: the handle, the `+` and the new-comment button)
// and the comment badge of a commented block (block-comments.ts), which is
// the new-comment button's twin: same size, same place, the count added.

import { cn } from "@/lib/utils";
import { scrollPane } from "@/lib/scroll-pane";
import { styledBox } from "@/components/pages/block-actions";

/** Side of the handle, the taller gutter button, in pixels: its 24 px icon
    (the 24 px body line height) and a 2 px padding. It is used to centre the
    buttons on the block's first line, which has no CSS equivalent. */
export const BUTTON_SIZE = 28;

/** The gap between the buttons and the text: `GUTTER_GAP_MIN` always, plus
    up to `GUTTER_GAP_EXTRA` while the pane leaves the room for it. */
export const GUTTER_GAP_MIN = 4;
export const GUTTER_GAP_EXTRA = 10;

/** The margin the buttons keep from the pane's edge (a side panel's border):
    the gap to the text gives way first. */
export const GUTTER_EDGE_MIN = 8;

/** The comment button on the right of a page block, and its gap to the text.
    It lives in the column's right reserve (`app-desktop:pr-10`). */
export const COMMENT_BUTTON_SIZE = 24;
const COMMENT_BUTTON_GAP = 6;

/** The look of every button beside a block. */
export const GUTTER_BUTTON = cn(
  "flex items-center justify-center rounded-md p-0.5 text-muted-foreground/60",
  "transition-colors hover:bg-muted hover:text-foreground",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
);

/**
 * How far below a block's top edge its buttons start, so they sit centred on
 * the block's FIRST LINE — or on a code block's language picker, its first
 * row, or on a divider's rule. Read from the DOM: it follows the block's
 * typography, insets and borders without a value written here.
 */
export function firstLineOffset(dom: HTMLElement): number {
  const box = styledBox(dom);
  // A divider has no line of text: its box is the rule itself, a pixel or
  // two tall, and the buttons are centred on it.
  if (box instanceof HTMLHRElement) {
    const rule = box.getBoundingClientRect();
    return Math.round(rule.top - dom.getBoundingClientRect().top + (rule.height - BUTTON_SIZE) / 2);
  }
  const languageTrigger = box.querySelector(".code-block-node-language-trigger");
  if (languageTrigger instanceof HTMLElement) {
    const blockRect = dom.getBoundingClientRect();
    const triggerRect = languageTrigger.getBoundingClientRect();
    return Math.round(triggerRect.top - blockRect.top + (triggerRect.height - BUTTON_SIZE) / 2);
  }
  const style = getComputedStyle(box);
  // Quotes, callouts and other framed blocks carry their own padding or border.
  const inset = parseFloat(style.paddingTop || "0") + parseFloat(style.borderTopWidth || "0");
  // `line-height: normal` cannot be read in pixels: the font height is still
  // much fairer than zero.
  const parsed = parseFloat(style.lineHeight);
  const lineHeight = Number.isFinite(parsed) ? parsed : parseFloat(style.fontSize || "0") * 1.5;
  // The buttons are taller than a line of body text: centred on it, they rise
  // above the block's top, so the offset may be negative.
  return Math.round(inset + (lineHeight - BUTTON_SIZE) / 2);
}

/**
 * Where the comment button of a block sits, from the block's top-left corner:
 * centred on its first line, a little to the right of it — further where the
 * pane leaves the room for it, as the gutter does on the left.
 */
export function commentButtonOffset(dom: HTMLElement): { top: number; left: number } {
  const block = dom.getBoundingClientRect();
  const room = scrollPane(dom).getBoundingClientRect().right - block.right;
  const gap =
    COMMENT_BUTTON_GAP +
    Math.max(0, Math.min(GUTTER_GAP_EXTRA, room - COMMENT_BUTTON_SIZE - COMMENT_BUTTON_GAP - GUTTER_EDGE_MIN));
  return {
    top: Math.round(firstLineOffset(dom) + (BUTTON_SIZE - COMMENT_BUTTON_SIZE) / 2),
    left: Math.round(block.width + Math.floor(gap)),
  };
}
