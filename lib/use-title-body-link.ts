"use client";

import { useCallback, useRef, type KeyboardEvent, type RefObject } from "react";
import type { Editor } from "@tiptap/core";
import { isImeComposing } from "@/lib/keyboard/ime";
import { planTitleEnter } from "@/lib/keyboard/title-enter";
import { useSendMode } from "@/lib/keyboard/use-send-mode";
import { caretLeft, caretOnLastLine, focusLastLine } from "@/lib/textarea-caret";

/**
 * A TITLE and the DESCRIPTION under it, sewn into one text on the keyboard
 * (MIN-756) — what pages already did for their body (MIN-270), for every
 * surface that stacks the two: creation dialogs, panels, triage, feedback.
 *
 * - ↓ on the title's last folded line lands on the description's first line,
 *   at about the same x; ↑ on that line comes back (title-bridge.ts);
 * - Enter jumps to the description, unless it is the account's send shortcut
 *   on a creation surface (lib/keyboard/title-enter.ts); Shift + Enter always
 *   jumps.
 *
 * ```tsx
 * const link = useTitleBodyLink();
 * <AutoTextarea ref={link.titleRef} onKeyDown={(e) => link.onTitleKeyDown(e, { submit })} />
 * <div ref={link.bodyRef}>
 *   <LazyDocumentEditor onLeaveTop={link.leaveBody} … />
 * </div>
 * ```
 *
 * The body wrapper is how the title finds the editor: the surfaces swap
 * between several editors (preview, live, local) and a lazy fallback, and
 * the wrapper holds whichever is mounted. Only types are imported from
 * tiptap, so the hosting route stays free of the editor chunk.
 */
export function useTitleBodyLink(
  title?: RefObject<HTMLTextAreaElement | null>,
  body?: RefObject<HTMLDivElement | null>,
) {
  const ownTitle = useRef<HTMLTextAreaElement | null>(null);
  const ownBody = useRef<HTMLDivElement | null>(null);
  const titleRef = title ?? ownTitle;
  const bodyRef = body ?? ownBody;
  const mode = useSendMode();

  /** Into the description's first line, at about `x` (its start without
      one). `false` when there is no editable description to enter. */
  const enterBody = useCallback(
    (x?: number) => {
      const editor = editorIn(bodyRef.current);
      if (editor) {
        focusFirstLine(editor, x);
        return true;
      }
      // Another editable surface (no tiptap instance): at least its focus.
      const editable = bodyRef.current?.querySelector<HTMLElement>('[contenteditable="true"]');
      editable?.focus();
      return !!editable;
    },
    [bodyRef]
  );

  /** Back into the title's last line, at about `x` (its end without one). */
  const leaveBody = useCallback(
    (x?: number) => {
      const field = titleRef.current;
      if (field) focusLastLine(field, x);
    },
    [titleRef]
  );

  /**
   * The title's keys. `submit` is the creation of the surface; edit surfaces
   * leave it out. Returns whether the key was handled.
   */
  const onTitleKeyDown = useCallback(
    (
      event: KeyboardEvent<HTMLTextAreaElement>,
      options: { submit?: () => void; mobile?: boolean } = {}
    ) => {
      // Enter and ↓ belong to an IME while it composes (MIN-706).
      if (event.defaultPrevented || isImeComposing(event)) return false;
      const field = event.currentTarget;
      if (event.key === "ArrowDown") {
        if (event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) return false;
        if (!caretOnLastLine(field)) return false;
        if (!enterBody(caretLeft(field))) return false;
        event.preventDefault();
        return true;
      }
      const plan = planTitleEnter(
        {
          key: event.key,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
        },
        { mode, canSubmit: !!options.submit, mobile: options.mobile }
      );
      if (plan === "ignore") return false;
      event.preventDefault();
      if (plan === "submit") options.submit?.();
      // No description to enter (another tab, read-only): the title is done.
      else if (plan === "blur" || !enterBody()) field.blur();
      return true;
    },
    [enterBody, mode]
  );

  return { titleRef, bodyRef, enterBody, leaveBody, onTitleKeyDown };
}

/** The editable tiptap editor mounted under `root` — tiptap hangs the
    instance on its view's DOM. */
function editorIn(root: HTMLElement | null): Editor | null {
  const dom = root?.querySelector<HTMLElement & { editor?: Editor }>(".ProseMirror");
  const editor = dom?.editor;
  return editor && !editor.isDestroyed && editor.isEditable ? editor : null;
}

/**
 * Focus the editor on its first line, at about `x`. The first line is the
 * first textblock's; the caret goes to its start and the line scrolls into
 * view first, since the x is only readable on a visible line.
 *
 * Synchronous on purpose, unlike tiptap's `focus` command, which focuses on
 * the next frame: a key typed right after ↓ or Enter would still land in the
 * title.
 */
export function focusFirstLine(editor: Editor, x?: number) {
  let start = -1;
  let end = -1;
  editor.state.doc.descendants((node, pos) => {
    if (start >= 0) return false;
    if (!node.isTextblock) return true;
    start = pos + 1;
    end = start + node.content.size;
    return false;
  });
  if (start < 0) {
    editor.commands.focus("start");
    return;
  }
  editor.chain().setTextSelection(start).scrollIntoView().run();
  editor.view.focus();
  if (x === undefined) return;
  const { view } = editor;
  const line = view.coordsAtPos(start);
  const hit = view.posAtCoords({ left: x, top: (line.top + line.bottom) / 2 });
  if (hit && hit.pos > start && hit.pos <= end) editor.commands.setTextSelection(hit.pos);
}
