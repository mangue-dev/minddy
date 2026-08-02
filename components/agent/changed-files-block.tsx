"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Collapsible, CollapsibleContent, CollapsibleTrigger, cn } from "mangue-ui";
import { ChevronRight } from "lucide-react";
import type { AgentFileChange } from "@/lib/agent-api";
import { changeTotals } from "@/lib/agent-changed-files";

/**
 * Bloc « fichiers changés » compact et repliable (MIN-46, note « diff par tour »).
 * Une pastille de statut (A/M/D/R colorée), le chemin en mono, et les compteurs
 * +/− quand ils sont connus (vue autoritaire ; masqués en vue live où git n'a pas
 * encore compté). Réutilisé tel quel :
 *  • dans le fil, SETTLED sous la réponse d'un tour ;
 *  • au-dessus du composer, LIVE pendant le travail, ou au repos avec le bouton
 *    « créer une pull request » passé en `action`.
 * `onOpenFile` rend les lignes cliquables (vers la vue diff de la session, dans
 * la conversation — PR ou pas).
 */

function FileRow({
  file,
  onOpenFile,
}: {
  file: AgentFileChange;
  onOpenFile?: (path: string) => void;
}) {
  const t = useTranslations("Agent");
  const statusLabel = t(`fileStatus_${file.status}` as "fileStatus_added");

  const inner = (
    <>
      {/* Action + chemin comme une SEULE phrase, en couleur normale (façon Codex) :
          « créé lib/… », « modifié app/… ». Pas de badge, pas de couleur par action. */}
      <span
        className="min-w-0 flex-1 truncate text-xs text-muted-foreground"
        title={file.previousPath ? t("renamedFrom", { path: file.previousPath }) : file.path}
      >
        {statusLabel} {file.path}
      </span>
      {file.additions > 0 ? (
        <span className="shrink-0 text-[11px] tabular-nums text-emerald-600 dark:text-emerald-400">
          +{file.additions}
        </span>
      ) : null}
      {file.deletions > 0 ? (
        <span className="shrink-0 text-[11px] tabular-nums text-red-600 dark:text-red-400">
          −{file.deletions}
        </span>
      ) : null}
    </>
  );

  if (onOpenFile) {
    return (
      <button
        type="button"
        onClick={() => onOpenFile(file.path)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:bg-muted/60"
      >
        {inner}
      </button>
    );
  }
  return <div className="flex items-center gap-2 px-2 py-1">{inner}</div>;
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
        <div className="flex items-center gap-2 px-2.5 py-2">
          <CollapsibleTrigger className="group flex min-w-0 flex-1 items-center gap-1.5 text-xs font-medium text-muted-foreground outline-hidden transition-colors hover:text-foreground">
            <ChevronRight className="size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
            <span className={cn("truncate", live && "text-shimmer")}>{label}</span>
            {additions > 0 ? (
              <span className="shrink-0 text-[11px] tabular-nums text-emerald-600 dark:text-emerald-400">
                +{additions}
              </span>
            ) : null}
            {deletions > 0 ? (
              <span className="shrink-0 text-[11px] tabular-nums text-red-600 dark:text-red-400">
                −{deletions}
              </span>
            ) : null}
          </CollapsibleTrigger>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
        <CollapsibleContent>
          <div className="flex flex-col px-1 pb-1.5">
            {files.map((f) => (
              <FileRow key={`${f.status}:${f.path}`} file={f} onOpenFile={onOpenFile} />
            ))}
            {truncated ? (
              <p className="px-2 pt-1 text-[11px] text-muted-foreground">{t("filesListTruncated")}</p>
            ) : null}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
