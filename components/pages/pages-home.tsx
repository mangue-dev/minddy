"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Button } from "mangue-ui";
import { FileText, Plus } from "lucide-react";

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
  onCreate: () => void;
}) {
  const t = useTranslations("Pages");
  const restored = useRef(false);

  useEffect(() => {
    if (restored.current || loading) return;
    restored.current = true;
    if (!window.matchMedia("(min-width: 768px)").matches) return;
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
          icon={FileText}
          title={pages.length === 0 ? t("emptyTitle") : t("pickTitle")}
        >
          <Button onClick={onCreate}>
            <Plus className="size-4" />
            {t("newPage")}
          </Button>
        </EmptyScene>
      </div>
    </div>
  );
}
