"use client";

// An open PAGE (MIN-270): its header, its body, and what links them to the
// base.
//
// This component is reassembled at each page change (`key={pageId}` at its
// appellant). This is intentional: tiptap does not reread its `content` after editing,
// and a page whose body changed under the editor would not be able to keep the
// cursor nor the undo stack anyway.
//
// The BACKUP is VERSIONED (MIN-271): each body writing says on
// which `version` it relies on, the server refuses if the page has moved, and the
// refusal is resolved by a block-by-block merger rather than by a choice. All
// this mechanism lives in `usePageAutosave` — here we just plug it in,
// display it (the recording status, the conflict banner) and give it
// the editor, the only surface capable of adopting a merged document.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Spinner,
  cn,
  toast,
} from "mangue-ui";
import {
  Check,
  MessageSquare,
  MoreHorizontal,
  TriangleAlert,
} from "lucide-react";
import type { Editor, JSONContent } from "@tiptap/react";

import { eventKey } from "@/lib/keyboard/event-key";
import { matchesModShiftCombo } from "@/lib/keyboard/mod-combo";

import {
  discardPageOnUnload,
  fetchPageApi,
  updatePageOnUnload,
} from "@/lib/pages-api";
import {
  cancelDraftDiscard,
  forgetDraftPage,
  isDraftPage,
  markDraftPage,
  scheduleDraftDiscard,
} from "@/lib/pages-draft";
import { ancestorsOf, descendantIds } from "@/lib/pages";
import { pageKey, usePagesQuery } from "@/lib/use-pages-query";
import { useMembersQuery } from "@/lib/use-members-query";
import { useAuth } from "@/lib/auth-context";
import { displayName } from "@/lib/display-name";
import { useRuntimeConfig } from "@/lib/runtime-config-provider";
import { useDescriptionMentions } from "@/lib/use-mention-sources";
import { PageEditor } from "@/components/pages/page-editor";
import { usePageUploads } from "@/components/pages/page-uploads";
import {
  focusDocumentStart,
  posOfBlockId,
  revealBlock,
} from "@/components/pages/block-actions";
import { PageHeader } from "@/components/pages/page-header";
import { IssueActionsMenu } from "@/components/issue-context-menu";
import {
  usePageDocumentMenu,
  type PageMenuTarget,
} from "@/components/pages/page-document-actions";
import {
  PageHistorySheet,
  type PageHistoryTab,
} from "@/components/pages/page-history";
import { PageTaskSurface } from "@/components/pages/page-task-surface";
import { useAssistantContext } from "@/lib/assistant-panel-context";
import { PageBreadcrumb } from "@/components/pages/page-breadcrumb";
import { PageCommentLayer } from "@/components/pages/page-comment-layer";
import type { PageCommentAnchor } from "@/components/pages/page-comment-bubble";
import { PageConflictBanner } from "@/components/pages/page-conflict-banner";
import { PageToc } from "@/components/pages/page-toc";
import { PagePresence, usePresentOn } from "@/components/pages/page-presence";
import { usePageWatch } from "@/lib/use-page-watch";
import {
  usePageAutosave,
  type PageSaveState,
} from "@/components/pages/use-page-autosave";
import type { PagesLookup } from "@/components/pages/pages-lookup";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** Delay before writing, from the last keystroke. */
const SAVE_DELAY_MS = 1_000;

/** Save state and last editor, exposed as the header shortcut to versions. */
function PageStatus({
  state,
  updatedAt,
  lastEdit,
  onOpenHistory,
}: {
  state: PageSaveState;
  updatedAt: string | null;
  /** WHO wrote last, and when. Absent until name is resolved:
      a name that changes before the eyes reads like an error. */
  lastEdit: { name: string; at: string } | null;
  onOpenHistory: () => void;
}) {
  const t = useTranslations("Pages");
  const format = useFormatter();
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  // The two timestamps that this line knows. They are most often the
  // SAME moment — the last writing is the one just recorded —
  // but not always: writing from elsewhere moves `lastEdit` without
  // that nothing was recorded. The two pull the clock, below.
  const at = updatedAt ? new Date(updatedAt).getTime() : NaN;
  const editedAt = lastEdit ? new Date(lastEdit.at).getTime() : NaN;
  /**
   * The REFERENCE moment for relative durations, and it must never be
   * overwhelmed by what it measures.
   *
   * The clock only beats every 15 seconds: between two beats, one
   * record that has just completed has a timestamp AFTER it, and
   * the relative formatter then says “in 1 second”. The maximum reduces it to
   * “at the moment”, which is what we just did.
   */
  const now = Math.max(
    tick,
    Number.isFinite(at) ? at : 0,
    Number.isFinite(editedAt) ? editedAt : 0
  );
  // The conflict remains in this same icon, and does not become a fourth
  // thing to read: the page IS saved — it's the banner, just above
  // of the document, which contains what is to be decided.
  const label =
    state === "saving"
      ? t("saving")
      : state === "conflict"
        ? t("savedWithConflict")
        : t("saved");

  const edited = lastEdit
    ? t("lastEditedBy", {
        name: lastEdit.name,
        time: format.relativeTime(editedAt, now),
      })
    : null;

  const accessibleLabel = `${t("historyTabVersions")} — ${label}${
    edited ? ` — ${edited}` : ""
  }`;

  return (
    <Tooltip disableHoverableContent>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onOpenHistory}
          aria-label={accessibleLabel}
          className={cn(
            state === "conflict"
              ? "text-amber-600 hover:text-amber-600 dark:text-amber-500"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <span role="status" aria-label={label} className="flex shrink-0">
            {state === "saving" ? (
              <Spinner className="size-3.5" />
            ) : state === "conflict" ? (
              <TriangleAlert className="size-3.5" />
            ) : (
              <Check className="size-3.5" />
            )}
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="end">
        <span>{label}</span>
        {edited ? (
          <span className="ml-1.5 text-muted-foreground">{edited}</span>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}

/** An empty body, or one that only has an empty paragraph — what a page renders
    that we have just created, whatever the path by which we created it. */
function isEmptyDoc(content: unknown): boolean {
  const blocks = (content as { content?: unknown[] } | null)?.content;
  if (!Array.isArray(blocks) || blocks.length === 0) return true;
  if (blocks.length > 1) return false;
  const only = blocks[0] as { type?: string; content?: unknown[] };
  return only?.type === "paragraph" && !only.content?.length;
}

/**
 * The shell that makes the SURFACE remountable (MIN-277).
 *
 * Restore a version rewrites the body and advances the `version`: the
 * displayed document and the counter on which the recording is based are
 * then both expire, and tiptap does not reread its `content`. Rather than
 * to catch both by hand, we go back up - exactly what a
 * navigation from one page to another.
 */
export function PageView({
  projectId,
  pageId,
}: {
  projectId: string;
  pageId: string;
}) {
  const [reload, setReload] = useState(0);
  return (
    <PageSurface
      key={reload}
      projectId={projectId}
      pageId={pageId}
      onRestored={() => setReload((n) => n + 1)}
    />
  );
}

function PageSurface({
  projectId,
  pageId,
  onRestored,
}: {
  projectId: string;
  pageId: string;
  /** A version has just been put back in place: the surface is going back up. */
  onRestored: () => void;
}) {
  const t = useTranslations("Pages");
  const { siteName } = useRuntimeConfig();
  const { user } = useAuth();
  const {
    pages,
    byId,
    loading: pagesLoading,
    updatePage,
    previewPage,
    createPage,
    duplicatePage,
    trashPage,
    discardPage,
    restorePage,
  } = usePagesQuery(projectId);
  const pagesLoaded = !pagesLoading;
  const { members, loading: membersLoading } = useMembersQuery(projectId, true);
  const present = usePresentOn(pageId);
  // The watch heartbeat: while this surface holds the document open, the
  // server knows someone is reading it and stays quiet about agent writes.
  usePageWatch(projectId, pageId);
  const mentionSources = useDescriptionMentions(projectId, members);
  const mentions = useMemo(
    () => ({
      items: () => mentionSources.options,
      onQuery: mentionSources.onQuery,
    }),
    [mentionSources]
  );

  // `refetchOnMount: "always"`: the editor only reads his document during editing,
  // therefore this cache does not have the right to the window of freshness of the others. Without
  // that, returning to a page less than five minutes after leaving it
  // reopened on the body of the first load — a teammate, Numo, or a
  // other tab has been able to write since, and nothing would have gone to ask for it.
  const {
    data: page,
    isPending,
    isFetchedAfterMount,
    error,
  } = useQuery({
    queryKey: pageKey(pageId),
    queryFn: () => fetchPageApi(projectId, pageId),
    refetchOnMount: "always",
  });

  // The LIST line is the source of the displayed title and icon: it is
  // it that the sidebar, the breadcrumbs and the subpage block read, and the
  // three must move from the first letter typed here.
  //
  // As soon as you type, on the other hand, it is THIS component which is authentic. Without this,
  // the response of a PATCH left a second earlier rewritten in the field
  // title BEFORE the last letters — a quick typing was seen returning
  // backwards with each recording.
  const summary = byId.get(pageId);
  const [edited, setEdited] = useState<{
    title?: string;
    icon?: string | null;
  }>({});
  const title = edited.title ?? summary?.title ?? page?.title ?? "";
  const icon =
    edited.icon !== undefined ? edited.icon : (summary?.icon ?? page?.icon ?? null);

  /* ── The title and body, sewn on the keyboard ─────────────────────────── */
  //
  // The title is a separate field, but for those writing it is the line above
  // of the first line of the body: ⌫ at the very beginning of the document and ↑ from its
  // first line goes back to the END of the title, ↓ since the title goes back down to
  // the body. The "document" half of the passage lives in title-bridge.ts;
  // it is here that it joins the field, the only place that holds both.
  const titleFieldRef = useRef<HTMLTextAreaElement | null>(null);
  const focusTitleEnd = useCallback(() => {
    const field = titleFieldRef.current;
    if (!field) return;
    field.focus();
    // At the END of the title, and not where the caret was left: we arrive by the
    // left, as we would arrive at the end of the previous line.
    const end = field.value.length;
    field.setSelectionRange(end, end);
  }, []);

  /* ── Writing, grouped and VERSIONED (MIN-271) ──────────────────────── */
  const editorRef = useRef<Editor | null>(null);
  // Images and files pasted or dropped in the body (MIN-280). Mounted
  // here, with the editor, because this is where the project, the page and the
  // publisher's ref — a successful submission must find its block.
  const uploads = usePageUploads(projectId, pageId, editorRef);
  // ↓ DOWN — the cursor goes to the first line of the body, as it is.
  const focusBodyStart = useCallback(() => {
    editorRef.current?.commands.focus("start");
  }, []);
  // Enter OPENS a line, like anywhere else in the document: one line
  // empty at the head of the body, cursor inside (see `focusDocumentStart`).
  const openBodyLine = useCallback(() => {
    const editor = editorRef.current;
    if (editor) focusDocumentStart(editor);
  }, []);
  const onSaveError = useCallback(
    (err: unknown) => {
      toast.error(err instanceof Error ? err.message : t("saveFailed"));
    },
    [t]
  );
  const autosave = usePageAutosave({
    pageId,
    page,
    // The `version` which serves as a safeguard is NOT caught in the cache: it
    // only makes sense when it comes from the server, and from this montage.
    fresh: isFetchedAfterMount,
    delayMs: SAVE_DELAY_MS,
    save: updatePage,
    editorRef,
    onError: onSaveError,
  });
  const { schedule, flush, takePending, reconcileRemote } = autosave;

  useEffect(() => {
    if (page && isFetchedAfterMount) reconcileRemote(page);
  }, [page, isFetchedAfterMount, reconcileRemote]);

  /* ── Departure: write, or act as if nothing had happened ───────────────
     Leave the page WRITE what remained — otherwise, type then click immediately
     on another page in the tree loses the last second of typing.
     Unless the page is a DRAFT that remains empty (lib/pages-draft.ts): it
     has just been created, nothing has been put into it, and there should be nothing left.
     What we read when dismantling goes through refs: at this moment there is no longer
     rendering, and the editor can already be unmounted. */
  const flushRef = useRef(flush);
  flushRef.current = flush;
  const titleRef = useRef(title);
  titleRef.current = title;
  const iconRef = useRef(icon);
  iconRef.current = icon;
  const contentRef = useRef<unknown>(null);
  useEffect(() => {
    if (page) contentRef.current = page.content;
  }, [page]);
  const discardRef = useRef(discardPage);
  discardRef.current = discardPage;

  /** Nothing has been written on this page since we created it. */
  const stillBlank = useCallback(
    () =>
      isDraftPage(pageId) &&
      !titleRef.current.trim() &&
      !iconRef.current &&
      isEmptyDoc(contentRef.current),
    [pageId]
  );
  const blankRef = useRef(stillBlank);
  blankRef.current = stillBlank;

  useEffect(() => {
    // Here we are: nothing that was programmed in the previous dismantling should
    // succeed. This is what makes destruction safe in Strict Mode, where React
    // disassemble and reassemble immediately (see lib/pages-draft.ts).
    cancelDraftDiscard(pageId);
    return () => {
      if (blankRef.current()) {
        scheduleDraftDiscard(pageId, () => void discardRef.current(pageId));
        return;
      }
      // Written: it is no longer a draft, and it will not become one again.
      forgetDraftPage(pageId);
      void flushRef.current();
    };
  }, [pageId]);

  // The tab that leaves (refresh, close, external navigation).
  //
  // `pagehide` is the only event we can count on — `beforeunload`
  // does not always trigger on mobile, and at that time a `fetch`
  // ordinary dies with the document. Hence the writing `keepalive`, which starts
  // without being expected: without it, the last second of the shot was
  // lost and the page reopened to its previous version.
  //
  // `visibilitychange` completes the table: move to another written tab
  // right away, with a normal PATCH, rather than waiting for a response that may
  // never arrive.
  useEffect(() => {
    const onHide = () => {
      // Same rule as for disassembly: an empty draft does not go to base, it
      // fades away. `takePending` is not called — there is nothing to write.
      if (blankRef.current()) {
        forgetDraftPage(pageId);
        discardPageOnUnload(projectId, pageId);
        return;
      }
      const patch = takePending();
      if (patch) updatePageOnUnload(projectId, pageId, patch);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") void flushRef.current();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [projectId, pageId, takePending]);

  // ⌘S / Ctrl+S now writes, as in the notebook. The recording is
  // already automatic: what the gesture brings is not safeguarding, it is
  // to SEE it — the reflex is too ingrained for us to leave the browser
  // respond for him through his “save page” box.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        !event.altKey &&
        eventKey(event) === "s"
      ) {
        event.preventDefault();
        void flushRef.current();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  /* ── Body subpages (MIN-272) ───────────────────────────────── */
  //
  // The same information is carried in two places: `parent_id` in base, and the
  // `subpage` block in this document. The column makes the truth, the block is
  // a view — and it is here that the view comes back down to the truth.
  const router = useRouter();
  const base = `/projects/${projectId}/pages`;

  const lookup = useMemo<PagesLookup>(
    () => ({
      ready: pagesLoaded,
      get: (id) => {
        const row = byId.get(id);
        return row ? { id: row.id, title: row.title, icon: row.icon } : undefined;
      },
      href: (id) => `${base}/${id}`,
      navigate: (id) => router.push(`${base}/${id}`),
      create: async () => {
        try {
          const child = await createPage({ parent_id: pageId });
          return child.id;
        } catch (err) {
          toast.error(err instanceof Error ? err.message : t("createFailed"));
          return null;
        }
      },
      opened: (id) => {
        // The block has just been placed in THIS document: we write it BEFORE
        // leave. Without this `flush`, navigation unmounts the editor with, in
        // the draft, a block that no one has yet recorded — the
        // subpage exists, its link in the parent does not.
        void flushRef.current().finally(() => router.push(`${base}/${id}`));
      },
      duplicate: async (id) => {
        try {
          const copy = await duplicatePage(id);
          toast.success(t("duplicated"));
          return copy.id;
        } catch (err) {
          toast.error(err instanceof Error ? err.message : t("duplicateFailed"));
          return null;
        }
      },
      restore: async (id) => {
        try {
          await restorePage(id);
          toast.success(t("restored"));
          return true;
        } catch (err) {
          toast.error(err instanceof Error ? err.message : t("restoreFailed"));
          return false;
        }
      },
    }),
    [pagesLoaded, byId, base, createPage, duplicatePage, pageId, restorePage, router, t]
  );

  /* ── Delete block moves page to trash ─────────────────────── */
  //
  // The behavior of Notion, deliberately retained against “detach”: when
  // we delete the link to a subpage, this is most often what we want
  // delete the subpage. Letting her live would make her survive in a
  // sidebar that we don't look at all the time, without ever seeing it.
  //
  // What makes this choice tenable is the trash: nothing is destroyed,
  // everything comes back for 30 days (MIN-266). And what makes it honest is
  // that the confirmation announces the REAL account — the page we see and all its
  // descendants, who leave with her without being on screen.
  const [pendingTrash, setPendingTrash] = useState<string[] | null>(null);
  const pendingCount = useMemo(() => {
    if (!pendingTrash) return 0;
    const gone = new Set<string>();
    for (const id of pendingTrash) {
      gone.add(id);
      for (const child of descendantIds(pages, id)) gone.add(child);
    }
    return gone.size;
  }, [pendingTrash, pages]);

  const onSubpagesRemoved = useCallback(
    (ids: string[]) => {
      // An ORPHAN block that is deleted does not ask anyone for anything: its page
      // is already no longer there, there is only text to remove.
      const live = ids.filter((id) => byId.has(id));
      if (live.length === 0) return;
      setPendingTrash(live);
    },
    [byId]
  );

  // Confirm closes the box, and Radix announces any closure of the same
  // way. Without this mark, “yes” would go back the way of “no”
  // and undo the deletion that we have just accepted.
  const decided = useRef(false);

  const cancelTrash = useCallback(() => {
    setPendingTrash(null);
    // The block is ALREADY part of the document when the question arises: the
    // detection notices a deletion, it does not intercept it (there is a
    // dozen ways to delete a block, and intercept them one by one
    // it's forgetting). To cancel is therefore to undo — and the box being
    // modal, the undone gesture is indeed the last.
    editorRef.current?.commands.undo();
  }, []);

  const confirmTrash = useCallback(() => {
    const ids = pendingTrash;
    decided.current = true;
    setPendingTrash(null);
    if (!ids) return;
    void (async () => {
      try {
        let trashed = 0;
        for (const id of ids) trashed += await trashPage(id);
        toast.success(
          trashed > 1
            ? t("trashedWithChildren", { count: trashed })
            : t("trashedOne")
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("deleteFailed"));
      }
    })();
  }, [pendingTrash, trashPage, t]);

  /* ── Who wrote last, and history (MIN-277) ────────────────── */
  //
  // On a ticket, no one asks for it; on the doc, this is the line that
  // makes one believe a page. The name comes from the MEMBERS of the project, already charged
  // for mentions and presence — never the raw email (lib/display-name).
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyTab, setHistoryTab] = useState<PageHistoryTab>("activity");
  const openHistory = useCallback((tab: PageHistoryTab) => {
    setHistoryTab(tab);
    setHistoryOpen(true);
  }, []);
  const lastWriterId =
    summary?.updated_by ?? page?.updated_by ?? summary?.created_by ?? page?.created_by ?? null;
  const lastWriterKind = summary?.updated_kind ?? page?.updated_kind ?? "human";
  const lastEditName = useMemo(() => {
    // An agent entry carries the id of the account that authorized it; we don't
    // don't show — that's Minddy's whole identity rule.
    if (lastWriterKind === "agent") return siteName;
    if (!lastWriterId) return null;
    // We wait for the members rather than writing “Someone” for a second then
    // the real name: a name that changes before the eyes reads like an error.
    if (membersLoading) return null;
    const member = members.find((m) => m.user_id === lastWriterId);
    // Leaving the project, or account deleted: the DATE remains the useful half of the
    // line, and “Someone” doesn’t claim anything false.
    return (member && displayName(member, "")) || t("someone");
  }, [members, membersLoading, lastWriterId, lastWriterKind, siteName, t]);
  const lastEditAt =
    autosave.savedAt ?? summary?.updated_at ?? page?.updated_at ?? null;

  /* ── The way here ─────────────────────── ──────────────────────── */
  //
  // `ancestorsOf` goes back from the nearest to the root; breadcrumbs read
  // in the other direction. It is empty on a root page, and the component does not render
  // then nothing at all.
  const trail = useMemo(
    () => ancestorsOf(pages, pageId).reverse(),
    [pages, pageId]
  );

  /* ── The same page menu as the sidebar tree ───────────────────────────── */
  const createChildFromMenu = useCallback(
    (parentId: string) => {
      void (async () => {
        try {
          const child = await createPage({ parent_id: parentId });
          markDraftPage(child.id);
          void flushRef
            .current()
            .finally(() => router.push(`${base}/${child.id}`));
        } catch (err) {
          toast.error(err instanceof Error ? err.message : t("createFailed"));
        }
      })();
    },
    [base, createPage, router, t]
  );

  const toggleFavoriteFromMenu = useCallback(
    (target: PageMenuTarget) => {
      void updatePage(target.id, { favorite: !target.favorite }).catch(
        (err: unknown) => {
          toast.error(err instanceof Error ? err.message : t("favoriteFailed"));
        }
      );
    },
    [t, updatePage]
  );

  const trashFromMenu = useCallback(
    (target: PageMenuTarget) => {
      void (async () => {
        try {
          const trashed = await trashPage(target.id);
          router.push(base);
          toast.success(
            trashed > 1
              ? t("trashedWithChildren", { count: trashed })
              : t("trashed", { title: target.title || t("untitled") })
          );
        } catch (err) {
          toast.error(err instanceof Error ? err.message : t("deleteFailed"));
        }
      })();
    },
    [base, router, t, trashPage]
  );

  const documentMenu = usePageDocumentMenu({
    projectId,
    pages,
    onCreateChild: createChildFromMenu,
    onToggleFavorite: toggleFavoriteFromMenu,
    onTrash: trashFromMenu,
  });
  const pageRef = useMemo<PageMenuTarget>(
    () => ({
      id: pageId,
      title,
      favorite: summary?.favorite ?? page?.favorite ?? false,
    }),
    [pageId, title, summary?.favorite, page?.favorite]
  );

  /* ── ⌘⇧L: copy this page for an agent ───────────────────────────── */
  //
  // Notion's gesture, and for the same reason: giving the page we read to
  // someone else is too frequent to go through a menu. That
  // “someone else” here means, it’s an agent — hence the contact details
  // MCP next to the URL, and the optional instruction (lib/page-agent-prompt.ts).
  //
  // ⇧ IS MANDATORY, and it is not an aesthetic choice. ⌘L naked fails
  // never on the page on a Mac: the address bar takes it to the level of
  // browser, before the document — the `keydown` does not arrive, and there is therefore
  // nothing at `preventDefault`. Verified in real life on PR 67, after having written it
  // in ⌘L. The neighborhood is already in ⌘⇧ for the same reason (⌘⇧D, dictation,
  // lib/create-context.tsx): this is the form that passes.
  //
  // He OPENS the dialog instead of copying, and this is deliberate: the entry of the
  // menu and shortcut are the same gesture, they should give the same
  // result. The field takes focus, so ⌘⇧L then ⌘Enter copy without anything
  // to ask, against the possibility of saying what we want to see done.
  //
  // It does not require ANY particular focus: it is enough for the page to be
  // the screen. The listener is on `window`, in capture — the cursor can be
  // in the editor, in the title or nowhere, it is the displayed page that we
  // copie.
  //
  // `openAgentCopyRef`: the shortcut does not resubscribe on each keystroke in
  // the title. `pageRef` changes with each character typed, and a `useEffect` which
  // would depend on it would put an earpiece per letter.
  const openAgentCopyRef = useRef<() => void>(() => {});
  openAgentCopyRef.current = () => documentMenu.openAgentCopy(pageRef, "shortcut");
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!matchesModShiftCombo(event, "l")) return;
      // A dialog already open takes up the screen - this one included: without this
      // guard, the shortcut while writing the instruction would reopen the
      // dialog and would erase what was just typed.
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      event.preventDefault();
      openAgentCopyRef.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  /* ── What Numo sees when you are on this page ─────────────────────── */
  //
  // The open page becomes the ambient context of the assistant (MIN-273): “do
  // tickets on this page”, “corrects this paragraph” are then resolved
  // without having to name it, and Numo has the tools to read and write it.
  //
  // The title goes with the id: the pill says it without rereading the page, and the prompt
  // can name it before the first tool call. This is the DISPLAYED title, so
  // the one we may have just typed.
  useAssistantContext(
    useMemo(
      () => ({ projectId, pageId, pageTitle: title, pageIcon: icon }),
      [projectId, pageId, title, icon]
    )
  );

  /* ── The floating table of contents ─────────────────────────────────── */
  //
  // It needs TWO things that the body does not provide on its own:
  // the editor instance (to read the titles and follow them when typing) and
  // the container that scrolls (to know where we are, and to get there).
  const scrollRef = useRef<HTMLDivElement>(null);
  const [editor, setEditor] = useState<Editor | null>(null);

  /* ── Comment on a passage (MIN-282) ───────────────────────────────────── */
  //
  // The selection bubble renders the block and extracts it; the layer opens on it
  // wire panel, next to the block. The state lives HERE because it connects two
  // children who don't know each other — the editor and the layer.
  const [draftAnchor, setDraftAnchor] = useState<PageCommentAnchor | null>(null);
  const onComment = useCallback((anchor: PageCommentAnchor) => {
    setDraftAnchor(anchor);
  }, []);
  const clearDraftAnchor = useCallback(() => setDraftAnchor(null), []);

  /* ── The anchor of a block ───────────────────────────────────────────── */
  /** Margin above the block targeted by an anchor, once arrived. */
  const ANCHOR_MARGIN = 96;
  const bodyRef = useRef<HTMLDivElement>(null);
  const loaded = !!page;
  useEffect(() => {
    if (!loaded) return;
    const id = window.location.hash.slice(1);
    if (!id) return;
    // After painting: the targeted block only exists in the DOM once it has been
    // document mounted by tiptap, which arrives one step after the response.
    let unflash: (() => void) | null = null;
    const handle = requestAnimationFrame(() => {
      const view = editor;
      const container = scrollRef.current;
      if (!view || !container) return;
      // The anchor resolves to the DOCUMENT, not the DOM: blink
      // is a ProseMirror decoration, which is placed on a POSITION (cf.
      // block-flash.ts). The gesture is then exactly that of the table of
      // matters — only one path, only one place to go wrong.
      const pos = posOfBlockId(view, id);
      if (pos === null) return;
      unflash = revealBlock(view, container, pos, ANCHOR_MARGIN);
    });
    return () => {
      cancelAnimationFrame(handle);
      unflash?.();
    };
  }, [loaded, pageId, editor]);

  if (error) {
    return (
      <p className="px-6 py-16 text-center text-sm text-muted-foreground">
        {error instanceof Error ? error.message : t("loadFailed")}
      </p>
    );
  }

  // We are waiting for the response from THIS montage, and not just “one” piece of data.
  //
  // This is the counterpart of the model: tiptap never rereads its `content`, so
  // the document on which the editor mounts is the one he will keep on the screen
  // until dismantling. Paint the cover first – the reflex everywhere else
  // in the app, and what rehydration does from the disk to
  // reloading — put on the screen an expired body that the response arrived one
  // moment later could no longer correct. Hence the wait: on a
  // document, a skeleton moment is better than a previous version
  // displayed with the aplomb of the maid.
  if (isPending || !page || !isFetchedAfterMount) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* A structural, non-scrolling header: breadcrumb on the left; presence,
          versions, comments, and document actions on the right. */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 py-3 md:px-6">
        <div className="flex min-w-0 flex-1 items-center">
          <PageBreadcrumb trail={trail} hrefFor={(id) => `${base}/${id}`} />
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <PagePresence userIds={present} members={members} />
          <PageStatus
            state={autosave.state}
            updatedAt={autosave.savedAt ?? summary?.updated_at ?? page.updated_at}
            lastEdit={
              lastEditName && lastEditAt
                ? { name: lastEditName, at: lastEditAt }
                : null
            }
            onOpenHistory={() => openHistory("versions")}
          />
          <Tooltip disableHoverableContent>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("comments")}
                className="text-muted-foreground hover:text-foreground"
                onClick={() => openHistory("activity")}
              >
                <MessageSquare className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t("comments")}</TooltipContent>
          </Tooltip>
          <IssueActionsMenu
            searchable={false}
            // The key is ONLY displayed there: ⌘⇧L aims at the open page, which is
            // this one and not the tree line we are flying over.
            actions={documentMenu.actionsFor(pageRef, { shortcut: true })}
            trigger={
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-foreground"
                aria-label={t("pageOptions")}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            }
          />
        </div>
      </div>
      {documentMenu.dialogs}

      {/* The table of contents floats at the right edge of the PANEL, therefore out of the
          container that moves by: it stays in its place while we go down
          in the document, and it's scrolling through it. */}
      <PageToc editor={editor} scrollRef={scrollRef} />

      <div
        ref={scrollRef}
        className="scrollbar-quiet min-h-0 flex-1 overflow-y-auto"
      >
        {/* The COLUMN of the document. She carries two things, and she's the only one
            be able to carry them together: the GUTTER reserve on the left (56 px,
            the exact width of the handle and the `+`) and the positioning of which
            the chrome is used to place itself there. Title and blocks therefore share the
            same left edge, and the hover margin falls into the reserve instead
            to shift the body under the title. */}
        <div className="relative mx-auto w-full max-w-3xl px-6 py-10 md:pl-24 md:pr-10">
          <PageHeader
            title={title}
            icon={icon}
            // A NEW page — without a name and without content — puts the cursor in its
            // title. The test is about what the page IS, not how
            // which we arrived at: it's true that we come from the `/page` of the body
            // of the parent, of the `+` of the sidebar or of the menu of a line of the tree,
            // and that avoids making a “I have just been created” travel through
            // three components and navigation.
            autoFocus={!title && isEmptyDoc(page.content)}
            onTitleChange={(next) => {
              setEdited((current) => ({ ...current, title: next }));
              // The sidebar, breadcrumbs and subpage block read the cache
              // of the LIST: without this local writing, they only moved one
              // second later, at group recording — we typed a title
              // looking at the old one in the left column.
              previewPage(pageId, { title: next });
              schedule({ title: next });
            }}
            onIconChange={(next) => {
              setEdited((current) => ({ ...current, icon: next }));
              previewPage(pageId, { icon: next });
              schedule({ icon: next });
              void flush();
            }}
            onEnter={openBodyLine}
            onDown={focusBodyStart}
            fieldRef={titleFieldRef}
          />
          {/* Between the title and the body: above the document, because it is
              of the document it is talking about, and in the flow, because an overwrite
              silent is exactly what we refuse — it only closes when
              gesture from its reader. */}
          <PageConflictBanner
            conflicts={autosave.conflicts}
            onRestore={autosave.restore}
            onDismiss={autosave.dismiss}
          />
          <div ref={bodyRef} className="mt-6">
            {/* What “assign a task” means when it comes off a page
                rather than the notebook: the prompt names the page, and the navigation
                waits for what is pending to be written (MIN-274). */}
            <PageTaskSurface
              projectId={projectId}
              pageTitle={title}
              flush={flush}
            >
              <PageEditor
                initialContent={(page.content as JSONContent | null) ?? null}
                onChange={(content) => {
                  contentRef.current = content;
                  schedule({ content });
                }}
                pages={lookup}
                uploads={uploads}
                mentions={mentions}
                mentionLinks={mentionSources.links}
                editorRef={editorRef}
                onEditor={setEditor}
                onSubpagesRemoved={onSubpagesRemoved}
                onLeaveTop={focusTitleEnd}
                onComment={onComment}
              />
            </PageTaskSurface>
          </div>
        </div>
      </div>

      {/* The announced account is the REAL account: the page that we see disappear
          plus all her descendants, who leave with her without being on screen.
          Saying “this page” when five are gone is trash
          a surprise rather than a trickle. */}
      {/* Activity and versions share one panel. It is mounted only when one of
          the header shortcuts requests it because it may render a second editor. */}
      {historyOpen ? (
        <PageHistorySheet
          projectId={projectId}
          pageId={pageId}
          open={historyOpen}
          initialTab={historyTab}
          onOpenChange={setHistoryOpen}
          onRestored={onRestored}
        />
      ) : null}

      {/* COMMENTS (MIN-282), in layer: nothing in the document flow.
          The thread of a block opens next to its block, that of the page lives in
          the “Activity” tab of the history. */}
      <PageCommentLayer
        projectId={projectId}
        pageId={pageId}
        editor={editor}
        members={members}
        currentUserId={user?.id ?? null}
        draftAnchor={draftAnchor}
        onDraftAnchorDone={clearDraftAnchor}
      />

      <AlertDialog
        open={pendingTrash !== null}
        onOpenChange={(open) => {
          if (open) return;
          if (decided.current) {
            decided.current = false;
            return;
          }
          cancelTrash();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("subpageDeleteTitle", { count: pendingCount })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("subpageDeleteBody", { count: pendingCount })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("subpageDeleteCancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmTrash}>
              {t("subpageDeleteConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
