"use client";

import { useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, toast } from "mangue-ui";
import { FileText, Plus } from "lucide-react";

import { EmptyScene } from "@/components/empty-scene";
import { usePagesQuery } from "@/lib/use-pages-query";
import { markDraftPage } from "@/lib/pages-draft";
import { readLastPage } from "@/lib/pages-last-open";

/**
 * The Pages tab with no page open (MIN-270).
 *
 * On desktop, the tree is already on the left: this panel therefore has nothing to list, it
 * just says what we can do. Under `md`, the secondary bar occupies the whole
 * the screen and this panel is not rendered — hence the absence of a list here, which
 * would duplicate it everywhere.
 *
 * And before showing it: we REOPEN the last page read. Return to tab
 * to continue what we were writing is the common case; the “choose a
 * page on the left" was then one more click, each time, on a page that we
 * already knew how to want.
 */
export default function ProjectPagesPage() {
  const t = useTranslations("Pages");
  const { id: projectId } = useParams<{ id: string }>();
  const router = useRouter();
  const { pages, byId, loading, createPage } = usePagesQuery(projectId);

  // Only once per assembly: without this lock, return DELIBERATELY to the
  // list (mobile, previous button) would loop through the page.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || loading) return;
    restored.current = true;
    // Under `md`, this screen is not displayed: it is the TREE which occupies the
    // width, and it’s him we want to see when we arrive. Reopen the
    // last page would jump there over the phone's navigation alone.
    if (!window.matchMedia("(min-width: 768px)").matches) return;
    const last = readLastPage(projectId);
    // The page may have since gone to the trash: we do not go to a link
    // dead, and nothing is cleaned — the next page opened will rewrite the entry.
    if (last && byId.has(last)) router.replace(`/projects/${projectId}/pages/${last}`);
  }, [loading, byId, projectId, router]);

  const create = async () => {
    try {
      const page = await createPage({});
      // Created empty: it does not survive a departure without a letter in it.
      markDraftPage(page.id);
      router.push(`/projects/${projectId}/pages/${page.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("createFailed"));
    }
  };

  if (loading) return null;

  return (
    /* The SAME framework as the other four project tabs — tickets, triage,
 objectives, returns: a scrollable area in `px-6 py-8`, content limited to
 `max-w-5xl` and centered horizontally. The empty state was here in the middle
 of the height (`items-center`), and it was the only one: going from Pages to
 Objectives made the illustration jump by a hundred pixels, on screens which only differ by their icon and their sentence. */
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
      <div className="mx-auto max-w-5xl">
        <EmptyScene
          icon={FileText}
          title={pages.length === 0 ? t("emptyTitle") : t("pickTitle")}
        >
          <Button onClick={() => void create()}>
            <Plus className="size-4" />
            {t("newPage")}
          </Button>
        </EmptyScene>
      </div>
    </div>
  );
}
