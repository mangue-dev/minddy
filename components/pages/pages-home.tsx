"use client";

import { isMobileLayout } from "@/lib/app-layout";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, File02Icon } from "@hugeicons/core-free-icons";
import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Button } from "mangue-ui";
import { PageCreateMenu } from "./page-create-menu";
import { EmptyScene } from "@/components/empty-scene";
import type { PageSummary } from "@/lib/pages-api";
import { pageHref, replacePagesHistory } from "@/lib/pages-navigation";
import { readLastPage } from "@/lib/pages-last-open";

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
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
      <div className="mx-auto max-w-5xl">
        <EmptyScene
          icon={File02Icon}
          title={pages.length === 0 ? t("emptyTitle") : t("pickTitle")}
        >
          <PageCreateMenu onCreate={onCreate} trigger={<Button>
            <HugeiconsIcon icon={Add01Icon} className="size-4" />
            {t("newPage")}
          </Button>} />
        </EmptyScene>
      </div>
    </div>
  );
}
