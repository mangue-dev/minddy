"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Collapsible, CollapsibleContent, CollapsibleTrigger, cn } from "mangue-ui";
import { ChevronRight } from "lucide-react";
import type { AgentFileChange } from "@/lib/agent-api";
import { changeTotals, prFileStatus } from "@/lib/agent-changed-files";
import {
  DiffCounters,
  DiffStatBar,
  FilePathLabel,
  FileStatusIcon,
} from "@/components/pull-requests/pr-file-marks";

/**
 * Bloc « fichiers changés » compact et repliable (MIN-46, note « diff par tour »),
 * rendu dans le fil sous la réponse d'un tour. `onOpenFile` rend les lignes
 * cliquables (vers la vue diff de la session, dans la conversation — PR ou pas).
 *
 * **Il parle la langue des diffs de PR**, et pas la sienne. Il écrivait avant une
 * phrase en texte plat — « modifié app/(app)/agents/page.tsx », tout en gris,
 * sans mono — là où la vue diff, l'arbre des fichiers et l'en-tête d'une carte de
 * fichier disent la même chose autrement : une icône colorée pour la nature du
 * changement, le chemin en mono avec le dossier éteint, les compteurs à droite.
 * Les autres surfaces s'accordaient ; celle-ci détonnait, alors qu'un clic dessus
 * mène précisément à elles. Les marques viennent maintenant du même endroit
 * ([pr-file-marks](../pull-requests/pr-file-marks.tsx)).
 *
 * Les compteurs se taisent quand ils valent zéro : en vue LIVE, git n'a pas
 * encore compté, et « +0 −0 » sur chaque ligne se lirait comme une mesure.
 */

/**
 * Une ligne de fichier respire comme les lignes de liste du reste de minddy
 * (32 px de haut, `px-2 py-2`) et non comme une ligne de diff. Ce bloc n'est pas
 * un diff : il compte rarement plus d'une dizaine d'entrées, et chacune est une
 * cible de clic — la densité de l'arbre d'une PR de quarante fichiers y serait
 * un tassement, pas un gain.
 */
const ROW_CLASS = "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left";

function FileRow({
  file,
  onOpenFile,
}: {
  file: AgentFileChange;
  onOpenFile?: (path: string) => void;
}) {
  const inner = (
    <>
      <FileStatusIcon status={prFileStatus(file.status)} />
      <FilePathLabel path={file.path} previousPath={file.previousPath} />
      <DiffCounters additions={file.additions} deletions={file.deletions} hideEmpty />
    </>
  );

  if (onOpenFile) {
    return (
      <button
        type="button"
        onClick={() => onOpenFile(file.path)}
        className={cn(
          ROW_CLASS,
          "outline-none transition-colors hover:bg-muted focus-visible:bg-muted",
        )}
      >
        {inner}
      </button>
    );
  }
  return <div className={ROW_CLASS}>{inner}</div>;
}

export function ChangedFilesBlock({
  files,
  label,
  truncated = false,
  defaultOpen = false,
  live = false,
  action,
  onOpenFile,
  className,
}: {
  files: AgentFileChange[];
  /** Libellé du bloc, déjà localisé avec le décompte (ex. « 3 fichiers modifiés »). */
  label: string;
  truncated?: boolean;
  defaultOpen?: boolean;
  /** Vue live : titre qui shimmer (travail en cours). */
  live?: boolean;
  /** Bloc d'action à droite de l'en-tête (ex. bouton « créer la PR »). */
  action?: ReactNode;
  onOpenFile?: (path: string) => void;
  className?: string;
}) {
  const t = useTranslations("Agent");
  const [open, setOpen] = useState(defaultOpen);
  if (files.length === 0) return null;
  const { additions, deletions } = changeTotals(files);

  return (
    <div className={cn("rounded-xl border border-border bg-card", className)}>
      <Collapsible open={open} onOpenChange={setOpen}>
        {/* Même respiration que les autres cartes du fil (le bloc « plan », les
            cartes de fichier d'un diff) : 12 px sur les côtés, 10 px en haut. */}
        <div className="flex items-center gap-2 px-3 py-2.5">
          <CollapsibleTrigger className="group flex min-w-0 flex-1 items-center gap-1.5 text-xs font-medium text-muted-foreground outline-hidden transition-colors hover:text-foreground">
            <ChevronRight className="size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
            <span className={cn("truncate", live && "text-shimmer")}>{label}</span>
            <DiffCounters additions={additions} deletions={deletions} hideEmpty />
            {/* La barre replie le tour en une image : replié, le bloc dit déjà
                si l'agent a étoffé ou réécrit. Muette tant que git n'a pas
                compté — cinq blocs gris ne diraient rien. */}
            {additions + deletions > 0 ? (
              <DiffStatBar additions={additions} deletions={deletions} />
            ) : null}
          </CollapsibleTrigger>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
        <CollapsibleContent>
          {/* La liste garde son propre retrait (`px-1.5`) : les lignes sont des
              cibles de clic, et leur surbrillance doit s'arrêter avant le bord
              de la carte plutôt que de venir buter contre lui. */}
          <div className="flex flex-col px-1.5 pb-2">
            {files.map((f) => (
              <FileRow key={`${f.status}:${f.path}`} file={f} onOpenFile={onOpenFile} />
            ))}
            {truncated ? (
              <p className="px-2 pt-1.5 text-[11px] text-muted-foreground">
                {t("filesListTruncated")}
              </p>
            ) : null}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
