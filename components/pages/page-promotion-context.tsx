"use client";

// Promote a whole page to an issue (MIN-684), from the tree, the open page's
// More menu or a database row. Like the notebook, promotion is a conversation:
// Numo reads the page, asks when it is unclear, then creates the issue. The
// page itself is kept and attached to the new issue.
//
// The menus that offer the action are not the editor that holds the page's
// pending edits: the tree can promote a page that is open next to it. Mounted
// editors therefore register here, keyed by page, and promotion waits for the
// targeted page's writes before Numo reads it.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useAssistantPanelActions } from "@/lib/assistant-panel-context";

export type PagePromotionSource = {
  /** The displayed title, so the one that may have just been typed. */
  title: () => string;
  /** Write what is pending; false when the page could not be saved. */
  prepare: () => Promise<boolean>;
};

type Registry = Map<string, Set<PagePromotionSource>>;

const PagePromotionContext = createContext<Registry | null>(null);

/** One registry per pages shell: the tree, retained documents and the
 * database preview all promote through it. */
export function PagePromotionProvider({ children }: { children: ReactNode }) {
  const [registry] = useState<Registry>(() => new Map());
  return (
    <PagePromotionContext.Provider value={registry}>
      {children}
    </PagePromotionContext.Provider>
  );
}

/**
 * Declare a mounted editor of `pageId`. The registration follows the effects:
 * a document hidden by its retaining Activity, or unmounted, stops answering.
 */
export function useRegisterPagePromotionSource(
  pageId: string,
  source: PagePromotionSource
) {
  const registry = useContext(PagePromotionContext);
  const latest = useRef(source);
  useEffect(() => {
    latest.current = source;
  });
  useEffect(() => {
    if (!registry) return;
    // A stable entry whose calls reach the latest callbacks.
    const entry: PagePromotionSource = {
      title: () => latest.current.title(),
      prepare: () => latest.current.prepare(),
    };
    const sources = registry.get(pageId) ?? new Set();
    sources.add(entry);
    registry.set(pageId, sources);
    return () => {
      sources.delete(entry);
      if (sources.size === 0 && registry.get(pageId) === sources) {
        registry.delete(pageId);
      }
    };
  }, [registry, pageId]);
}

/**
 * Open Numo on one page of `projectId`, with that page as explicit context —
 * never the ambient open page. A page that is not open is passed by id and
 * read by Numo; an open one is saved first, and a failed save stops here.
 */
export function usePromotePage(projectId: string) {
  const t = useTranslations("Pages");
  const registry = useContext(PagePromotionContext);
  const { openIntent } = useAssistantPanelActions();
  // A second click while the first one is still saving does not open twice.
  const preparing = useRef(false);

  return useCallback(
    async (page: { id: string; title: string }) => {
      if (preparing.current) return;
      preparing.current = true;
      const sources = [...(registry?.get(page.id) ?? [])];
      try {
        const saved = await Promise.all(sources.map((source) => source.prepare()));
        if (saved.includes(false)) {
          toast.error(t("saveFailed"));
          return;
        }
      } catch {
        toast.error(t("saveFailed"));
        return;
      } finally {
        preparing.current = false;
      }
      const title =
        (sources.at(-1)?.title() ?? page.title).trim() || t("untitled");
      openIntent({
        source: "page",
        action: "promote",
        projectId,
        prompt: t("promotePagePrompt", { page: title }),
        pageContext: { projectId, pageId: page.id, pageTitle: title },
      });
    },
    [registry, projectId, openIntent, t]
  );
}
