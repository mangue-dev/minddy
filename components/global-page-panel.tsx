"use client";

// A page opened from a link anywhere in the app (MIN-777): read in a side
// panel above the current screen, expanded to the full page on request.
//
// The database rule lives here and nowhere else: a database page is a table,
// not a document to read beside something, so it never stays in the panel.
// Callers only know an id; the project's page list knows what it is.

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { PageView } from "@/components/pages/page-view";
import { PagePeekPanel } from "@/components/pages/page-peek-panel";
import { Spinner } from "@/components/ui/spinner";
import { usePagesQuery } from "@/lib/use-pages-query";
import { useAppNavigation, useAppRouter } from "@/lib/use-app-router";
import { pageHref, pagesHref, pushPagesHistory } from "@/lib/pages-navigation";

/** Opens a page's full screen, keeping the pages shell's client router when
 * it is already the current screen. */
function useOpenFullPage() {
  const router = useAppRouter();
  const openDestination = useAppNavigation();
  const pathname = usePathname();
  return useCallback(
    (projectId: string, pageId: string) => {
      const href = pageHref(projectId, pageId);
      const base = pagesHref(projectId);
      if (pathname === base || pathname.startsWith(`${base}/`)) {
        openDestination(href, () => pushPagesHistory(href));
      } else {
        router.push(href);
      }
    },
    [router, openDestination, pathname],
  );
}

export function GlobalPagePanel({
  projectId,
  pageId,
  open = true,
  onClose,
}: {
  projectId: string;
  pageId: string;
  /** False while the host keeps the panel mounted for its exit animation. */
  open?: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("Pages");
  const openFullPage = useOpenFullPage();
  const { byId, loading } = usePagesQuery(projectId);
  // A subpage opened from the panel's own document replaces it in place.
  const [openId, setOpenId] = useState(pageId);
  const page = byId.get(openId);
  const isDatabase = page?.database_schema != null;
  const flush = useRef<() => Promise<boolean>>(async () => true);
  const registerFlush = useCallback((next: () => Promise<boolean>) => {
    flush.current = next;
  }, []);

  useEffect(() => {
    if (!open || loading) return;
    if (isDatabase) {
      onClose();
      openFullPage(projectId, openId);
    } else if (window.location.pathname === pageHref(projectId, openId)) {
      // The page is already the screen underneath: nothing to open beside it.
      onClose();
    }
  }, [open, loading, isDatabase, projectId, openId, onClose, openFullPage]);

  // Every way out first saves what was typed in the panel, as the database
  // preview does: a refused write keeps the panel open on its error.
  const leave = useCallback(
    async (then?: () => void) => {
      if (!(await flush.current())) return;
      onClose();
      then?.();
    },
    [onClose],
  );

  const showsDocument = !loading && !isDatabase;
  return (
    <PagePeekPanel
      open={open}
      title={page?.title.trim() || t("untitled")}
      expandLabel={t("expand")}
      onExpand={() => void leave(() => openFullPage(projectId, openId))}
      onClose={() => void leave()}
    >
      {showsDocument ? (
        <PageView
          panel
          key={openId}
          projectId={projectId}
          pageId={openId}
          onNavigationReady={registerFlush}
          onNavigate={(id, databaseId) => {
            void (async () => {
              if (!(await flush.current())) return;
              // An entry opened from a table, or a database: the full screen.
              if (databaseId || byId.get(id)?.database_schema != null) {
                onClose();
                openFullPage(projectId, id);
              } else {
                setOpenId(id);
              }
            })();
          }}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center py-16">
          <Spinner />
        </div>
      )}
    </PagePeekPanel>
  );
}
