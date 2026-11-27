"use client";

// The thread of a BLOCK (MIN-282, MIN-1002): its discussions and their
// replies, and the field to write a new one.
//
// On a desktop it is a POPOVER under the passage it is about, without a title
// bar or a backdrop: the page stays readable and editable around it, and the
// passage stays tinted while the thread is open (block-comments.ts). The
// popover primitive places it and follows the passage as the page scrolls or
// changes; nothing is measured here beyond the passage's own box.
//
// Where the pane leaves room beside the text, the same threads are cards in
// the right margin instead (components/pages/page-comment-margin.tsx), built
// from the pieces this module exports.
//
// On a phone there is no room beside the keyboard: the thread is the shared
// bottom sheet (the `Dialog` primitive swaps itself in the mobile layout),
// which covers the page and therefore says which passage it is about.
//
// The PAGE thread has no text to be alongside — it lives in the activity of
// history (components/pages/page-activity.tsx), with the resolved threads.

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { Editor } from "@tiptap/core";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { MobileSheetScrollArea } from "@/components/ui/mobile-sheet";
import { Spinner } from "@/components/ui/spinner";
import { keepOverlayOpenForPopper } from "@/lib/overlay-dismiss";
import {
  CommentBlock,
  CommentComposer,
  CommentPermissionsProvider,
  ReplyComposer,
  type CommentMenuAction,
} from "@/components/issue-timeline";
import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { useProjectCapabilities } from "@/lib/use-project-capabilities";
import { posOfBlockId } from "@/components/pages/block-actions";
import { BLOCK_ATTR, COMMENTED_PASSAGE_CLASS, openPassages } from "@/components/pages/block-comments";
import type { DocumentEditorMentions } from "@/components/editor/document-editor";
import { pageCommentQuoteInBlock } from "@/lib/page-comment-highlights";
import type { PageThread } from "@/lib/page-comments";
import { useDescriptionMentions } from "@/lib/use-mention-sources";
import { useMobileLayout } from "@/lib/use-mobile-layout";
import type { Member } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface BlockCommentTarget {
  blockId: string;
  /** The extract, when the thread opens on a selection that we have just made. */
  quote?: string;
  /** Start a separate thread even if the block already has discussions. */
  startNew?: boolean;
}

export type AddComment = (input: {
  body: string;
  mentionedUserIds: string[];
  blockId?: string | null;
  quote?: string | null;
  parentId?: string | null;
}) => Promise<void>;

export type ResolveThread = (rootId: string, resolved: boolean) => Promise<void>;

/** What every surface of a block's threads needs to read and write them. */
export interface ThreadActions {
  members: Member[];
  currentUserId: string | null;
  projectId: string;
  onAdd: AddComment;
  onEdit: (commentId: string, body: string) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
  onResolve: ResolveThread;
}

/** The popover's distance to the passage it is about. */
const THREAD_GAP = 6;

/** Surfaces a thread opens above itself: a click there is not a click outside. */
const THREAD_LAYER =
  '[role="menu"],[role="listbox"],[role="dialog"],[role="alertdialog"],[data-radix-popper-content-wrapper],[data-floating-surface]';
/** A menu or a confirmation the thread opened: the next click dismisses it. */
export const OPEN_THREAD_LAYER =
  '[role="menu"][data-state="open"],[role="listbox"][data-state="open"],[data-slot="alert-dialog-content"][data-state="open"],[data-slot="dialog-content"][data-state="open"]';

/** The block's element in the page, while it exists. */
export function blockElement(editor: Editor | null, blockId: string): HTMLElement | null {
  if (!editor || editor.isDestroyed) return null;
  const pos = posOfBlockId(editor, blockId);
  const dom = pos === null ? null : editor.view.nodeDOM(pos);
  return dom instanceof HTMLElement ? dom : null;
}

/**
 * What the popover stands under: the emphasized passages of the block, taken
 * together, or the whole block when the thread quotes nothing that still
 * reads in it.
 */
export function threadAnchorRect(block: HTMLElement): DOMRect {
  const passages = openPassages(block).map((passage) => passage.getBoundingClientRect());
  if (passages.length === 0) return block.getBoundingClientRect();
  const left = Math.min(...passages.map((rect) => rect.left));
  const top = Math.min(...passages.map((rect) => rect.top));
  const right = Math.max(...passages.map((rect) => rect.right));
  const bottom = Math.max(...passages.map((rect) => rect.bottom));
  return new DOMRect(left, top, right - left, bottom - top);
}

/** Text typed in the thread and not sent: a reply, a new comment, an edit. */
function hasUnsentText(surface: HTMLElement | null): boolean {
  return [...(surface?.querySelectorAll('[contenteditable="true"]') ?? [])].some(
    (field) => !!field.textContent?.trim()
  );
}

/**
 * Whether a press outside a thread's surface leaves the thread open: it
 * landed in a menu, a mention list or a confirmation the thread opened, on
 * this block's badge (which closes the thread itself) or in one of its
 * passages (which keeps it open, block-comments.ts), or the thread holds text
 * that was not sent — a stray click does not throw it away, Escape closes.
 */
export function keepsThreadOpen(origin: EventTarget | null, blockId: string, surface: HTMLElement | null): boolean {
  const element = origin instanceof Element ? origin : null;
  const ownBlock = element?.closest(`[${BLOCK_ATTR}="${CSS.escape(blockId)}"]`);
  return (
    !!element?.closest(THREAD_LAYER) ||
    !!document.querySelector(OPEN_THREAD_LAYER) ||
    (!!ownBlock && !!element?.closest(`.page-block-comment-badge, .${COMMENTED_PASSAGE_CLASS}`)) ||
    hasUnsentText(surface)
  );
}

/**
 * Resolve a thread, or reopen it: the button of a pull request thread
 * (components/forge-comment-thread.tsx), for a page.
 */
export function PageThreadResolveButton({
  rootId,
  resolved,
  onResolve,
  className,
}: {
  rootId: string;
  resolved: boolean;
  onResolve: ResolveThread;
  className?: string;
}) {
  const t = useTranslations("Pages");
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn("shrink-0 rounded-full", className)}
      disabled={pending}
      onClick={() => {
        setPending(true);
        void onResolve(rootId, !resolved)
          .catch((error: Error) => toast.error(error.message))
          .finally(() => setPending(false));
      }}
    >
      {pending && <Spinner />}
      {resolved ? t("reopenThread") : t("resolveThread")}
    </Button>
  );
}

/**
 * The quotes of these threads that still read in their block: the page shows
 * those itself, tinted, so a thread beside the page does not repeat them.
 * `onGone` runs when the block leaves the document (⌘Z, a teammate): its
 * threads are not lost — they return to the activity, marked detached — but a
 * surface opened on the block has nothing left to be about.
 */
function useQuotesOnPage(
  editor: Editor | null,
  blockId: string,
  threads: PageThread[],
  onGone?: () => void
): ReadonlySet<string> {
  const [shown, setShown] = useState("");
  const quotes = useMemo(
    () => threads.map((thread) => thread.root.quote?.trim() ?? "").filter(Boolean),
    [threads]
  );
  useEffect(() => {
    if (!editor) return;
    const check = () => {
      if (editor.isDestroyed) return;
      const pos = posOfBlockId(editor, blockId);
      if (pos === null) return onGone?.();
      const block = editor.state.doc.nodeAt(pos);
      setShown(JSON.stringify(quotes.filter((quote) => block && pageCommentQuoteInBlock(block, quote))));
    };
    check();
    editor.on("transaction", check);
    return () => {
      editor.off("transaction", check);
    };
  }, [editor, blockId, quotes, onGone]);
  return useMemo(() => new Set<string>(shown ? (JSON.parse(shown) as string[]) : []), [shown]);
}

/**
 * The threads of one block, one under the other.
 *
 * `compact` is the layout beside the page (popover, margin card): messages
 * stacked, and a thread names its passage only when the page cannot — the
 * text was rewritten, or the block has several threads. `preview` shows the
 * threads without their reply field, for a margin card that is not open.
 */
export function BlockThreads({
  editor,
  blockId,
  threads,
  compact,
  preview = false,
  namesBlock = true,
  onBlockGone,
  ...actions
}: ThreadActions & {
  editor: Editor | null;
  blockId: string;
  threads: PageThread[];
  compact: boolean;
  preview?: boolean;
  /** Whether a thread that quotes no passage says it is about its block. A
      margin card stands beside that block and does not. */
  namesBlock?: boolean;
  onBlockGone?: () => void;
}) {
  const mentions = useDescriptionMentions(actions.projectId, actions.members);
  // Project roles (MIN-693): readers without the comment option only read.
  const { canWrite, canComment } = useProjectCapabilities(actions.projectId);
  const onPage = useQuotesOnPage(editor, blockId, threads, onBlockGone);
  return (
    <CommentPermissionsProvider canComment={canComment} canModerate={canWrite}>
      {threads.map((thread) => (
        <ThreadPanel
          key={thread.root.id}
          thread={thread}
          showQuote={
            (namesBlock || !!thread.root.quote) &&
            (!compact ||
              threads.length > 1 ||
              (!!thread.root.quote && !onPage.has(thread.root.quote.trim())))
          }
          compact={compact}
          mentions={mentions}
          canReply={canComment && !preview}
          canResolve={canComment}
          {...actions}
        />
      ))}
    </CommentPermissionsProvider>
  );
}

/** The field that starts a thread on a block, or on one of its passages. */
export function NewThreadComposer({
  target,
  members,
  projectId,
  onAdd,
  onDone,
}: Pick<ThreadActions, "members" | "projectId" | "onAdd"> & {
  target: BlockCommentTarget;
  onDone: () => void;
}) {
  const tTimeline = useTranslations("Timeline");
  return (
    <CommentComposer
      members={members}
      projectId={projectId}
      allowAttachments={false}
      autoFocus
      submitLabel={tTimeline("comment")}
      onSubmit={async (body, mentionedUserIds) => {
        await onAdd({
          body,
          mentionedUserIds,
          blockId: target.blockId,
          quote: target.quote ?? null,
        });
        onDone();
      }}
    />
  );
}

/**
 * Whether a surface opened on a block starts with the new-comment field: a
 * passage was just selected, the block menu asked for a comment, or the block
 * has no thread yet. Otherwise it opens on the threads.
 */
export function startsNewThread(target: BlockCommentTarget, threads: PageThread[]): boolean {
  return !!target.startNew || !!target.quote || threads.length === 0;
}

/**
 * The last thread of the block was just deleted or resolved: there is nothing
 * left to read, and an empty field in its place would look like a new comment
 * nobody asked to write.
 */
export function useCloseWhenEmptied(target: BlockCommentTarget, count: number, onClose: () => void) {
  const hadThreads = useRef(count > 0);
  useEffect(() => {
    if (hadThreads.current && count === 0 && !target.startNew && !target.quote) onClose();
    hadThreads.current = count > 0;
  }, [count, target.startNew, target.quote, onClose]);
}

export function PageCommentThread({
  editor,
  target,
  threads,
  onClose,
  ...actions
}: ThreadActions & {
  editor: Editor | null;
  /** The block the thread opens on, and the passage of a comment being written. */
  target: BlockCommentTarget;
  /** The threads of this block — empty when its first comment is being written. */
  threads: PageThread[];
  onClose: () => void;
}) {
  const t = useTranslations("Pages");
  const mobile = useMobileLayout() === true;
  const { canComment } = useProjectCapabilities(actions.projectId);
  const surface = useRef<HTMLDivElement>(null);

  useCloseWhenEmptied(target, threads.length, onClose);
  const fresh = startsNewThread(target, threads);

  // The popover's reference: measured by the primitive on every frame it is
  // open, so it follows the passage without a listener of ours. A block that
  // just left the page keeps its last box until the thread closes.
  const lastRect = useRef(new DOMRect());
  const latest = useRef({ editor, blockId: target.blockId });
  useEffect(() => {
    latest.current = { editor, blockId: target.blockId };
  });
  const anchor = useRef({
    getBoundingClientRect: () => {
      const block = blockElement(latest.current.editor, latest.current.blockId);
      if (block) lastRect.current = threadAnchorRect(block);
      return lastRect.current;
    },
    // Where the popover looks for the pane that clips the passage.
    get contextElement() {
      return blockElement(latest.current.editor, latest.current.blockId) ?? undefined;
    },
  });

  const threadList = (compact: boolean) => (
    <BlockThreads
      editor={editor}
      blockId={target.blockId}
      threads={threads}
      compact={compact}
      onBlockGone={onClose}
      {...actions}
    />
  );
  const composer = (
    <NewThreadComposer
      target={target}
      members={actions.members}
      projectId={actions.projectId}
      onAdd={actions.onAdd}
      onDone={onClose}
    />
  );

  if (mobile) {
    return (
      <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent
          className="flex max-h-[min(85dvh,40rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
          // The “⋯” menu of a comment and its confirmation live above it.
          onInteractOutside={keepOverlayOpenForPopper}
        >
          <DialogHeader className="shrink-0 border-b border-border/60 px-4 py-3">
            <DialogTitle className="text-base">
              {fresh ? t("commentOnSelection") : t("comments")}
            </DialogTitle>
            <DialogDescription className="sr-only">{t("commentOnBlock")}</DialogDescription>
          </DialogHeader>

          <MobileSheetScrollArea className="min-h-0 flex-1 overflow-y-auto scrollbar-quiet">
            {/* Keep the frozen extract visible while composing a new selection thread. */}
            {fresh && target.quote ? <Quote className="mx-4 mt-4 line-clamp-4">{target.quote}</Quote> : null}
            {threadList(false)}
          </MobileSheetScrollArea>

          {fresh && canComment && (
            <div data-keyboard-dock className="relative shrink-0 border-t border-border/60 p-4">
              {composer}
            </div>
          )}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Popover open onOpenChange={(open) => { if (!open) onClose(); }}>
      <PopoverAnchor virtualRef={anchor} />
      <PopoverContent
        ref={surface}
        side="bottom"
        align="start"
        sideOffset={THREAD_GAP}
        // The page scrolls in a pane of its own and changes under the thread
        // (typing, a teammate): the passage is read again on every frame.
        updatePositionStrategy="always"
        hideWhenDetached
        aria-label={t("comments")}
        data-page-comment-thread=""
        className="w-88 max-w-[calc(100vw-1.25rem)] min-w-0 gap-0 overflow-hidden rounded-xl p-0 data-[side=bottom]:max-h-(--radix-popover-content-available-height) data-[side=top]:max-h-(--radix-popover-content-available-height)"
        // Reading a thread leaves the caret in the page; a new comment's field
        // takes the focus itself. Closing returns nothing: there is no trigger.
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => {
          if (keepsThreadOpen(event.detail.originalEvent.target, target.blockId, surface.current)) {
            event.preventDefault();
          }
        }}
      >
        <div className="flex max-h-[min(70dvh,32rem)] min-h-0 flex-col overflow-y-auto scrollbar-quiet">
          {threadList(true)}
          {fresh && canComment && (
            <div className={cn("p-2", threads.length > 0 && "border-t border-border/60")}>{composer}</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** The passage a thread was written about, as it read then. */
function Quote({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <p className={cn("border-l-2 border-(--page-ink-amber) pl-2 text-sm text-muted-foreground", className)}>
      {children}
    </p>
  );
}

function ThreadPanel({
  thread,
  showQuote,
  compact,
  members,
  currentUserId,
  projectId,
  mentions,
  canReply,
  canResolve,
  onAdd,
  onEdit,
  onDelete,
  onResolve,
}: ThreadActions & {
  thread: PageThread;
  showQuote: boolean;
  /** The layout beside the page: messages stacked, one rule above the reply field. */
  compact: boolean;
  mentions: DocumentEditorMentions;
  canReply: boolean;
  canResolve: boolean;
}) {
  const t = useTranslations("Pages");
  const { root, replies } = thread;
  const ctx = { members };
  // Settling the thread is offered on each of its messages: the menu also
  // opens on a right-click, wherever in the thread that lands.
  const menuActions = useMemo<CommentMenuAction[] | undefined>(
    () =>
      canResolve && !root.delivery
        ? [
            {
              label: thread.resolved ? t("reopenThread") : t("resolveThread"),
              icon: CheckmarkCircle02Icon,
              onSelect: () => {
                void onResolve(root.id, !thread.resolved).catch((error: Error) => toast.error(error.message));
              },
            },
          ]
        : undefined,
    [canResolve, root.delivery, root.id, thread.resolved, onResolve, t]
  );
  // The compact inset is the reply field's own, so every avatar lines up.
  const inset = compact ? "px-3.5" : "px-4";

  return (
    <div className="border-b border-border/60 last:border-b-0">
      {/* The extract from the thread, as it read when we wrote it: the block could
          be rewritten since, and that's precisely what we want to see. */}
      {showQuote ? (
        <Quote className={cn(compact ? "mx-3.5 mt-3 line-clamp-2" : "mx-4 mt-4 line-clamp-3")}>
          {root.quote ?? t("commentOnBlock")}
        </Quote>
      ) : null}

      <div className={cn(inset, "py-3")}>
        <CommentBlock
          comment={root}
          ctx={ctx}
          mentions={mentions}
          currentUserId={currentUserId}
          onEdit={onEdit}
          onDelete={onDelete}
          onDeleteAttachment={noAttachments}
          deletesReplies={replies.length > 0}
          liveTable="page_comments"
          menuActions={menuActions}
          contextMenu
        />
      </div>
      {replies.map((reply) => (
        <div key={reply.id} className={cn(inset, compact ? "pb-3" : "border-t border-border/60 py-3")}>
          <CommentBlock
            comment={reply}
            ctx={ctx}
            mentions={mentions}
            currentUserId={currentUserId}
            onEdit={onEdit}
            onDelete={onDelete}
            onDeleteAttachment={noAttachments}
            deletesReplies={false}
            liveTable="page_comments"
            menuActions={menuActions}
            contextMenu
            isReply
          />
        </div>
      ))}
      {!root.delivery && canReply && (
        <div className="border-t border-border/60">
          <ReplyComposer
            members={members}
            mentions={mentions}
            currentUserId={currentUserId}
            projectId={projectId}
            rootId={root.id}
            allowAttachments={false}
            // Settling the thread sits beside answering it, as on a pull request.
            actions={<PageThreadResolveButton rootId={root.id} resolved={thread.resolved} onResolve={onResolve} />}
            onReply={(parentId, body, mentionedUserIds) =>
              onAdd({ body, mentionedUserIds, parentId })
            }
          />
        </div>
      )}
    </div>
  );
}

/** A page thread has no attachment (see `allowAttachments`): the
    hook exists for the shared signature, and is never called. */
const noAttachments = async () => {};
