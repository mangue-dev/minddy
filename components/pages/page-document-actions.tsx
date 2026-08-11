"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "mangue-ui";
import { Download, FileDown, FileText, Globe, Printer } from "lucide-react";

import type { ContextMenuAction } from "@/components/issue-context-menu";
import { PagePublishDialog } from "@/components/pages/page-publish-dialog";
import { downloadPageExportApi } from "@/lib/pages-api";
import { descendantIds } from "@/lib/pages";
import { trackEvent } from "@/lib/analytics";

/**
 * Ce qu'on peut faire SORTIR d'une page (MIN-283) : la publier, l'emporter.
 *
 * Écrit UNE fois pour ses deux ancrages — le menu ⋯ d'une ligne de l'arbre, et
 * celui de la page ouverte. C'est la règle du dépôt pour tout ce qui s'ouvre de
 * deux endroits (cf. `ContextMenuAction`, components/issue-context-menu) : deux
 * listes finissent toujours par diverger, et c'est celle qu'on ouvre le moins
 * souvent qui garde l'entrée périmée.
 *
 * Un seul DIALOGUE pour tout un arbre, et c'est le point du crochet : il porte
 * la page visée en état plutôt que d'être monté par ligne. Une sidebar de cent
 * pages monterait sinon cent dialogues et cent requêtes désactivées.
 *
 * Le PDF n'est pas un format d'export de plus : c'est l'IMPRESSION du document,
 * sur une vue faite pour ça (app/(app)/projects/[id]/pages-print/[pageId]). Un
 * moteur PDF côté serveur aurait voulu dire une seconde définition de la mise
 * en page à tenir, pour produire ce que le navigateur produit déjà.
 */
export function usePageDocumentMenu({
  projectId,
  pages,
}: {
  projectId: string;
  /** L'arbre du projet, à plat : il donne le nombre de descendants d'une page,
      qui est ce que « avec les sous-pages » emporte vraiment. */
  pages: readonly { id: string; parent_id: string | null }[];
}): {
  /** Les entrées « Publier » et « Exporter » pour une page donnée. */
  actionsFor: (page: { id: string; title: string }) => ContextMenuAction[];
  /** Ouvrir le dialogue de publication sans passer par le menu — ce que fait
      la pastille « publique » de l'en-tête, qui est un raccourci vers lui. */
  openPublish: (page: { id: string; title: string }) => void;
  /** À rendre une fois dans la surface. */
  dialogs: ReactNode;
} {
  const t = useTranslations("Pages");
  const [target, setTarget] = useState<{ id: string; title: string } | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);

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
      // Un onglet à part : la vue d'impression appelle `window.print()`
      // d'elle-même, et on ne fait pas perdre à quelqu'un la page qu'il lisait.
      //
      // `pages-print/<page>` et NON `pages/<page>/print` : le segment `pages/`
      // porte le layout de la barre secondaire, dont la vue d'impression n'a
      // que faire (cf. l'en-tête de la route). Le chemin est le sien, et
      // l'autre n'a jamais existé — il ouvrait un 404.
      window.open(
        `/projects/${projectId}/pages-print/${pageId}${branch ? "?scope=branch" : ""}`,
        "_blank",
        "noopener"
      );
    },
    [projectId]
  );

  const actionsFor = useCallback(
    (page: { id: string; title: string }): ContextMenuAction[] => {
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
      // « avec les sous-pages » n'apparaît que s'il y en a : une entrée qui
      // n'emporterait que la page elle-même est une entrée qui ment.
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
          id: "publish",
          label: t("publish"),
          icon: <Globe className="size-4" />,
          separatorBefore: true,
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
    [countOf, download, print, t]
  );

  const dialogs = useMemo(
    () =>
      target ? (
        <PagePublishDialog
          projectId={projectId}
          pageId={target.id}
          title={target.title}
          descendantCount={countOf(target.id)}
          open={publishOpen}
          onOpenChange={setPublishOpen}
        />
      ) : null,
    [target, projectId, countOf, publishOpen]
  );

  const openPublish = useCallback((page: { id: string; title: string }) => {
    setTarget(page);
    setPublishOpen(true);
  }, []);

  return { actionsFor, openPublish, dialogs };
}
