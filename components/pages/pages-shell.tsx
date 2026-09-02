"use client";

// The PAGES tab of a project (MIN-270): the secondary bar and its tree.
//
// It lives in the LAYOUT of the segment, not in each of its pages. Two reasons,
// and the second is enough: the tree does not go back from one page to another (state
// opening, scroll position, query), and the secondary bar does not
// therefore never disappears for the duration of a navigation - it is she who holds the
// sidebar primaire au rail.
//
// What is NOT at the bottom of the tree: a “Trash” entry. The plan in
// anticipated a ; it was a duplicate. The application trash (/trash)
// already collects deleted pages, with their project and purge time,
// next to tickets and objectives — a second path to the same list
// above all, we have to ask ourselves which of the two is telling the truth.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Button,
  Skeleton,
  cn,
  toast,
} from "mangue-ui";
import { Plus } from "lucide-react";

import { SecondarySidebar } from "@/components/secondary-sidebar";
import { PageTree } from "@/components/pages/page-tree";
import { PageView } from "@/components/pages/page-view";
import { PagesHome } from "@/components/pages/pages-home";
import { PagePresenceProvider } from "@/components/pages/page-presence";
import { usePagesQuery } from "@/lib/use-pages-query";
import { computePageMove, type PageDropMode } from "@/lib/pages-move";
import { isPageCycleError } from "@/lib/pages-api";
import { rememberLastPage } from "@/lib/pages-last-open";
import { markDraftPage } from "@/lib/pages-draft";
import {
  pageHref,
  pagesHref,
  pushPagesHistory,
} from "@/lib/pages-navigation";
import { SIDEBAR_COMPACT_CONTROL_CLASS } from "@/lib/sidebar-control-styles";
import type { PageMenuTarget } from "@/components/pages/page-document-actions";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function PagesShell() {
  const t = useTranslations("Pages");
  const tCommon = useTranslations("Common");
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const pathname = usePathname();

  const base = pagesHref(projectId);
  const activePageId = useMemo(() => {
    const rest = pathname.startsWith(`${base}/`) ? pathname.slice(base.length + 1) : "";
    const segment = rest.split("/")[0];
    return segment && segment !== "trash" ? segment : null;
  }, [pathname, base]);

  const { pages, tree, byId, loading, createPage, prefetchPage, updatePage, trashPage } =
    usePagesQuery(projectId);
  const [query, setQuery] = useState("");

  const openPage = useCallback(
    (pageId: string) => pushPagesHistory(pageHref(projectId, pageId)),
    [projectId]
  );

  // The open page is retained HERE rather than in `PageView`: the shell
  // crosses navigations, so it sees the LAST state of the tab, y
  // included returning to the list after trashing. It is
  // `app/(app)/projects/[id]/pages/page.tsx` which rereads it when opened.
  useEffect(() => {
    if (activePageId) rememberLastPage(projectId, activePageId);
  }, [projectId, activePageId]);

  const create = useCallback(
    async (parentId: string | null) => {
      try {
        // The position is calculated by the SERVER (end of siblings): it is
        // the only one to see the pages that this client does not yet have.
        const page = await createPage({ parent_id: parentId });
        // It is in base, but it is not yet acquired: exit without it
        // writing a letter destroys it (lib/pages-draft.ts). Create a page
        // is not saving it.
        markDraftPage(page.id);
        openPage(page.id);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("createFailed"));
      }
    },
    [createPage, openPage, t]
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
    <PagePresenceProvider projectId={projectId} pageId={activePageId}>
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
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(SIDEBAR_COMPACT_CONTROL_CLASS, "-mr-2")}
                aria-label={t("newPage")}
                onClick={() => void create(null)}
              >
                <Plus className="size-[18px]" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("newPage")}</TooltipContent>
          </Tooltip>
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
          <PageView key={activePageId} projectId={projectId} pageId={activePageId} />
        ) : (
          <PagesHome
            projectId={projectId}
            pages={pages}
            byId={byId}
            loading={loading}
            onCreate={() => void create(null)}
          />
        )}
      </div>
    </div>
    </PagePresenceProvider>
  );
}
