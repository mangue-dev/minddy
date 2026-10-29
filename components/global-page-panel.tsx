"use client";

// A page opened from a link anywhere in the app (MIN-777): read in a side
// panel above the current screen, expanded to the full page on request.
//
// A database opens here too, with the compact toolbar of
// components/pages/page-database-view.tsx. What is opened from the panel's own
// document (a subpage, an entry of its table) replaces it in place, and Back
// returns along that trail; the pages screen previews entries beside their
// table instead, but the panel has no second panel to put beside itself.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  // The pages opened from the panel's own document, the shown one last.
  const [trail, setTrail] = useState([pageId]);
  const openId = trail[trail.length - 1];
  const page = byId.get(openId);
  const flush = useRef<() => Promise<boolean>>(async () => true);
  const registerFlush = useCallback((next: () => Promise<boolean>) => {
    flush.current = next;
  }, []);

  useEffect(() => {
    if (!open || loading) return;
    // The page is already the screen underneath: nothing to open beside it.
    if (window.location.pathname === pageHref(projectId, openId)) onClose();
  }, [open, loading, projectId, openId, onClose]);

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

  // Moving within the panel saves first, as leaving it does.
  const go = useCallback(async (next: (trail: string[]) => string[]) => {
    if (await flush.current()) setTrail(next);
  }, []);

  const showsDocument = !loading;
  // The page's menu sits in the panel's header; a trashed page closes it.
  const [menuSlot, setMenuSlot] = useState<HTMLElement | null>(null);
  const panelMenu = useMemo(() => ({ slot: menuSlot, onTrashed: onClose }), [menuSlot, onClose]);
  return (
    <PagePeekPanel
      open={open}
      title={page?.title.trim() || t("untitled")}
      expandLabel={t("expand")}
      onExpand={() => void leave(() => openFullPage(projectId, openId))}
      onClose={() => void leave()}
      onBack={trail.length > 1 ? () => void go((current) => current.slice(0, -1)) : undefined}
      actionsSlot={showsDocument ? setMenuSlot : undefined}
    >
      {showsDocument ? (
        <PageView
          panel
          panelMenu={panelMenu}
          key={openId}
          projectId={projectId}
          pageId={openId}
          onNavigationReady={registerFlush}
          onNavigate={(id) => {
            if (id !== openId) void go((current) => [...current, id]);
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
