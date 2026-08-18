"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "mangue-ui";
import {
  ClipboardCopy,
  Download,
  FileDown,
  FileText,
  Globe,
  Printer,
} from "lucide-react";

import type { ContextMenuAction } from "@/components/issue-context-menu";
import { PagePublishDialog } from "@/components/pages/page-publish-dialog";
import { PageAgentCopyDialog } from "@/components/pages/page-agent-copy-dialog";
import { downloadPageExportApi } from "@/lib/pages-api";
import { descendantIds } from "@/lib/pages";
import { buildPageAgentPrompt } from "@/lib/page-agent-prompt";
import { useModShiftShortcut } from "@/lib/keyboard/use-mod-shortcut";
import { trackEvent } from "@/lib/analytics";

/**
 * What can be done EXIT from a page (MIN-283): publish it, take it away.
 *
 * Written ONCE for its two anchors — the menu ⋯ of a line in the tree, and
 * that of the open page. This is the rule of the repository for everything that opens from
 * two places (see `ContextMenuAction`, components/issue-context-menu): two
 * lists always end up diverging, and it is the one that is opened the least
 * often which keeps the entry out of date.
 *
 * A single DIALOG for an entire tree, and that's the point of the hook: it carries
 * the targeted page in state rather than being mounted per line. A sidebar of one hundred
 * pages would otherwise create one hundred dialogs and one hundred disabled queries.
 *
 * PDF is not another export format: it is the PRINTING of the document,
 * on a view designed for that (app/(app)/projects/[id]/pages-print/[pageId]). A server-side PDF engine would have meant a second definition of the layout to be kept, to produce what the browser already produces. does not take away its content: it gives something to go
 * to read it, plus the instructions of what we want to do with it
 * (lib/page-agent-prompt.ts). It goes through a dialog, like publishing,
 * and for the same reason: it has something to ask before acting.
 */
export function usePageDocumentMenu({
  projectId,
  pages,
}: {
  projectId: string;
  /** The project tree, flat: it gives the number of descendants of a page,
 which is what “with subpages” really means. */
  pages: readonly { id: string; parent_id: string | null }[];
}): {
  /** The “Copy for agent”, “Publish” and “Export” entries for a given
 page.

 `shortcut` is only true for the OPEN page: ⌘⇧L aims at it and
 display the key on the tree line of ANOTHER page would promise a
 gesture that would copy another document. */
  actionsFor: (
    page: { id: string; title: string },
    options?: { shortcut?: boolean }
  ) => ContextMenuAction[];
  /** Open the publishing dialog without going through the menu — what
 the “public” badge in the header does, which is a shortcut to it. */
  openPublish: (page: { id: string; title: string }) => void;
  /** Open “Copy for agent” without going through the menu: this is what
 ⌘⇧L does on the opened page. The SAME dialog as the input, and therefore the same
 copy — two paths to a single gesture, not two gestures. */
  openAgentCopy: (
    page: { id: string; title: string },
    source: "menu" | "shortcut"
  ) => void;
  /** To be returned once in the area. */
  dialogs: ReactNode;
} {
  const t = useTranslations("Pages");
  // “⌘⇧L” on a Mac, “Ctrl+Shift+L” elsewhere — and the Windows form on
  // rendered server, otherwise the hydration would scream lag. ⇧ is not
  // decorative: ⌘L bare is taken by the browser address bar and
  // never reaches the page (see page-view.tsx).
  const modShortcut = useModShiftShortcut("L");
  const [target, setTarget] = useState<{ id: string; title: string } | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  // The page targeted by “Copy for agent”, and where the gesture came from —
  // `source` is only used for measurement, but it must travel with the page:
  // moment of copying, we no longer know where the opening came from.
  const [agentCopy, setAgentCopy] = useState<{
    page: { id: string; title: string };
    source: "menu" | "shortcut";
  } | null>(null);
  // Opening and target are TWO states, as for publication: keep the
  // page after closing lets the dialog play its output instead of
  // disappear suddenly.
  const [agentCopyOpen, setAgentCopyOpen] = useState(false);

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
        `/projects/${projectId}/pages-print/${pageId}${branch ? "?scope=branch" : ""}`,
        "_blank",
        "noopener"
      );
    },
    [projectId]
  );

  const openAgentCopy = useCallback(
    (page: { id: string; title: string }, source: "menu" | "shortcut") => {
      setAgentCopy({ page, source });
      setAgentCopyOpen(true);
    },
    []
  );

  /**
 * The copy itself, once the dialog has been validated — with or without instructions.
 *
 * The origin is the one from which we copy (`window.location.origin`) and not
 * `SITE_URL`: a link copied from the development workstation must bring back au
 * development position, not in production.
 */
  const submitAgentCopy = useCallback(
    async (instructions: string) => {
      if (!agentCopy) return;
      const text = buildPageAgentPrompt({
        origin: window.location.origin,
        projectId,
        pageId: agentCopy.page.id,
        title: agentCopy.page.title,
        instructions,
      });
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // Clipboard denied (permission, insecure context): say it,
        // rather than suggesting that the page is copied.
        toast.error(t("copyFailed"));
        return;
      }
      trackEvent("page_copied_for_agent", {
        source: agentCopy.source,
        with_instructions: !!instructions.trim(),
      });
      toast.success(t("copiedForAgent"));
    },
    [agentCopy, projectId, t]
  );

  const actionsFor = useCallback(
    (
      page: { id: string; title: string },
      options?: { shortcut?: boolean }
    ): ContextMenuAction[] => {
      const count = countOf(page.id);
      const exportChildren: ContextMenuAction[] = [
        {
          id: "export-md",
          label: t("exportMarkdown"),
          icon: <FileText className="size-4" />,
          onSelect: () => download(page.id, false),
        },
        {
          id: "export-pdf",
          label: t("exportPdf"),
          icon: <Printer className="size-4" />,
          onSelect: () => print(page.id, false),
        },
      ];
      // “with subpages” only appears if there are: an entry which
      // would only take away that the page itself is a lying entry.
      if (count > 0) {
        exportChildren.push(
          {
            id: "export-md-branch",
            label: t("exportMarkdownBranch", { count }),
            icon: <FileDown className="size-4" />,
            separatorBefore: true,
            onSelect: () => download(page.id, true),
          },
          {
            id: "export-pdf-branch",
            label: t("exportPdfBranch", { count }),
            icon: <Printer className="size-4" />,
            onSelect: () => print(page.id, true),
          }
        );
      }

      return [
        {
          id: "copy-for-agent",
          label: t("copyForAgent"),
          // What we type while looking for the entry, and which is not in the
          // wording: the protocol, the name of the agent we have in mind, or the
          // word that we use for this on a ticket (“prompt”, “link”).
          keywords: ["mcp", "agent", "link", "lien", "prompt", "claude", "cursor"],
          icon: <ClipboardCopy className="size-4" />,
          shortcut: options?.shortcut ? modShortcut : undefined,
          separatorBefore: true,
          onSelect: () => openAgentCopy(page, "menu"),
        },
        {
          id: "publish",
          label: t("publish"),
          icon: <Globe className="size-4" />,
          onSelect: () => {
            setTarget(page);
            setPublishOpen(true);
          },
        },
        {
          id: "export",
          label: t("export"),
          icon: <Download className="size-4" />,
          children: exportChildren,
        },
      ];
    },
    [countOf, download, print, openAgentCopy, modShortcut, t]
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
        {agentCopy ? (
          <PageAgentCopyDialog
            open={agentCopyOpen}
            pageTitle={agentCopy.page.title.trim() || t("untitled")}
            onOpenChange={setAgentCopyOpen}
            onSubmit={(instructions) => void submitAgentCopy(instructions)}
          />
        ) : null}
      </>
    ),
    [
      target,
      projectId,
      countOf,
      publishOpen,
      agentCopy,
      agentCopyOpen,
      submitAgentCopy,
      t,
    ]
  );

  const openPublish = useCallback((page: { id: string; title: string }) => {
    setTarget(page);
    setPublishOpen(true);
  }, []);

  return { actionsFor, openPublish, openAgentCopy, dialogs };
}
