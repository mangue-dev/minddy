"use client";

import { Badge, Spinner, cn } from "mangue-ui";
import { useTranslations } from "next-intl";
import { PR_STATE_STYLES } from "@/components/pull-requests/pr-state-badge";
import type { AgentRunStatus } from "@/lib/agent-api";

type PrState = "draft" | "open" | "merged" | "closed" | null;

/**
 * Indicateur d'état d'une session d'agent (liste de la page Agents). Ne dit plus
 * « terminé » : il reflète la GÉNÉRATION en cours, puis l'ÉTAT DE LA PULL REQUEST.
 * Priorité :
 *   1. génération en cours → « En cours » + spinner ;
 *   2. PR fusionnée → « PR fusionnée » (violet) ;
 *   3. PR ouverte → « PR disponible » (vert) ;
 *   4. PR brouillon, ou état inconnu → « PR disponible » (gris) ;
 *   5. PR fermée → « PR fermée » (rouge) ;
 *   6. sinon (pas de PR) → échec / annulation / en attente.
 *
 * Les couleurs viennent de `PR_STATE_STYLES`, c'est-à-dire de GitHub. Elles
 * étaient peintes ici, et le « fusionnée » y était VERT — la couleur que GitHub
 * réserve à « ouverte ». Deux états contraires sous la même couleur, à un écran
 * de distance de la page Pull requests qui, elle, les distinguait.
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
      <Badge variant="secondary" className={cn(PR_STATE_STYLES.merged, className)}>
        {t("prMergedShort")}
      </Badge>
    );
  }
  if (prNumber != null && prState !== "closed") {
    // Le brouillon garde le gris — c'est celui de GitHub, et une PR que
    // personne n'a encore proposée n'est pas « ouverte ».
    return (
      <Badge
        variant="secondary"
        className={cn(prState === "open" && PR_STATE_STYLES.open, className)}
      >
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
  // Session au repos sans PR → conversation prête à continuer.
  return (
    <Badge variant="outline" className={className}>
      {t("statusWaiting")}
    </Badge>
  );
}
