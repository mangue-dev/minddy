"use client";

import { useEffect, useRef } from "react";
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
import { PrEndpointProvider } from "@/lib/pr-endpoint-context";
import { runPrEndpoint } from "@/lib/agent-api";
import { fileAnchorId } from "@/lib/pr-file-tree";
import { useAgentRunDiffQuery } from "@/lib/use-agent-runs";
import type { PullRequestFile } from "@/lib/agent-api";

/**
 * Vue diff DANS la conversation de l'agent : les modifications de la session sans
 * quitter le fil ni attendre la PR. Ouverte en cliquant un fichier des blocs
 * « fichiers changés » (fil comme en-tête), dans un Sheet posé PAR-DESSUS la
 * conversation — qui vit elle-même parfois en Sheet (modal d'issue) : Radix
 * empile.
 *
 * En cloud, le contenu vient de /api/agent-runs/[runId]/diff : microVM pendant
 * le tour, forge au repos. En local, cette route ne peut pas lire le disque de
 * l'utilisateur : le harness envoie donc un patch borné sur un canal dédié, puis
 * le conserve dans l'event `files_changed` de fin de tour.
 *
 * Lecture seule : la review (commentaires ancrés) vit sur la page Pull requests.
 */
export function AgentDiffSheet({
  runId,
  open,
  onOpenChange,
  working,
  baseBranch,
  branchName,
  focusPath,
  local = false,
  localFiles = [],
  localTruncated = false,
}: {
  runId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** L'agent travaille : le diff se re-poll (il avance pendant le tour). */
  working: boolean;
  /** Branche d'origine → branche de session, affichées sous le titre. */
  baseBranch: string | null;
  branchName: string | null;
  /** Fichier par lequel on est entré : la vue s'ouvre dessus. */
  focusPath?: string | null;
  /** Le dépôt vit sur la machine : le serveur ne peut pas relire son patch. */
  local?: boolean;
  /** Patch remonté par le harness local (direct + events de fin de tour). */
  localFiles?: PullRequestFile[];
  localTruncated?: boolean;
}) {
  const t = useTranslations("Agent");
  const remote = useAgentRunDiffQuery(runId, open && !local, working);
  const files = local ? localFiles : remote.files;
  const provider = local ? undefined : remote.provider;
  const url = local ? null : remote.url;
  const live = local ? working && files.length > 0 : remote.live;
  const loading = local ? false : remote.loading;

  /**
   * On arrive SUR le fichier cliqué. L'ancre n'existe qu'une fois le diff peint,
   * et le diff arrive après l'ouverture du Sheet : le saut attend donc les deux.
   *
   * Une seule fois par ouverture (`jumped`), et c'est le point : le diff se
   * re-poll toutes les 7 secondes pendant le tour, et re-sauter à chaque réponse
   * arracherait la vue sous les yeux de qui est en train de lire ailleurs.
   */
  const jumped = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      jumped.current = null;
      return;
    }
    if (!focusPath || files.length === 0 || jumped.current === focusPath) return;
    const node = document.getElementById(fileAnchorId(focusPath));
    // Pas dans ce diff (fichier tout juste touché, diff pas encore rafraîchi) :
    // on ne marque rien et la prochaine réponse retentera le saut.
    if (!node) return;
    jumped.current = focusPath;
    node.scrollIntoView({ block: "start" });
  }, [open, focusPath, files]);

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
          {/* Ce que la ligne dit d'abord, c'est OÙ va ce diff (origine → session).
              Quand il vient de la sandbox, elle dit aussi ce qu'il contient de
              plus que la forge : le travail du tour, pas encore poussé. */}
          {local ? (
            <SheetDescription className="truncate text-xs">
              {branchName ? <span className="font-mono">{branchName}</span> : null}
              {branchName ? <span>{" · "}</span> : null}
              <span className={live ? "text-shimmer" : undefined}>
                {t(live ? "diffLocalLive" : "diffLocalDescription")}
              </span>
            </SheetDescription>
          ) : branchName ? (
            <SheetDescription className="truncate text-xs">
              <span className="font-mono">
                {baseBranch ? `${baseBranch} → ${branchName}` : branchName}
              </span>
              {live ? <span className="text-shimmer">{` · ${t("diffLive")}`}</span> : null}
            </SheetDescription>
          ) : (
            <SheetDescription>{live ? t("diffLive") : t("diffDescription")}</SheetDescription>
          )}
        </SheetHeader>
        {/* Pas de padding en HAUT du conteneur qui défile : `position: sticky` se
            cale sur son contenu, pas sur son bord, et l'en-tête de fichier du
            diff s'arrêterait 16 px trop bas (MIN-182). Il est rendu à chaque
            branche, où il défile avec le contenu. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Spinner className="size-5 text-muted-foreground" />
            </div>
          ) : files.length === 0 ? (
            <p className="pt-4 text-sm text-muted-foreground">
              {t(local ? "diffEmptyLocal" : "diffEmpty")}
            </p>
          ) : (
            // Vue diff de la CONVERSATION : elle n'a qu'un run à donner — sa
            // session n'a parfois aucune PR (compare base…branche). Elle passe
            // donc par la façade indexée par le run (MIN-143).
            // L'enveloppe sert ici les IMAGES : une capture collée dans une
            // remarque de ligne n'est pas servable telle quelle (MIN-162), et
            // elle passe par la façade indexée par le run. Le composer, lui, ne
            // s'ouvre pas — cette vue est en lecture seule.
            <>
              {local && localTruncated ? (
                <p className="pt-4 text-xs text-muted-foreground">{t("diffLocalTruncated")}</p>
              ) : null}
              <PrEndpointProvider endpoint={runPrEndpoint(runId)}>
                <PrDiff
                  files={files}
                  endpoint={runPrEndpoint(runId)}
                  prUrl={url}
                  provider={provider}
                  readOnly
                  expandableContext={!local}
                  className="pt-4"
                />
              </PrEndpointProvider>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
