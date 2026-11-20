"use client";

import { isMobileLayout } from "@/lib/app-layout";
import { useMobileLayout } from "@/lib/use-mobile-layout";
import { openMobilePageList } from "@/lib/mobile-menu-launcher";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, File02Icon } from "@hugeicons/core-free-icons";
import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { PageCreateMenu } from "./page-create-menu";
import { EmptyScene } from "@/components/empty-scene";
import type { PageSummary } from "@/lib/pages-api";
import { pageHref, replacePagesHistory } from "@/lib/pages-navigation";
import { readLastPage } from "@/lib/pages-last-open";
import { useProjectCapabilities } from "@/lib/use-project-capabilities";
import { PageScroll } from "@/components/page-scroll";

export function PagesHome({
  projectId,
  pages,
  byId,
  loading,
  onCreate,
}: {
  projectId: string;
  pages: PageSummary[];
  byId: Map<string, PageSummary>;
  loading: boolean;
  onCreate: (database: boolean) => void;
}) {
  const t = useTranslations("Pages");
  const restored = useRef(false);
  // Project readers (MIN-693) pick a page; they cannot create one.
  const { canWrite } = useProjectCapabilities(projectId);
  // On a phone the list is not on the left but in the navigation sheet.
  const mobile = useMobileLayout() === true;

  useEffect(() => {
    if (restored.current || loading) return;
    restored.current = true;
    if (isMobileLayout()) return;
    const last = readLastPage(projectId);
    if (last && byId.has(last)) {
      replacePagesHistory(pageHref(projectId, last));
    }
  }, [loading, byId, projectId]);

  if (loading) return null;

  return (
    <PageScroll className="px-6 py-8">
      <div className="mx-auto max-w-content">
        <EmptyScene
          icon={File02Icon}
          title={pages.length === 0 ? t("emptyTitle") : mobile ? t("pickTitleMobile") : t("pickTitle")}
        >
          {mobile && pages.length > 0 && (
            <Button variant={canWrite ? "outline" : "default"} onClick={openMobilePageList}>{t("showPages")}</Button>
          )}
          {canWrite && (
            <PageCreateMenu onCreate={onCreate} trigger={<Button>
              <HugeiconsIcon icon={Add01Icon} className="size-4" />
              {t("newPage")}
            </Button>} />
          )}
        </EmptyScene>
      </div>
    </PageScroll>
  );
}
