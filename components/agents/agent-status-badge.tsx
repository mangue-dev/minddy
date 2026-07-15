"use client";

import { Badge, Spinner, cn } from "mangue-ui";
import { useTranslations } from "next-intl";
import type { AgentRunStatus } from "@/lib/agent-api";

type PrState = "draft" | "open" | "merged" | "closed" | null;

/** Style vert « fusionnée » (aligné sur l'indicateur PR du panneau d'issue). */
const MERGED_GREEN =
  "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-500";

/**
 * Indicateur d'état d'une session d'agent (liste de la page Agents). Ne dit plus
 * « terminé » : il reflète la GÉNÉRATION en cours, puis l'ÉTAT DE LA PULL REQUEST.
 * Priorité :
 *   1. génération en cours → « En cours » + spinner ;
 *   2. PR fusionnée → « Pull request fusionnée » (vert) ;
 *   3. PR disponible (ouverte/brouillon) → « Pull request disponible » ;
 *   4. PR fermée → « Pull request fermée » ;
 *   5. sinon (pas de PR) → échec / annulation / en attente.
 */
export function AgentStatusBadge({
  status,
  working,
  prNumber,
  prState,
  className,
}: {
  status: AgentRunStatus;
  working?: boolean;
  prNumber?: number | null;
  prState?: PrState;
  className?: string;
}) {
  const t = useTranslations("Agents");
  const isWorking = working ?? (status === "queued" || status === "running");

  if (isWorking) {
    return (
      <Badge variant="secondary" className={cn("gap-1", className)}>
        <Spinner className="size-3" />
        {t("statusWorking")}
      </Badge>
    );
  }

  if (prState === "merged") {
    return (
      <Badge variant="outline" className={cn(MERGED_GREEN, className)}>
        {t("prMergedShort")}
      </Badge>
    );
  }
  if (prNumber != null && prState !== "closed") {
    return (
      <Badge variant="secondary" className={className}>
        {t("prAvailable")}
      </Badge>
    );
  }
  if (prState === "closed") {
    return (
      <Badge variant="destructive" className={className}>
        {t("prClosed")}
      </Badge>
    );
  }

  if (status === "failed") {
    return (
      <Badge variant="destructive" className={className}>
        {t("statusFailed")}
      </Badge>
    );
  }
  if (status === "canceled") {
    return (
      <Badge variant="secondary" className={className}>
        {t("statusCanceled")}
      </Badge>
    );
  }
  // Repos sans PR (needs_input, ou completed sans changement) → en attente.
  return (
    <Badge variant="outline" className={className}>
      {t("statusWaiting")}
    </Badge>
  );
}
