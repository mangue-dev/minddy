"use client";

import { useFormatter, useTranslations } from "next-intl";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Spinner,
} from "mangue-ui";
import { PrDiff } from "@/components/pull-requests/pr-diff";
import { prCommitEndpoint } from "@/lib/agent-api";
import { usePrCommitDiffQuery } from "@/lib/use-agent-runs";
import type { RepoProviderId } from "@/lib/repo-providers";

/**
 * Le diff d'UN commit, dans le même panneau latéral que la vue diff de la
 * conversation de l'agent (`AgentDiffSheet`) — mêmes largeurs, même en-tête,
 * même `PrDiff` en lecture seule. Deux surfaces qui montrent la même chose
 * doivent se ressembler ; ce qui change ici n'est que la SOURCE du diff.
 *
 * Lecture seule, et pas par simplification : un commentaire de review s'ancre à
 * une ligne du diff de la PR, pas de celui d'un commit. La review reste dans
 * l'onglet Fichiers, où l'ancre est celle que la forge attend.
 *
 * L'endpoint passé à `PrDiff` est celui du COMMIT : le dépliage de contexte y
 * résout le parent du commit, là où celui de la PR résout le merge base.
 */
export function PrCommitDiffSheet({
  prId,
  sha,
  open,
  provider,
  onOpenChange,
}: {
  prId: string;
  /**
   * Le commit regardé. Il SURVIT à la fermeture (`open` repasse à faux sans que
   * le sha bouge) : Radix anime la sortie du panneau, et vider le sha tout de
   * suite montrerait un panneau blanc pendant l'animation.
   */
  sha: string | null;
  open: boolean;
  provider: RepoProviderId;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("PullRequests");
  const format = useFormatter();
  // `enabled` sur `open` : refermer ne doit pas relancer la requête, mais la
  // rouvrir sur le même commit la sert depuis le cache (un commit est immuable).
  const { diff, loading } = usePrCommitDiffQuery(prId, open ? sha : null);

  const title = (diff?.message ?? "").split("\n")[0].trim();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* Largeur forcée en `!` pour la même raison que l'AgentDiffSheet : les
          classes par défaut du Sheet gagnent en spécificité, et un diff dans
          `max-w-sm` est illisible. */}
      <SheetContent
        side="right"
        className="flex !w-full flex-col gap-0 sm:!w-[92%] sm:!max-w-[880px]"
      >
        <SheetHeader className="shrink-0 border-b border-border pr-12">
          <SheetTitle className="truncate">
            {title || t("commitDiffTitle")}
          </SheetTitle>
          <SheetDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-xs">{sha?.slice(0, 7)}</span>
            {diff ? (
              <span className="inline-flex items-center gap-1.5 font-medium tabular-nums">
                <span className="text-green-700 dark:text-green-500">
                  +{format.number(diff.additions)}
                </span>
                <span className="text-red-700 dark:text-red-500">
                  −{format.number(diff.deletions)}
                </span>
              </span>
            ) : null}
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Spinner className="size-5 text-muted-foreground" />
            </div>
          ) : !diff ? (
            <p className="text-sm text-muted-foreground">{t("commitDiffUnavailable")}</p>
          ) : diff.files.length === 0 ? (
            // Un commit vide, ou un commit de fusion dont le premier parent
            // porte déjà tout : la forge répond zéro fichier, ce n'est pas une
            // panne.
            <p className="text-sm text-muted-foreground">{t("commitDiffEmpty")}</p>
          ) : (
            <PrDiff
              files={diff.files}
              endpoint={prCommitEndpoint(prId, sha as string)}
              prUrl={diff.url}
              provider={diff.provider ?? provider}
              readOnly
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
