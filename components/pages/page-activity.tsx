"use client";

// THE ACTIVITY of a page (MIN-278, MIN-282) — who passed, what he did, and
// what was said.
//
// Next to history and not in place: both answer questions
// different, and confusing the two would confuse them both.
//
// • HISTORY (MIN-277) renders the STATES. We go there to read what the page
// said before, and to put it back. He only knows the body.
// • ACTIVITY makes GESTURES. It carries what no state carries: the
// creation, trashing, restoration — and renaming, which
// leaves no version behind.
//
// Hence the rendering by `IssueActivity`, that of a ticket and an objective, and not
// one more list: it's the same table (`issue_events`), so the same
// faces of actors, the same groupings, the same vocabulary — a gesture of
// Numo recognizes himself here as he recognizes himself there.
//
// ─── The PAGE thread lives here (MIN-282) ────────────────────────────────────
//
// A comment that talks about the ENTIRE document is one more gesture on the page,
// in the same way as a renaming or a restoration: it is read in the same
// column, on its date, and `IssueActivity` already mixes messages and events. A
// section under the document would have made the page a discussion thread, this
// that it is not — we open a page to READ it.
//
// What is NOT here: the wires anchored to a block, still alive and open. These
// are read next to their text (components/pages/page-comment-thread.tsx) —
// that's the whole reason for the anchor. A DETACHED thread returns here: its block
// no longer exists, the page no longer has anywhere to show it, and it carries
// the extract that says what it was about. A RESOLVED thread is read here too
// (MIN-1002): the page stopped showing it, and this is where it is reopened.

import { useMemo } from "react";
import { AppIcon } from "@/components/icon";
import { CheckmarkCircle02Icon, LinkOffIcon as Link2Off } from "@hugeicons/core-free-icons";
import { useQuery } from "@tanstack/react-query";
import { RowsSkeleton } from "@/components/loading-skeletons";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

import { fetchPageApi, fetchPageEventsApi } from "@/lib/pages-api";
import { pageKey } from "@/lib/use-pages-query";
import { pageBlockTexts } from "@/lib/pages-mentions";
import { useMembersQuery } from "@/lib/use-members-query";
import { IssueActivity, CommentComposer } from "@/components/issue-timeline";
import type { ActivityItem, ThreadMessage } from "@/components/issue-timeline";
import { usePageComments } from "@/lib/use-page-comments";
import { threadsForActivity, type PageThread } from "@/lib/page-comments";
import { PageThreadResolveButton, type ResolveThread } from "@/components/pages/page-comment-thread";
import type { EventContext } from "@/lib/describe-event";
import { PageBacklinks } from "@/components/pages/page-backlinks";
import {
  PAGE_ACTIVITY_FRESH_MS,
  pageEventsKey,
} from "@/lib/page-activity-cache";
import { useProjectCapabilities } from "@/lib/use-project-capabilities";
import { commentTarget } from "@/lib/comment-focus";

export function PageActivity({
  projectId,
  pageId,
  currentUserId,
  liveBlockIds,
  enabled = true,
}: {
  projectId: string;
  pageId: string;
  currentUserId: string | null;
  /** The blocks of the document on screen, when this panel sits beside its
      editor: a block typed since the last load exists, whatever the cache
      says. Absent: the blocks are read from the loaded page. */
  liveBlockIds?: ReadonlySet<string>;
  /** The panel is closed: nothing to load until you look at it. */
  enabled?: boolean;
}) {
  const t = useTranslations("Pages");
  const { members } = useMembersQuery(projectId, enabled);
  // Project roles (MIN-693): readers comment only with their option.
  const { canWrite, canComment } = useProjectCapabilities(projectId);

  const events = useQuery({
    queryKey: pageEventsKey(pageId),
    queryFn: () => fetchPageEventsApi(projectId, pageId),
    enabled,
    staleTime: PAGE_ACTIVITY_FRESH_MS,
  });

  /**
 * The document blocks, read in the BODY and not in an editor: this
 * tab lives in a panel, it does not mount tiptap. It's the same rule of
 * granularity as everywhere else (`pageBlockTexts`, first level), and the
 * cache is the one that the page has already filled when opening.
 *
 * Without it, any anchored thread would be considered detached here and would be read TWICE —
 * next to its block, and in this column.
 */
  const page = useQuery({
    queryKey: pageKey(pageId),
    queryFn: () => fetchPageApi(projectId, pageId),
    enabled,
  });
  const loadedBlockIds = useMemo(
    () =>
      new Set(
        pageBlockTexts(page.data?.content ?? null)
          .map((block) => block.blockId)
          .filter((id): id is string => !!id)
      ),
    [page.data]
  );
  // An editor that has not mounted its document yet reports no block at all.
  const blockIds = liveBlockIds && liveBlockIds.size > 0 ? liveBlockIds : loadedBlockIds;

  const { threads, edit, remove, add, resolve } = usePageComments({
    projectId,
    pageId,
    blockIds,
  });

  /**
 * What this column shows — two cases, one principle: a thread is displayed
 * here when the PAGE has nowhere else to show it.
 *
 * • the page thread: it does not talk about any block;
 * • a DETACHED thread: its block is gone, and it carries the extract which says of
 * what he was talking about;
 * • a RESOLVED thread: the page stopped showing it.
 *
 * An anchored, living and open thread remains on his text: that is the whole reason for
 * the anchor, and showing it twice would make one doubt that it is the same.
 */
  const shown = useMemo(() => threadsForActivity(threads), [threads]);

  const items = useMemo<ActivityItem[]>(() => {
    const merged: ActivityItem[] = [
      ...(events.data ?? []).map((event) => ({
        kind: "event" as const,
        at: event.created_at,
        event,
      })),
      ...shown.map((thread) => ({
        kind: "comment" as const,
        at: thread.root.created_at,
        comment: thread.root as ThreadMessage,
        replies: thread.replies as ThreadMessage[],
      })),
    ];
    merged.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    return merged;
  }, [events.data, shown]);

  const byId = useMemo(
    () => new Map(shown.map((thread) => [thread.root.id, thread])),
    [shown]
  );

  // A page has no objective, category or ticket to name: only the
  // MEMBERS are used to resolve the actor of each line. The rest of the
  // context is empty rather than absent — `EventContext` is shared with
  // three more surfaces, and filling it with empty lists costs less than one
  // second type to keep in phase.
  const ctx = useMemo<EventContext>(
    () => ({
      members,
      objectives: [],
      categories: [],
      issues: [],
      projectKey: "",
    }),
    [members]
  );

  if (events.isPending) {
    return (
      <RowsSkeleton rows={3} leading="avatar-sm" secondLine className="gap-5 py-4" />
    );
  }
  if (events.error) {
    return (
      <p className="px-1 py-6 text-xs text-muted-foreground">
        {t("activityLoadFailed")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PageBacklinks projectId={projectId} pageId={pageId} />
      <IssueActivity
        items={items}
        ctx={ctx}
        entity="page"
        currentUserId={currentUserId}
        projectId={projectId}
        allowAttachments={false}
        commentHeader={(comment) => {
          const thread = byId.get(comment.id);
          return thread ? (
            <ThreadHeader thread={thread} onResolve={canComment ? resolve : undefined} />
          ) : null;
        }}
        onReply={(parentId, body, mentionedUserIds) =>
          add({ body, parentId, mentionedUserIds })
        }
        onEditComment={edit}
        onDeleteComment={remove}
        // A page thread has no attachment: the hook exists for the
        // shared signature, and is never reachable.
        onDeleteAttachment={async () => {}}
        canComment={canComment}
        canModerate={canWrite}
      />
    </div>
  );
}

/**
 * COMMENT the page — the composer, at the FOOT of the panel and not at the end of the list.
 *
 * It is fixed: you write a comment after having read, therefore after having scrolled, and a field which moves away as you read is a field which must be
 * go search. This is already the rule of a ticket panel, whose
 * composer lives in `SidePanelFooter`.
 *
 * It is mounted NEXT to the list, not in it, and reads the same cache: a single query for both (react-query shares it on `["page-comments",
 * pageId]`), and writing invalidates the key the list is listening to.
 */
export function PageCommentBar({
  projectId,
  pageId,
}: {
  projectId: string;
  pageId: string;
}) {
  const t = useTranslations("Pages");
  const tTimeline = useTranslations("Timeline");
  const { members } = useMembersQuery(projectId, true);
  const { add } = usePageComments({ projectId, pageId, blockIds: NO_BLOCKS });
  // Readers without the comment option (MIN-693) get no composer.
  const { canComment } = useProjectCapabilities(projectId);
  if (!canComment) return null;

  return (
    <CommentComposer
      members={members}
      projectId={projectId}
      allowAttachments={false}
      placeholder={t("commentPagePlaceholder")}
      submitLabel={tTimeline("comment")}
      commentTarget={commentTarget("page", pageId)}
      onSubmit={(body, mentionedUserIds) => add({ body, mentionedUserIds })}
    />
  );
}

/** The composer does not care about anchors: it only writes comments from
 PAGE, and does not read any threads. The empty set avoids remaking a Set
 each rendering for nothing. */
const NO_BLOCKS: ReadonlySet<string> = new Set<string>();

/** The band of a thread: what it speaks of, what its anchor has become, and
    whether it is settled — with the button that settles or reopens it. */
function ThreadHeader({ thread, onResolve }: { thread: PageThread; onResolve?: ResolveThread }) {
  const t = useTranslations("Pages");
  const { root, detached, resolved } = thread;

  return (
    <div className="flex min-w-0 items-start gap-2">
      <div className="min-w-0 flex-1">
        {resolved && (
          <span className="mr-2 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <AppIcon icon={CheckmarkCircle02Icon} className="size-3.5" />
            {t("commentResolved")}
          </span>
        )}
        {/* The thread talks about a text that no one sees anymore: saying it, and showing
            the extract, is the only trace of why the block was removed. */}
        {detached && (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-500">
            <AppIcon icon={Link2Off} className="size-3.5" />
            {t("commentDetached")}
          </span>
        )}
        {/* A thread about a whole block has no passage to show. Once
            detached, saying so is all that is left of what it was about. */}
        {root.block_id && !root.quote && !detached ? null : root.block_id ? (
          <p
            className={cn(
              "border-l-2 border-brand/50 pl-2 text-xs italic text-muted-foreground line-clamp-2",
              (detached || resolved) && "mt-1"
            )}
          >
            {root.quote ?? t("commentOnBlock")}
          </p>
        ) : resolved ? null : (
          <span className="text-xs text-muted-foreground">{t("commentOnPage")}</span>
        )}
      </div>
      {onResolve && (
        <PageThreadResolveButton
          rootId={root.id}
          resolved={resolved}
          onResolve={onResolve}
          className="-my-1.5 -mr-1.5"
        />
      )}
    </div>
  );
}
