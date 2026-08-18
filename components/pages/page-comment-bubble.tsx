"use client";

// The “Comment” bubble (MIN-282) — the gesture that anchors a discussion to a block.
//
// We select some text, a bubble appears above, we click: the thread
// opens NEXT to the block (page-comment-popover.tsx), anchored to it, with
// the selected extract frozen in it. This is what makes rereading useful — “that sentence” — and it’s
// the only thing that a page thread without an anchor would not be able to say.
//
// ─── Three mechanical choices ─────────────────────── ────────────────────────
//
// • `position: fixed` and SCREEN coordinates (`coordsAtPos`), rather than a
// positioned parent. The column of the document already bears the reservation of
// gutter and positioning of the block chrome (see page-view.tsx); y
// adding an anchor for this bubble would require lowering it
// in the editor, which deliberately has neither `relative` nor indent.
// • `onMouseDown` with `preventDefault`, and not `onClick`: click a button
// outside the editable area erases the selection BEFORE the click, therefore the gesture
//    perdrait exactement ce qu'il vient chercher.
// • The anchor is the FIRST LEVEL block which contains the start of the
// selection — the same granularity as the handle, block link and
// the merger of MIN-271. A selection straddling two blocks is therefore anchored to the
// first: it is from him that the sentence we are commenting on comes from.

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { Editor } from "@tiptap/core";
import { MessageSquarePlus } from "lucide-react";
import { cn } from "mangue-ui";

import { PAGE_BLOCK_ID_ATTRIBUTE } from "@/lib/pages-mentions";
import { MAX_QUOTE_LENGTH } from "@/lib/page-comments";

/** What clicking on the bubble does: where to anchor, and what we're talking about. */
export interface PageCommentAnchor {
  blockId: string;
  quote: string;
}

/** The first level block that contains this position, and its id. */
function anchorBlockId(editor: Editor, pos: number): string | null {
  const resolved = editor.state.doc.resolve(pos);
  // `depth >= 1`: node of depth 1 is the first level block. A
  // selection in a bullet therefore goes back to the list, like everywhere else.
  const node = resolved.depth >= 1 ? resolved.node(1) : null;
  const id = node?.attrs?.[PAGE_BLOCK_ID_ATTRIBUTE];
  return typeof id === "string" && id ? id : null;
}

interface BubbleState {
  top: number;
  left: number;
  anchor: PageCommentAnchor;
}

/** Reserved height above the selection — the bubble must not cover
 the line we are talking about. */
const OFFSET = 8;

export function PageCommentBubble({
  editor,
  onComment,
}: {
  editor: Editor | null;
  onComment: (anchor: PageCommentAnchor) => void;
}) {
  const t = useTranslations("Pages");
  const [state, setState] = useState<BubbleState | null>(null);

  const measure = useCallback(() => {
    if (!editor || editor.isDestroyed || !editor.isEditable) {
      setState(null);
      return;
    }
    const { from, to, empty } = editor.state.selection;
    if (empty) {
      setState(null);
      return;
    }
    const quote = editor.state.doc.textBetween(from, to, " ").trim();
    const blockId = anchorBlockId(editor, from);
    // A selection of entire blocks (slipped into the gutter) has no
    // text: there would be nothing to quote, and the gesture belongs to the menu ⋯.
    if (!blockId || !quote) {
      setState(null);
      return;
    }
    const start = editor.view.coordsAtPos(from);
    const end = editor.view.coordsAtPos(to);
    setState({
      top: Math.min(start.top, end.top) - OFFSET,
      left: (start.left + end.left) / 2,
      anchor: { blockId, quote: quote.slice(0, MAX_QUOTE_LENGTH) },
    });
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    editor.on("selectionUpdate", measure);
    editor.on("transaction", measure);
    // The document scrolls under the bubble: it is in screen coordinates, so
    // she must remeasure herself. `capture` — the scrolling container is a div,
    // and an element's scroll event doesn't move up.
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      editor.off("selectionUpdate", measure);
      editor.off("transaction", measure);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [editor, measure]);

  if (!state) return null;

  return (
    <button
      type="button"
      // See the header: the selection dies before the click without this
      // `preventDefault`, and she's the one we're looking for.
      onMouseDown={(event) => {
        event.preventDefault();
        onComment(state.anchor);
        setState(null);
      }}
      style={{ top: state.top, left: state.left }}
      className={cn(
        "fixed z-50 -translate-x-1/2 -translate-y-full",
        "flex items-center gap-1.5 rounded-full border border-border bg-popover",
        "px-2.5 py-1 text-xs font-medium text-foreground shadow-md",
        "transition-colors hover:bg-control"
      )}
    >
      <MessageSquarePlus className="size-3.5 text-muted-foreground" />
      {t("commentSelection")}
    </button>
  );
}
