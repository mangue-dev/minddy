"use client";

import { useMobileCollectionState } from "@/lib/mobile-collection-state";

// The persistent page tree and document surfaces for the project.

import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, File02Icon } from "@hugeicons/core-free-icons";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAppNavigation } from "@/lib/use-app-router";
import { AppTabRouteBoundary, useAppTabRoute } from "@/lib/app-tab-route-context";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { PagePeekPanel } from "@/components/pages/page-peek-panel";
import { CollectionSidebar, type SidebarBrowseTarget } from "@/components/secondary-sidebar";
import { PageTree } from "@/components/pages/page-tree";
import { EmptyScene } from "@/components/empty-scene";
import { PageCreateMenu } from "@/components/pages/page-create-menu";
import { markDatabaseSetup } from "@/lib/page-database-setup";
import { PageView } from "@/components/pages/page-view";
import { RetainedPageDocuments } from "./retained-page-documents";
import { retainedPageDocumentCost } from "@/lib/retained-page-documents";
import { PagesHome } from "@/components/pages/pages-home";
import { PagePresenceProvider } from "@/components/pages/page-presence";
import { PagePromotionProvider } from "@/components/pages/page-promotion-context";
import { pageKey, usePagesQuery } from "@/lib/use-pages-query";
import { computePageMove, type PageDropMode } from "@/lib/pages-move";
import { isPageCycleError } from "@/lib/pages-api";
import { rememberLastPage } from "@/lib/pages-last-open";
import { forgetDraftPage, isDraftPage, markDraftPage } from "@/lib/pages-draft";
import {
  pageHref,
  pagesHref,
  pushPagesHistory,
  replacePagesHistory,
} from "@/lib/pages-navigation";
import { SIDEBAR_COMPACT_CONTROL_CLASS } from "@/lib/sidebar-control-styles";
import type { PageMenuTarget } from "@/components/pages/page-document-actions";
import { useProjectCapabilities } from "@/lib/use-project-capabilities";
import { useRetainedWhileClosing } from "@/lib/use-retained-while-closing";

export function PagesShell({ browse }: { browse?: SidebarBrowseTarget } = {}) {
  return <AppTabRouteBoundary><PagesShellInner browse={browse} /></AppTabRouteBoundary>;
}

function PagesShellInner({ browse }: { browse?: SidebarBrowseTarget }) {
  const openDestination = useAppNavigation();
  const client = useQueryClient();
  const t = useTranslations("Pages");
  const tCommon = useTranslations("Common");
  const { projectId: routeProjectId, pathname, searchParams } = useAppTabRoute();
  const projectId = routeProjectId!;
  // Project readers (MIN-693) browse pages without creating any.
  const { canWrite } = useProjectCapabilities(projectId);
  const tDatabase = useTranslations("PageDatabase");
  const previewFlush = useRef<() => Promise<boolean>>(async () => true);
  const registerPreviewFlush = useCallback((flush: () => Promise<boolean>) => { previewFlush.current = flush; }, []);

  const base = pagesHref(projectId);
  const activePageId = useMemo(() => {
    const rest = pathname.startsWith(`${base}/`) ? pathname.slice(base.length + 1) : "";
    const segment = rest.split("/")[0];
    return segment && segment !== "trash" ? segment : null;
  }, [pathname, base]);

  const { pages, tree, byId, loading, createPage, prefetchPage, updatePage, trashPage } =
    usePagesQuery(projectId);
  const eligible = new Set(pages.filter((page) => {
    const state = client.getQueryState(pageKey(page.id));
    return state?.status === "success" && !isDraftPage(page.id) &&
      retainedPageDocumentCost(state.data) === 1;
  }).map((page) => page.id));
  const [query, setQuery] = useMobileCollectionState(base, "query", "");

  const previewId = searchParams.get("entry");
  const preview = previewId ? byId.get(previewId) : undefined;
  const validPreview = preview?.parent_id === activePageId && byId.get(activePageId ?? "")?.database_schema != null ? preview : undefined;
  // The entry stays in the panel while it slides out (MIN-774).
  const shownPreview = useRetainedWhileClosing(validPreview);
  const openPage = useCallback((pageId: string, databaseId?: string) => {
    const page = byId.get(pageId);
    const parent = databaseId ? byId.get(databaseId) : page?.parent_id ? byId.get(page.parent_id) : undefined;
    const href = parent?.database_schema != null
      ? `${pageHref(projectId, parent.id)}?entry=${pageId}`
      : pageHref(projectId, pageId);
    const open = () => browse ? browse.onSelect(href) : openDestination(href, () => pushPagesHistory(href));
    if (validPreview) void previewFlush.current().then((saved) => { if (saved) open(); });
    else open();
  }, [projectId, byId, validPreview, openDestination, browse]);
  const leavePreview = async (extend = false) => {
    if (!(await previewFlush.current())) return;
    const href = pageHref(projectId, extend && validPreview ? validPreview.id : activePageId!);
    if (extend) openDestination(href, () => pushPagesHistory(href));
    else pushPagesHistory(href);
  };

  // Remember the last selection in the project shell, including returning to
  // the list after trashing. The project's Pages route reads it when reopened.
  useEffect(() => {
    if (activePageId) rememberLastPage(projectId, activePageId);
  }, [projectId, activePageId]);

  const create = useCallback(
    async (parentId: string | null, database = false) => {
      try {
        // The position is calculated by the SERVER (end of siblings): it is
        // the only one to see the pages that this client does not yet have.
        const page = await createPage({ parent_id: parentId, ...(database ? { database_schema: [] } : {}) });
        if (database) markDatabaseSetup(page.id);
        // It is in base, but it is not yet acquired: exit without it
        // writing a letter destroys it (lib/pages-draft.ts). Create a page
        // is not saving it.
        if (!database && !(parentId && byId.get(parentId)?.database_schema)) markDraftPage(page.id);
        if (parentId && byId.get(parentId)?.database_schema) {
          const href = `${pageHref(projectId, parentId)}?entry=${page.id}`;
          if (browse) browse.onSelect(href); else pushPagesHistory(href);
        } else openPage(page.id);
        void page.settled.catch((err: unknown) => {
          forgetDraftPage(page.id);
          if (window.location.pathname === pageHref(projectId, page.id)) {
            replacePagesHistory(base);
          }
          toast.error(err instanceof Error ? err.message : t("createFailed"));
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("createFailed"));
      }
    },
    [base, createPage, openPage, projectId, t, byId, browse]
  );

  const move = useCallback(
    (dragId: string, targetId: string, mode: PageDropMode) => {
      const patch = computePageMove(pages, dragId, targetId, mode);
      // `null` = gesture without effect (on oneself) or loop: nothing to say, nothing
      // didn't move on the screen either.
      if (!patch) return;
      void updatePage(dragId, patch).catch((err: unknown) => {
        // The tree is already back in place (the cache was replayed in reverse);
        // it remains to SAY why, otherwise the gesture seems to have served no purpose.
        toast.error(
          isPageCycleError(err)
            ? t("moveCycle")
            : err instanceof Error
              ? err.message
              : t("moveFailed")
        );
      });
    },
    [pages, updatePage, t]
  );

  /**
 * Pin/unpin, from the menu ⋯ of a line in the tree.
 *
 * The writing is optimistic like the movement (`usePagesQuery`): the line
 * jumps to the top of the bar at the second of the click. A favorite that waits for the
 * server would give a menu that closes on nothing — the gesture is too small
 * to be granted a wait.
 */
  const toggleFavorite = useCallback(
    (page: PageMenuTarget) => {
      void updatePage(page.id, { favorite: !page.favorite }).catch(
        (err: unknown) => {
          toast.error(
            err instanceof Error ? err.message : t("favoriteFailed")
          );
        }
      );
    },
    [updatePage, t]
  );

  const trash = useCallback(
    (page: PageMenuTarget) => {
      void (async () => {
        try {
          const trashed = await trashPage(page.id);
          // Open on a page that has just gone to the trash: we go back
          // to the list rather than leaving a ghost document on the screen.
          if (activePageId === page.id) pushPagesHistory(base);
          // A NU toast, like everywhere else in the app. He wore a
          // “Cancel” button — the only one in the repository, and ringing sets it up
          // default button: among the other notifications, it does not
          // looked like nothing known. The return is not lost
          // however: the Recycle Bin appears at the bottom of the tree every second
          // where the page leaves, and restore is there in one click.
          toast.success(
            trashed > 1
              ? t("trashedWithChildren", { count: trashed })
              : t("trashed", { title: page.title || t("untitled") })
          );
        } catch (err) {
          toast.error(err instanceof Error ? err.message : t("deleteFailed"));
        }
      })();
    },
    [trashPage, activePageId, base, t]
  );

  // A project WITHOUT ANY pages keeps its column, like every collection: its
  // search and its “+” stay where they will be, and a compact scene offers the
  // first page next to the home pane that says the same.

  const sidebar = (
      <CollectionSidebar browse={browse}
        title={t("title")}
        hiddenOnMobile
        filter={{
          value: query,
          onChange: setQuery,
          placeholder: t("filterPlaceholder", { count: pages.length }),
          clearLabel: tCommon("clearFilter"),
        }}
        actions={
          canWrite ? (
            <PageCreateMenu onCreate={(database) => void create(null, database)} trigger={
              <Button variant="ghost" size="icon" className={cn(SIDEBAR_COMPACT_CONTROL_CLASS, "-mr-2")}
                aria-label={tDatabase("create")}><HugeiconsIcon icon={Add01Icon} className="size-[18px]" /></Button>
            } />
          ) : undefined
        }
      >
        {loading ? (
          <div className="flex flex-col gap-1.5 pt-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-7 rounded-md" />
            ))}
          </div>
        ) : pages.length === 0 ? (
          // No page in the project at all. A filter that empties the tree
          // without emptying the project is `PageTree`'s to say.
          <EmptyScene size="compact" icon={File02Icon} title={t("sidebarEmpty")} className="py-10">
            {canWrite ? (
              <PageCreateMenu onCreate={(database) => void create(null, database)} trigger={
                <Button size="sm">
                  <HugeiconsIcon icon={Add01Icon} />
                  {t("newPage")}
                </Button>
              } />
            ) : null}
          </EmptyScene>
        ) : (
          <PageTree
            projectId={projectId}
            pages={pages}
            tree={tree}
            activePageId={activePageId}
            query={query}
            onCreateChild={(parentId) => void create(parentId)}
            onOpen={openPage}
            onPrefetch={prefetchPage}
            onMove={move}
            onTrash={trash}
            onToggleFavorite={toggleFavorite}
          />
        )}
      </CollectionSidebar>
  );

  if (browse) return <PagePresenceProvider projectId={projectId} pageId={null}><PagePromotionProvider>{sidebar}</PagePromotionProvider></PagePresenceProvider>;

  return (
    // The PRESENCE is open here, and not in the page: the shell crosses
    // navigations, open page no (MIN-271).
    <PagePresenceProvider projectId={projectId} pageId={validPreview?.id ?? activePageId}>
    {/* One promotion registry: the tree may promote a page open beside it. */}
    <PagePromotionProvider>
    <div className="flex h-full min-h-0">
      {sidebar}

      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col"
      >
        <RetainedPageDocuments projectId={projectId} pageId={activePageId} eligible={eligible} active={!validPreview}
          renderPage={(id, active) => <PageView projectId={projectId} pageId={id} active={active} onNavigate={openPage} />}
          home={
          <PagesHome
            projectId={projectId}
            pages={pages}
            byId={byId}
            loading={loading}
            onCreate={(database) => void create(null, database)}
          />
          } />
      </div>
    </div>
    <PagePeekPanel
      open={!!validPreview}
      title={shownPreview?.title || tDatabase("newEntry")}
      expandLabel={tDatabase("extend")}
      onExpand={() => void leavePreview(true)}
      onClose={() => void leavePreview()}
    >
      {shownPreview && <PageView panel key={shownPreview.id} projectId={projectId} pageId={shownPreview.id} onNavigate={openPage} onNavigationReady={registerPreviewFlush} />}
    </PagePeekPanel>
    </PagePromotionProvider>
    </PagePresenceProvider>
  );
}
