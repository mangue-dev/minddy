"use client";

import { useTranslations } from "next-intl";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Spinner,
} from "mangue-ui";
import { PrDiff } from "@/components/pull-requests/pr-diff";
import { useAgentRunDiffQuery } from "@/lib/use-agent-runs";

/**
 * Vue diff DANS la conversation de l'agent : les modifications de la session sans
 * quitter le fil ni attendre la PR. Ouverte en cliquant un fichier des blocs
 * « fichiers changés » (barre live comme fil), dans un Sheet posé PAR-DESSUS la
 * conversation — qui vit elle-même parfois en Sheet (modal d'issue) : Radix
 * empile.
 *
 * Contenu = le diff VIVANT servi par /api/agent-runs/[runId]/diff : la PR quand
 * elle existe, sinon le compare base...branche de travail. C'est le travail
 * POUSSÉ — l'agent pousse à chaque fin de tour, le diff suit à cette cadence
 * (re-poll tant qu'il travaille) ; le live du tour en cours reste la barre de
 * fichiers. Lecture seule : la review (commentaires ancrés) vit sur la page
 * Pull requests.
 */
export function AgentDiffSheet({
  runId,
  open,
  onOpenChange,
  working,
  baseBranch,
  branchName,
}: {
  runId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** L'agent travaille : le diff se re-poll (il avance à chaque fin de tour). */
  working: boolean;
  /** Branche d'origine → branche de session, affichées sous le titre. */
  baseBranch: string | null;
  branchName: string | null;
}) {
  const t = useTranslations("Agent");
  const { files, provider, url, loading } = useAgentRunDiffQuery(runId, open, working);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* Largeur forcée en `!` : les classes par défaut du Sheet (`data-[side=right]:w-3/4`,
          `…sm:max-w-sm`) portent une spécificité supérieure — sans important, la vue
          diff retomberait sur max-w-sm, illisible pour un diff. */}
      <SheetContent
        side="right"
        className="flex !w-full flex-col gap-0 sm:!w-[92%] sm:!max-w-[880px]"
      >
        <SheetHeader className="shrink-0 border-b border-border pr-12">
          <SheetTitle>{t("diffTitle")}</SheetTitle>
          {branchName ? (
            <SheetDescription className="truncate font-mono text-xs">
              {baseBranch ? `${baseBranch} → ${branchName}` : branchName}
            </SheetDescription>
          ) : (
            <SheetDescription>{t("diffDescription")}</SheetDescription>
          )}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Spinner className="size-5 text-muted-foreground" />
            </div>
          ) : files.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("diffEmpty")}</p>
          ) : (
            <PrDiff files={files} runId={runId} prUrl={url} provider={provider} readOnly />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
