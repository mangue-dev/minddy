"use client";

// The persistent page tree and document surfaces for the project.

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Button,
  Skeleton,
  cn,
  toast,
  SidePanel, SidePanelContent, SidePanelTitle,
} from "mangue-ui";
import { Plus, Maximize2, X } from "lucide-react";

import { SecondarySidebar } from "@/components/secondary-sidebar";
import { PageTree } from "@/components/pages/page-tree";
import { PageCreateMenu } from "@/components/pages/page-create-menu";
import { markDatabaseSetup } from "@/lib/page-database-setup";
import { keepOverlayOpenForPopper } from "@/lib/overlay-dismiss";
import { PageView } from "@/components/pages/page-view";
import { PagesHome } from "@/components/pages/pages-home";
import { PagePresenceProvider } from "@/components/pages/page-presence";
import { usePagesQuery } from "@/lib/use-pages-query";
import { computePageMove, type PageDropMode } from "@/lib/pages-move";
import { isPageCycleError } from "@/lib/pages-api";
import { rememberLastPage } from "@/lib/pages-last-open";
import { forgetDraftPage, markDraftPage } from "@/lib/pages-draft";
import {
  pageHref,
  pagesHref,
  pushPagesHistory,
  replacePagesHistory,
} from "@/lib/pages-navigation";
import { SIDEBAR_COMPACT_CONTROL_CLASS } from "@/lib/sidebar-control-styles";
import type { PageMenuTarget } from "@/components/pages/page-document-actions";

export function PagesShell() {
  const t = useTranslations("Pages");
  const tCommon = useTranslations("Common");
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const pathname = usePathname();
  const searchParams = useSearchParams();
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
  const [query, setQuery] = useState("");

  const previewId = searchParams.get("entry");
  const preview = previewId ? byId.get(previewId) : undefined;
  const validPreview = preview?.parent_id === activePageId && byId.get(activePageId ?? "")?.database_schema != null ? preview : undefined;
  const openPage = useCallback((pageId: string, databaseId?: string) => {
    const page = byId.get(pageId);
    const parent = databaseId ? byId.get(databaseId) : page?.parent_id ? byId.get(page.parent_id) : undefined;
    const href = parent?.database_schema != null
      ? `${pageHref(projectId, parent.id)}?entry=${pageId}`
      : pageHref(projectId, pageId);
    if (validPreview) void previewFlush.current().then((saved) => { if (saved) pushPagesHistory(href); });
    else pushPagesHistory(href);
  }, [projectId, byId, validPreview]);
  const leavePreview = async (extend = false) => {
    if (!(await previewFlush.current())) return;
    pushPagesHistory(pageHref(projectId, extend && validPreview ? validPreview.id : activePageId!));
  };

  // The open page is retained HERE rather than in `PageView`: the shell
  // crosses navigations, so it sees the LAST state of the tab, y
  // included returning to the list after trashing. It is
  // `app/(app)/projects/[id]/pages/page.tsx` which rereads it when opened.
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
          pushPagesHistory(`${pageHref(projectId, parentId)}?entry=${page.id}`);
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
    [base, createPage, openPage, projectId, t, byId]
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

  // A project WITHOUT ANY pages has no tree to show, and a bar
  // secondary empty is not a neutral state: it is a piece of furniture which takes a
  // quarter of the screen to say that it contains nothing, next to a panel which
  // already says it. The bar therefore only appears on the first page — and the screen
  // home tab (app/(app)/projects/[id]/pages/page.tsx) then occupies
  // full width, with its single button.
  //
  // During LOADING, we keep the bar (and its skeletons): remove it
  // to put it back a fraction of a second later would skip the setting
  // page each time you arrive in the tab, on almost all projects.
  const bare = !loading && pages.length === 0;

  return (
    // The PRESENCE is open here, and not in the page: the shell crosses
    // navigations, open page no (MIN-271).
    <PagePresenceProvider projectId={projectId} pageId={validPreview?.id ?? activePageId}>
    <div className="flex h-full min-h-0">
      {bare ? null : (
      <SecondarySidebar
        title={t("title")}
        hiddenOnMobile={pathname !== base}
        filter={{
          value: query,
          onChange: setQuery,
          placeholder: t("filterPlaceholder", { count: pages.length }),
          clearLabel: tCommon("clearFilter"),
        }}
        actions={
          <PageCreateMenu onCreate={(database) => void create(null, database)} trigger={
            <Button variant="ghost" size="icon" className={cn(SIDEBAR_COMPACT_CONTROL_CLASS, "-mr-2")}
              aria-label={tDatabase("create")}><Plus className="size-[18px]" /></Button>
          } />
        }
      >
        {loading ? (
          <div className="flex flex-col gap-1.5 px-2 pt-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-7 rounded-md" />
            ))}
          </div>
        ) : pages.length === 0 ? (
          // Reachable only for the duration of a loading which has just finished
          // empty, before `bare` removes the bar: the filter can
          // also empty the TREE without emptying the project, and it is `PageTree` which
          // dit.
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            {t("sidebarEmpty")}
          </p>
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
      </SecondarySidebar>
      )}

      <div
        className={cn(
          "min-h-0 min-w-0 flex-1 flex-col md:flex",
          // Without secondary bar, there is no longer a “list on the left”
          // leave alone on mobile: this panel IS the tab.
          bare || pathname !== base ? "flex" : "hidden"
        )}
      >
        {activePageId ? (
          <PageView key={activePageId} projectId={projectId} pageId={activePageId} active={!validPreview} onNavigate={openPage} />
        ) : (
          <PagesHome
            projectId={projectId}
            pages={pages}
            byId={byId}
            loading={loading}
            onCreate={(database) => void create(null, database)}
          />
        )}
      </div>
    </div>
    <SidePanel open={!!validPreview} onOpenChange={(open) => { if (!open) void leavePreview(); }}>
      <SidePanelContent
        className="flex w-[min(760px,calc(100vw-2rem))] flex-col overflow-hidden p-0 data-[vaul-drawer-direction=bottom]:w-full"
        onInteractOutside={keepOverlayOpenForPopper}
        onEscapeKeyDown={(event) => {
          if (event.target instanceof HTMLElement && event.target.closest("[data-database-cell-editor]"))
            event.preventDefault();
        }}
      >
        <div className="flex shrink-0 items-center gap-2 px-4 pt-3">
          <SidePanelTitle className="sr-only">{validPreview?.title || tDatabase("newEntry")}</SidePanelTitle><div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={() => void leavePreview(true)}><Maximize2 className="size-3.5" />{tDatabase("extend")}</Button>
          <Button variant="ghost" size="icon-sm" aria-label={tCommon("close")} onClick={() => void leavePreview()}><X className="size-4" /></Button>
        </div>
        {validPreview && <PageView panel key={validPreview.id} projectId={projectId} pageId={validPreview.id} onNavigate={openPage} onNavigationReady={registerPreviewFlush} />}
      </SidePanelContent>
    </SidePanel>
    </PagePresenceProvider>
  );
}
