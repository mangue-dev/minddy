"use client";

// The threads of a page in its RIGHT MARGIN (MIN-1002).
//
// Where the pane leaves room beside the text, every open thread is a card
// level with the block it is about, always visible: the discussion is read
// while reading the page, without opening anything. A click on a card, or in
// its passage, opens it in place — its reply field, the field of a new
// comment — and its passage is emphasized, as under the popover it replaces.
//
// The cards live in the editor's own box and scroll with the document. Their
// places are computed in lib/page-comment-margin.ts and written straight to
// the elements, after every change of the document or of a card's size: a
// state per card would render the whole margin on each keystroke.

import { useCallback, useEffect, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import type { Editor } from "@tiptap/core";

import {
  BlockThreads,
  NewThreadComposer,
  OPEN_THREAD_LAYER,
  blockElement,
  keepsThreadOpen,
  startsNewThread,
  threadAnchorRect,
  useCloseWhenEmptied,
  type BlockCommentTarget,
  type ThreadActions,
} from "@/components/pages/page-comment-thread";
import { MARGIN_LANE, layoutMarginCards, type MarginCardBox } from "@/lib/page-comment-margin";
import type { PageThread } from "@/lib/page-comments";
import { useProjectCapabilities } from "@/lib/use-project-capabilities";
import { cn } from "@/lib/utils";

const CARD_ATTR = "data-comment-card";

export interface MarginThreadGroup {
  blockId: string;
  threads: PageThread[];
}

export function PageCommentMargin({
  editor,
  root,
  width,
  groups,
  target,
  onOpen,
  onHover,
  highlighted,
  onClose,
  ...actions
}: ThreadActions & {
  editor: Editor;
  /** The editor's box (`.page-editor`): the cards are placed against it. */
  root: HTMLElement;
  /** The width the pane leaves for a card (lib/page-comment-margin.ts). */
  width: number;
  /** The blocks that carry open threads. */
  groups: MarginThreadGroup[];
  /** The card that is open, and the passage of a comment being written. */
  target: BlockCommentTarget | null;
  onOpen: (blockId: string) => void;
  /** The card under the pointer, for the page to show what it is about. */
  onHover: (blockId: string | null) => void;
  /** The block whose passage is under the pointer in the text: its card
      looks as it does under the pointer itself. */
  highlighted: string | null;
  onClose: () => void;
}) {
  const t = useTranslations("Pages");
  const container = useRef<HTMLDivElement>(null);
  const activeId = target?.blockId ?? null;
  // A first comment on a block is a card too, before any thread exists.
  const cards =
    target && !groups.some((group) => group.blockId === target.blockId)
      ? [...groups, { blockId: target.blockId, threads: [] }]
      : groups;

  const state = useRef({ editor, root, activeId });
  useEffect(() => {
    state.current = { editor, root, activeId };
  });

  /* ── Placement ───────────────────────────────────────────────────────── */
  const place = useCallback(() => {
    const { editor: current, root: box, activeId: active } = state.current;
    const host = container.current;
    const frame = host?.offsetParent;
    if (!host || !(frame instanceof HTMLElement) || current.isDestroyed) return;
    const origin = frame.getBoundingClientRect();
    // Positions are relative to the frame's content, scrolled or not.
    const dy = origin.top + frame.clientTop - frame.scrollTop;
    const dx = origin.left + frame.clientLeft - frame.scrollLeft;
    host.style.left = `${Math.round(box.getBoundingClientRect().right - dx + MARGIN_LANE)}px`;

    const elements = [...host.querySelectorAll<HTMLElement>(`[${CARD_ATTR}]`)];
    const boxes: MarginCardBox[] = [];
    for (const element of elements) {
      const id = element.getAttribute(CARD_ATTR) as string;
      const block = blockElement(current, id);
      // A block that just left the page: its card goes with the next render.
      element.hidden = !block;
      if (!block) continue;
      // The open card stands beside its passage, the others beside the
      // first line of their block.
      const at = id === active ? threadAnchorRect(block) : block.getBoundingClientRect();
      boxes.push({ id, top: at.top - dy, height: element.offsetHeight });
      const body = element.firstElementChild;
      if (body) element.toggleAttribute("data-clipped", body.scrollHeight > body.clientHeight + 1);
    }
    // Cards stay beside the body: never over the title above it.
    const tops = layoutMarginCards(boxes, active, box.getBoundingClientRect().top - dy);
    for (const element of elements) {
      const top = tops.get(element.getAttribute(CARD_ATTR) as string);
      if (top !== undefined) element.style.top = `${Math.round(top)}px`;
    }
    // The first placement is not a move: cards glide only afterwards.
    host.dataset.placed = "";
  }, []);

  // After every render, and whenever something that moves a block or a card
  // changes: the document, the editor's box, a card's own height.
  useLayoutEffect(place);
  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; place(); });
    };
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
    observer?.observe(root);
    for (const card of container.current?.querySelectorAll(`[${CARD_ATTR}]`) ?? []) observer?.observe(card);
    editor.on("transaction", schedule);
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer?.disconnect();
      editor.off("transaction", schedule);
      window.removeEventListener("resize", schedule);
    };
    // The observed cards are those of this render.
  }, [editor, root, place, cards.length, activeId]);

  /* ── Closing the open card ───────────────────────────────────────────── */
  useEffect(() => {
    if (!activeId) return;
    const card = () => container.current?.querySelector<HTMLElement>(`[${CARD_ATTR}="${CSS.escape(activeId)}"]`) ?? null;
    const onPointerDown = (event: PointerEvent) => {
      const open = card();
      if (event.target instanceof Node && open?.contains(event.target)) return;
      if (keepsThreadOpen(event.target, activeId, open)) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      // A menu or a confirmation opened from the card closes first.
      if (event.key !== "Escape" || event.defaultPrevented || document.querySelector(OPEN_THREAD_LAYER)) return;
      // This Escape closes the card and nothing else: in the page it would
      // also select the block the caret is in.
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [activeId, onClose]);

  // The pointer enters and leaves cards, never the gaps between them: one
  // pair of handlers on the margin reads which card it is over.
  const hovered = useRef<string | null>(null);
  const hover = (event: ReactPointerEvent) => {
    const id =
      event.type === "pointerleave" || !(event.target instanceof Element)
        ? null
        : event.target.closest(`[${CARD_ATTR}]`)?.getAttribute(CARD_ATTR) ?? null;
    if (id === hovered.current) return;
    hovered.current = id;
    onHover(id);
  };
  // A margin that goes away takes the pointer's card with it.
  useEffect(() => () => onHover(null), [onHover]);

  return createPortal(
    <div
      ref={container}
      onPointerOver={hover}
      onPointerLeave={hover}
      role="complementary"
      aria-label={t("comments")}
      data-page-comment-margin=""
      className="page-comment-margin"
      style={{ width }}
    >
      {cards.map(({ blockId, threads }) =>
        target && blockId === target.blockId ? (
          <OpenCard
            key={blockId}
            editor={editor}
            target={target}
            threads={threads}
            onClose={onClose}
            {...actions}
          />
        ) : (
          <div
            key={blockId}
            {...{ [CARD_ATTR]: blockId }}
            data-highlighted={highlighted === blockId ? "" : undefined}
            className="page-comment-card cursor-pointer rounded-xl transition-colors hover:bg-control/60 data-highlighted:bg-control/60"
            // A press on the card opens it. Not the "⋯" button: it only shows
            // its menu, whose actions then open the card they act on.
            onClick={(event) => {
              const pressed = event.target instanceof Element ? event.target : null;
              if (pressed && event.currentTarget.contains(pressed) && pressed.closest("button")) return;
              onOpen(blockId);
            }}
          >
            <div className="page-comment-card-preview">
              <BlockThreads editor={editor} blockId={blockId} threads={threads} compact namesBlock={false} preview {...actions} />
            </div>
          </div>
        )
      )}
    </div>,
    root
  );
}

/** The card that is open: its threads with their reply fields, and the field
    of a new comment when that is what it was opened for. */
function OpenCard({
  editor,
  target,
  threads,
  onClose,
  ...actions
}: ThreadActions & {
  editor: Editor;
  target: BlockCommentTarget;
  threads: PageThread[];
  onClose: () => void;
}) {
  const { canComment } = useProjectCapabilities(actions.projectId);
  useCloseWhenEmptied(target, threads.length, onClose);
  const fresh = startsNewThread(target, threads);
  return (
    <div
      {...{ [CARD_ATTR]: target.blockId }}
      data-active=""
      className="page-comment-card z-10 rounded-xl bg-popover text-popover-foreground shadow-md ring-1 ring-border"
    >
      <div className="overflow-hidden rounded-xl">
        <BlockThreads
          editor={editor}
          blockId={target.blockId}
          threads={threads}
          compact
          namesBlock={false}
          onBlockGone={onClose}
          {...actions}
        />
        {fresh && canComment && (
          <div className={cn("p-2", threads.length > 0 && "border-t border-border/60")}>
            <NewThreadComposer
              target={target}
              members={actions.members}
              projectId={actions.projectId}
              onAdd={actions.onAdd}
              onDone={onClose}
            />
          </div>
        )}
      </div>
    </div>
  );
}
