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
 *
 * S'y ajoute « COPIER POUR L'AGENT » — la troisième façon de faire sortir une
 * page, et la seule qui n'emporte pas son contenu : elle donne de quoi aller
 * le lire, plus la consigne de ce qu'on veut en faire
 * (lib/page-agent-prompt.ts). Elle passe par un dialog, comme la publication,
 * et pour la même raison : elle a quelque chose à demander avant d'agir.
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
  /** Les entrées « Copier pour l'agent », « Publier » et « Exporter » pour une
      page donnée.

      `shortcut` n'est vrai que pour la page OUVERTE : ⌘⇧L la vise, elle, et
      afficher la touche sur la ligne d'arbre d'une AUTRE page promettrait un
      geste qui copierait un autre document. */
  actionsFor: (
    page: { id: string; title: string },
    options?: { shortcut?: boolean }
  ) => ContextMenuAction[];
  /** Ouvrir le dialogue de publication sans passer par le menu — ce que fait
      la pastille « publique » de l'en-tête, qui est un raccourci vers lui. */
  openPublish: (page: { id: string; title: string }) => void;
  /** Ouvrir « Copier pour l'agent » sans passer par le menu : c'est ce que fait
      ⌘⇧L sur la page ouverte. Le MÊME dialog que l'entrée, et donc la même
      copie — deux chemins vers un seul geste, pas deux gestes. */
  openAgentCopy: (
    page: { id: string; title: string },
    source: "menu" | "shortcut"
  ) => void;
  /** À rendre une fois dans la surface. */
  dialogs: ReactNode;
} {
  const t = useTranslations("Pages");
  // « ⌘⇧L » sur un Mac, « Ctrl+Shift+L » ailleurs — et la forme Windows au
  // rendu serveur, sans quoi l'hydratation crierait au décalage. ⇧ n'est pas
  // décoratif : ⌘L nu est pris par la barre d'adresse du navigateur et
  // n'atteint jamais la page (voir page-view.tsx).
  const modShortcut = useModShiftShortcut("L");
  const [target, setTarget] = useState<{ id: string; title: string } | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  // La page visée par « Copier pour l'agent », et par où le geste est arrivé —
  // `source` ne sert qu'à la mesure, mais il doit voyager avec la page : au
  // moment de la copie, on ne sait plus d'où venait l'ouverture.
  const [agentCopy, setAgentCopy] = useState<{
    page: { id: string; title: string };
    source: "menu" | "shortcut";
  } | null>(null);
  // Ouverture et cible sont DEUX états, comme pour la publication : garder la
  // page après la fermeture laisse le dialog jouer sa sortie au lieu de
  // disparaître d'un coup.
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

  const openAgentCopy = useCallback(
    (page: { id: string; title: string }, source: "menu" | "shortcut") => {
      setAgentCopy({ page, source });
      setAgentCopyOpen(true);
    },
    []
  );

  /**
   * La copie elle-même, une fois le dialog validé — avec ou sans consigne.
   *
   * L'origine est celle d'où l'on copie (`window.location.origin`) et non
   * `SITE_URL` : un lien copié depuis le poste de développement doit ramener au
   * poste de développement, pas en production.
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
        // Presse-papiers refusé (permission, contexte non sécurisé) : le dire,
        // plutôt que laisser croire que la page est copiée.
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
          id: "copy-for-agent",
          label: t("copyForAgent"),
          // Ce qu'on tape en cherchant l'entrée, et qui n'est pas dans le
          // libellé : le protocole, le nom de l'agent qu'on a en tête, ou le
          // mot qu'on emploie pour ça sur un ticket (« prompt », « lien »).
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
