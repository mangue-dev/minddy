"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronRight } from "lucide-react";
import { cn, Spinner } from "mangue-ui";
import { ModelLogo } from "@/components/model-logo";
import { NumoIcon } from "@/components/numo-icon";
import { formatModelName } from "@/lib/model-display";
import type { PrReviewRunSummary } from "@/lib/pr-review-session";

/**
 * La relecture de Numo DANS le fil de la pull request (MIN-168) : une carte qui
 * dit si l'agent travaille, et qui OUVRE SA SESSION au clic.
 *
 * Elle ne déplie plus son propre déroulé sur place, et c'est le point du ticket :
 * une relecture n'est plus une passe à part avec son fil maison, c'est une
 * session de l'agent. Son déroulé — ce qu'il a lu, les commandes qu'il a lancées,
 * les fichiers qu'il a ouverts hors diff — est celui de n'importe quelle session,
 * et `/agents` sait déjà le rendre. En recopier une version pauvre ici obligeait à
 * comprendre deux fois la même chose.
 *
 * Ce que le fil garde : le VERDICT, qui arrive comme un commentaire normal de la
 * PR, écrit par Numo. Cette carte n'est que la porte d'entrée de la session qui
 * l'a produit.
 */
export function PrReviewCard({ run }: { run: PrReviewRunSummary }) {
  const t = useTranslations("PullRequests");
  const router = useRouter();

  const working = run.working;
  const failed = run.status === "failed" || run.status === "canceled";

  return (
    <li>
      <button
        type="button"
        onClick={() => router.push(`/agents?run=${run.runId}`)}
        className="flex w-full items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-3 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50"
      >
        <NumoIcon animated={working} className="size-5 shrink-0" />
        <span className="text-sm font-medium text-foreground">Numo</span>
        <span
          className={cn(
            "min-w-0 truncate text-xs text-muted-foreground",
            working && "text-shimmer",
          )}
        >
          {failed
            ? t("numoReviewFailed")
            : working
              ? t("numoReviewWorking")
              : t("numoReviewFinished")}
        </span>
        {working ? <Spinner className="shrink-0" /> : null}
        <span className="min-w-0 flex-1" />
        {run.model ? (
          <span className="hidden shrink-0 items-center gap-1.5 text-xs text-muted-foreground/80 sm:flex">
            <ModelLogo model={run.model} size={12} />
            {formatModelName(run.model)}
          </span>
        ) : null}
        <span className="flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground">
          {t("numoReviewOpenSession")}
          <ChevronRight className="size-3.5" />
        </span>
      </button>
    </li>
  );
}
