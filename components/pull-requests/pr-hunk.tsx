"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { cn, useIsMobile, useTheme } from "mangue-ui";
import { ChevronDown, ChevronRight } from "lucide-react";
import { parsePatchFiles } from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";
import type { FileDiff as FileDiffInstance, PostRenderPhase } from "@pierre/diffs";
import { PrDiffWorkers } from "@/components/pull-requests/pr-diff-workers";
import { DIFF_LINE_DIFF_TYPE, DIFF_THEMES } from "@/lib/diff-theme";
import { hunkPatch } from "@/lib/pr-diff-hunk";

/**
 * L'extrait de code d'un commentaire de review — le `diff_hunk` que la forge
 * livre avec la remarque — rendu comme l'onglet Fichiers rend le code : sous un
 * en-tête de fichier repliable, coloré par Shiki, en mode diff.
 *
 * Il existe parce que ce même extrait se rendait à la main partout ailleurs :
 * un pavé monospace sans coloration dans le fil d'activité, un `<pre>` du hunk
 * BRUT (en-tête `@@` compris) dans le repli des fils périmés. Trois rendus pour
 * un même objet, dont deux qui ne ressemblaient pas à la vue de code de la page
 * d'à côté — alors qu'un commentaire de ligne parle exactement du même code.
 *
 * Le rendu passe donc par la lib de diff, comme `pr-diff` : mêmes thèmes, même
 * marquage mot-à-mot, même pool de workers. Ce que ça demande, c'est de rendre au
 * fragment le fichier qui l'entoure — c'est le travail de `hunkPatch`.
 *
 * Ce qui n'est PAS repris de l'onglet Fichiers, et délibérément : le « + » de
 * gouttière (on ne commente pas depuis un extrait — c'est le rôle du diff, à sa
 * ligne), le dépliage du contexte (un extrait n'a pas de fichier autour de lui à
 * charger) et la bascule unifié ↔ côte-à-côte (quatre lignes en deux colonnes
 * n'apprennent rien).
 */
export function PrHunk({
  path,
  diffHunk,
  line,
  maxLines,
  className,
}: {
  /** Chemin du fichier commenté — il porte l'ancre ET décide de la grammaire. */
  path: string;
  /** Le fragment de la forge. GitLab n'en sert aucun : l'en-tête reste seul. */
  diffHunk?: string | null;
  /** Ligne visée, quand on la connaît — elle complète l'ancre de l'en-tête. */
  line?: number | null;
  /** Nombre de lignes gardées (les dernières). `0` = tout le hunk. */
  maxLines?: number;
  className?: string;
}) {
  const t = useTranslations("PullRequests");
  const { resolvedTheme } = useTheme();
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(false);

  /**
   * Le fragment, analysé une fois. `null` quand il n'y a pas de hunk, ou quand la
   * lib n'y reconnaît pas un fichier — l'en-tête tient alors seul l'information,
   * comme avant, plutôt que d'afficher une boîte vide.
   */
  const fileDiff = useMemo(() => {
    const patch = hunkPatch(path, diffHunk ?? "", maxLines);
    if (!patch) return null;
    const [parsed] = parsePatchFiles(patch);
    return parsed?.files[0] ?? null;
  }, [path, diffHunk, maxLines]);

  /**
   * Le même nettoyage d'ombre que `pr-diff`, et pour la même raison : la lib vide
   * son `<pre>` au démontage mais le LAISSE dans le Shadow DOM, où son `hydrate`
   * suivant le prend pour un rendu déjà peint. En développement, `reactStrictMode`
   * remonte sur le même noeud — l'extrait naîtrait vide.
   */
  const onPostRender = useCallback(
    (node: HTMLElement, _instance: FileDiffInstance, phase: PostRenderPhase) => {
      if (phase === "unmount") node.shadowRoot?.replaceChildren();
    },
    [],
  );

  const options = useMemo(
    () => ({
      theme: DIFF_THEMES,
      themeType: resolvedTheme,
      diffStyle: "unified" as const,
      // Même règle que l'onglet Fichiers : on défile, sauf sur un écran assez
      // étroit pour qu'un défilement ne montre plus jamais une ligne entière.
      overflow: isMobile ? ("wrap" as const) : ("scroll" as const),
      // L'en-tête est le nôtre — c'est lui qui replie.
      disableFileHeader: true,
      // `simple` ne pose un séparateur qu'ENTRE deux hunks, et un extrait n'en a
      // qu'un : rien ne s'affiche. `line-info` annoncerait « N lignes non
      // modifiées » avec la flèche qui va avec, pour un dépliage qui n'existe pas
      // ici (pas de `loadDiffFiles` : il n'y a pas de fichier autour à charger).
      hunkSeparators: "simple" as const,
      lineDiffType: DIFF_LINE_DIFF_TYPE,
      onPostRender,
    }),
    [resolvedTheme, isMobile, onPostRender],
  );

  // Le dossier s'efface, le nom du fichier porte — le partage de `pr-diff`.
  const slash = path.lastIndexOf("/");
  const dir = slash === -1 ? "" : path.slice(0, slash + 1);
  const name = slash === -1 ? path : path.slice(slash + 1);

  // L'ancre, peinte en deux morceaux. Le deux-points n'est pas du texte à
  // traduire : les deux catalogues écrivent `{path}:{line}`, et c'est cette
  // forme-là qu'on assemble ici pour pouvoir estomper le dossier.
  const anchor = (
    <span className="min-w-0 flex-1 truncate font-mono text-xs">
      <span className="text-muted-foreground">{dir}</span>
      <span className="font-medium text-foreground">{name}</span>
      {line != null ? <span className="text-muted-foreground">:{line}</span> : null}
    </span>
  );
  const title = line != null ? t("staleAnchor", { path, line }) : path;

  // Sans extrait (GitLab n'en sert aucun), l'en-tête n'a plus rien à replier :
  // il redevient une ligne d'ancre, sans chevron ni geste. Un bouton qui ne fait
  // rien est pire qu'une étiquette.
  if (!fileDiff) {
    return (
      <div className={cn("px-2.5 py-1.5", className)} title={title}>
        {anchor}
      </div>
    );
  }

  return (
    <div className={cn("pr-diff-view overflow-clip", className)}>
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
        title={title}
        className={cn(
          "flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left outline-none transition-colors hover:bg-muted/60",
          collapsed ? null : "border-b border-border",
        )}
      >
        {collapsed ? (
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        {anchor}
      </button>
      {collapsed ? null : (
        <PrDiffWorkers>
          <FileDiff fileDiff={fileDiff} options={options} />
        </PrDiffWorkers>
      )}
    </div>
  );
}
