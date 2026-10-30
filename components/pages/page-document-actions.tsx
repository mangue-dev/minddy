"use client";

import { projectPath } from "@/lib/app-urls";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Copy01Icon, Delete02Icon, Download01Icon, File02Icon, FileDownloadIcon, GlobeIcon, Link01Icon, PrinterIcon, StarIcon, StarOffIcon, TextAlignLeftIcon } from "@hugeicons/core-free-icons";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { ContextMenuAction } from "@/components/issue-context-menu";
import { PagePublishDialog } from "@/components/pages/page-publish-dialog";
import { usePromotePage } from "@/components/pages/page-promotion-context";
import { NumoIcon } from "@/components/numo-icon";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { TRASH_RETENTION_DAYS } from "@/lib/trash-retention";
import { downloadPageExportApi, fetchPageMarkdownApi } from "@/lib/pages-api";
import { descendantIds } from "@/lib/pages";
import { useModShiftShortcut } from "@/lib/keyboard/use-mod-shortcut";
import { trackEvent } from "@/lib/analytics";
import { pageHref } from "@/lib/pages-navigation";
import { useProjectCapabilities } from "@/lib/use-project-capabilities";

export type PageMenuTarget = {
  id: string;
  title: string;
  favorite: boolean;
};

/**
 * Builds the complete page menu for both the sidebar tree and the open page.
 * Keeping structural and document actions together prevents the less frequently
 * opened menu from losing entries over time. Dialog state is held once per menu
 * surface rather than once per page row.
 */
export function usePageDocumentMenu({
  projectId,
  pages,
  onCreateChild,
  onToggleFavorite,
  onTrash,
}: {
  projectId: string;
  /** The flat project tree determines whether branch export actions are useful. */
  pages: readonly { id: string; parent_id: string | null; database_schema?: unknown[] | null }[];
  onCreateChild: (parentId: string) => void;
  onToggleFavorite: (page: PageMenuTarget) => void;
  onTrash: (page: PageMenuTarget) => void;
}): {
  /** `shortcut` is only true for the open page, whose link ⌘⇧L copies. */
  actionsFor: (
    page: PageMenuTarget,
    options?: { shortcut?: boolean }
  ) => ContextMenuAction[];
  /** Open the publishing dialog without going through the menu — what
 the “public” badge in the header does, which is a shortcut to it. */
  openPublish: (page: { id: string; title: string }) => void;
  /** Copy the page's link without going through the menu: what ⌘⇧L does on
      the open page, the same copy as the menu's “Copy link”. */
  copyLink: (
    page: { id: string },
    source: "menu" | "shortcut"
  ) => void;
  /** To be returned once in the area. */
  dialogs: ReactNode;
} {
  const t = useTranslations("Pages");
  const tDatabase = useTranslations("PageDatabase");
  const tCommon = useTranslations("Common");
  // “⌘⇧L” on a Mac, “Ctrl+Shift+L” elsewhere — and the Windows form on
  // rendered server, otherwise the hydration would scream lag. ⇧ is not
  // decorative: ⌘L bare is taken by the browser address bar and
  // never reaches the page (see page-view.tsx).
  const modShortcut = useModShiftShortcut("L");
  // Project readers (MIN-693) keep only reading gestures: copy and export.
  const { canWrite } = useProjectCapabilities(projectId);
  const promotePage = usePromotePage(projectId);
  const [target, setTarget] = useState<{ id: string; title: string } | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  // "Move to trash" from any page menu (tree row, right-click, page header)
  // only names its target here; `onTrash` runs once confirmed (MIN-743).
  const [trashTarget, setTrashTarget] = useState<PageMenuTarget | null>(null);

  const countOf = useCallback(
    (pageId: string) => descendantIds(pages, pageId).length,
    [pages]
  );

  const download = useCallback(
    (pageId: string, branch: boolean) => {
      void downloadPageExportApi(projectId, pageId, { branch }).catch(
        (err: unknown) => {
          toast.error(err instanceof Error ? err.message : t("exportFailed"));
        }
      );
    },
    [projectId, t]
  );

  const print = useCallback(
    (pageId: string, branch: boolean) => {
      trackEvent("page_exported", { format: "pdf" });
      // A separate tab: the print view calls `window.print()`
      // of itself, and we don't make someone lose the page they were reading.
      //
      // `pages-print/<page>` and NOT `pages/<page>/print`: the `pages/` segment
      // carries the layout of the secondary bar, of which the print view does not have
      // what to do (see the route header). The path is his, and
      // the other never existed — he opened a 404.
      window.open(
        `${projectPath(projectId)}/pages-print/${pageId}${branch ? "?scope=branch" : ""}`,
        "_blank",
        "noopener"
      );
    },
    [projectId]
  );

  /**
   * The link of a page, from the origin it is copied on (`window.location`
   * rather than `SITE_URL`): a link copied on a development workstation or in
   * the desktop app must lead back there.
   */
  const copyLink = useCallback(
    (page: { id: string }, source: "menu" | "shortcut") => {
      const link = `${window.location.origin}${pageHref(projectId, page.id)}`;
      void navigator.clipboard.writeText(link).then(
        () => {
          trackEvent("page_copied", { what: "link", source });
          toast.success(t("pageLinkCopied"));
        },
        // Clipboard denied (permission, insecure context): say it rather
        // than suggest the link is copied.
        () => toast.error(t("copyFailed"))
      );
    },
    [projectId, t]
  );

  /**
   * The page as Markdown — its title and body, the single-page export. The
   * export route writes pending collaboration steps first, so the copy holds
   * what was typed a moment ago. The clipboard item takes the PROMISE of the
   * text: Safari only grants the clipboard inside the click, and the read
   * finishes after it.
   */
  const copyContent = useCallback(
    (page: { id: string }) => {
      const markdown = fetchPageMarkdownApi(projectId, page.id);
      const written =
        typeof ClipboardItem === "undefined"
          ? markdown.then((text) => navigator.clipboard.writeText(text))
          : navigator.clipboard.write([
              new ClipboardItem({
                "text/plain": markdown.then(
                  (text) => new Blob([text], { type: "text/plain" })
                ),
              }),
            ]);
      void written.then(
        () => {
          trackEvent("page_copied", { what: "content", source: "menu" });
          toast.success(t("pageContentCopied"));
        },
        () => toast.error(t("copyFailed"))
      );
    },
    [projectId, t]
  );

  const actionsFor = useCallback(
    (
      page: PageMenuTarget,
      options?: { shortcut?: boolean }
    ): ContextMenuAction[] => {
      const count = countOf(page.id);
      const isDatabase = pages.find(candidate => candidate.id === page.id)?.database_schema != null;
      const exportChildren: ContextMenuAction[] = [
        {
          id: "export-md",
          label: isDatabase ? tDatabase("exportArchive") : t("exportMarkdown"),
          icon: <HugeiconsIcon icon={File02Icon} className="size-4" />,
          onSelect: () => download(page.id, false),
        },
        {
          id: "export-pdf",
          label: t("exportPdf"),
          icon: <HugeiconsIcon icon={PrinterIcon} className="size-4" />,
          onSelect: () => print(page.id, false),
        },
      ];
      // Database archives already contain the entire branch.
      if (count > 0) {
        if (!isDatabase) exportChildren.push(
          {
            id: "export-md-branch",
            label: t("exportMarkdownBranch", { count }),
            icon: <HugeiconsIcon icon={FileDownloadIcon} className="size-4" />,
            separatorBefore: true,
            onSelect: () => download(page.id, true),
          },
        );
        exportChildren.push(
          {
            id: "export-pdf-branch",
            label: t("exportPdfBranch", { count }),
            icon: <HugeiconsIcon icon={PrinterIcon} className="size-4" />,
            onSelect: () => print(page.id, true),
          }
        );
      }

      const copyChildren: ContextMenuAction[] = [
        {
          id: "copy-link",
          label: t("copyPageLink"),
          keywords: ["link", "lien", "url", "share", "partager"],
          icon: <HugeiconsIcon icon={Link01Icon} className="size-4" />,
          shortcut: options?.shortcut ? modShortcut : undefined,
          onSelect: () => copyLink(page, "menu"),
        },
      ];
      // A database exports as an archive, not as one Markdown text.
      if (!isDatabase) {
        copyChildren.push({
          id: "copy-content",
          label: t("copyPageContent"),
          keywords: ["markdown", "text", "texte", "content", "contenu"],
          icon: <HugeiconsIcon icon={TextAlignLeftIcon} className="size-4" />,
          onSelect: () => copyContent(page),
        });
      }
      const copyAction: ContextMenuAction = {
        id: "copy",
        label: t("copy"),
        icon: <HugeiconsIcon icon={Copy01Icon} className="size-4" />,
        separatorBefore: canWrite,
        children: copyChildren,
      };
      const exportAction: ContextMenuAction = {
        id: "export",
        label: t("export"),
        icon: <HugeiconsIcon icon={Download01Icon} className="size-4" />,
        children: exportChildren,
      };
      if (!canWrite) return [copyAction, exportAction];

      return [
        {
          id: "new-subpage",
          label: t("newSubpage"),
          icon: <HugeiconsIcon icon={Add01Icon} className="size-4" />,
          onSelect: () => onCreateChild(page.id),
        },
        {
          id: "favorite",
          label: page.favorite ? t("unfavorite") : t("favorite"),
          icon: page.favorite ? (
            <HugeiconsIcon icon={StarOffIcon} className="size-4" />
          ) : (
            <HugeiconsIcon icon={StarIcon} className="size-4" />
          ),
          onSelect: () => onToggleFavorite(page),
        },
        copyAction,
        {
          // The notebook's gesture, for a whole page (MIN-684).
          id: "promote-to-issue",
          label: t("promoteToIssue"),
          keywords: ["ticket", "issue", "promote", "promouvoir", "convertir", "convert", "numo"],
          icon: <NumoIcon animated={false} className="size-4" />,
          onSelect: () => void promotePage(page),
        },
        {
          id: "publish",
          label: t("publish"),
          icon: <HugeiconsIcon icon={GlobeIcon} className="size-4" />,
          onSelect: () => {
            setTarget(page);
            setPublishOpen(true);
          },
        },
        exportAction,
        {
          id: "trash",
          label: t("deletePage"),
          icon: <HugeiconsIcon icon={Delete02Icon} className="size-4" />,
          variant: "destructive",
          separatorBefore: true,
          onSelect: () => setTrashTarget(page),
        },
      ];
    },
    [
      countOf,
      download,
      print,
      copyLink,
      copyContent,
      promotePage,
      modShortcut,
      onCreateChild,
      onToggleFavorite,
      t,
      tDatabase,
      pages,
      canWrite,
    ]
  );

  const dialogs = useMemo(
    () => (
      <>
        {target ? (
          <PagePublishDialog
            projectId={projectId}
            pageId={target.id}
            title={target.title}
            descendantCount={countOf(target.id)}
            open={publishOpen}
            onOpenChange={setPublishOpen}
          />
        ) : null}
        <ConfirmDeleteDialog
          open={trashTarget !== null}
          onOpenChange={(open) => {
            if (!open) setTrashTarget(null);
          }}
          title={t("trashPageTitle", { title: trashTarget?.title.trim() || t("untitled") })}
          description={t("trashPageBody", {
            count: trashTarget ? countOf(trashTarget.id) : 0,
            days: TRASH_RETENTION_DAYS,
          })}
          confirmLabel={tCommon("moveToTrash")}
          cancelLabel={tCommon("cancel")}
          onConfirm={() => {
            if (trashTarget) onTrash(trashTarget);
          }}
        />
      </>
    ),
    [
      trashTarget,
      onTrash,
      tCommon,
      target,
      projectId,
      countOf,
      publishOpen,
      t,
    ]
  );

  const openPublish = useCallback((page: { id: string; title: string }) => {
    // Publishing hands out a link: readers cannot (and do not see share tokens).
    if (!canWrite) return;
    setTarget(page);
    setPublishOpen(true);
  }, [canWrite]);

  return { actionsFor, openPublish, copyLink, dialogs };
}
