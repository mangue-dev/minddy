"use client";

import { useTranslations } from "next-intl";
import { Tooltip, TooltipContent, TooltipTrigger, cn } from "mangue-ui";
import { ProgressRing } from "@/components/progress-ring";

/**
 * L'avancement d'un objectif, sous sa forme compacte : l'anneau du cycle et, à
 * côté, le compte de tickets clos.
 *
 * Les deux ne disent PAS la même chose, et c'est pour ça qu'ils cohabitent :
 * l'anneau est pondéré par l'effort (un XL fini devant un XS restant remplit les
 * neuf dixièmes du cercle), le compte est brut (« 1/2 »). Le premier dit où en
 * est le travail, le second combien de tickets restent à fermer.
 *
 * Écrit une fois pour les deux surfaces qui le portent — la ligne de la colonne
 * et l'en-tête du détail : elles ont divergé une fois déjà, l'une montrant un
 * pourcentage que l'autre taisait.
 */
export function ObjectiveProgressStat({
  progress,
  countFirst,
  tooltip,
  className,
}: {
  progress: { done: number; total: number; percent: number };
  /**
   * Le compte AVANT l'anneau. C'est la forme de la colonne : l'anneau tombe
   * alors sur son bord droit, à la même abscisse d'une ligne à l'autre, et c'est
   * cet alignement-là qu'on parcourt des yeux.
   */
  countFirst?: boolean;
  /**
   * Le pourcentage au survol. Réservé aux surfaces où l'on s'ARRÊTE (l'en-tête
   * d'un objectif ouvert) : dans une liste qu'on balaie, une infobulle par ligne
   * survolée est du bruit, pas une information.
   */
  tooltip?: boolean;
  className?: string;
}) {
  const t = useTranslations("Objectives");

  const ring = (
    <ProgressRing percent={progress.percent} colorClass="text-emerald-500" />
  );
  const count = (
    <span>
      {progress.done}/{progress.total}
    </span>
  );

  const stat = (
    <span
      className={cn(
        "flex shrink-0 items-center gap-1.5 text-xs tabular-nums text-muted-foreground",
        className
      )}
    >
      {countFirst ? (
        <>
          {count}
          {ring}
        </>
      ) : (
        <>
          {ring}
          {count}
        </>
      )}
    </span>
  );

  if (!tooltip) return stat;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{stat}</TooltipTrigger>
      <TooltipContent>
        {t("progressTooltip", { percent: progress.percent })}
      </TooltipContent>
    </Tooltip>
  );
}
