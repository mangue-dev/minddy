"use client";

import type { ReactNode } from "react";
import { cn } from "mangue-ui";
import { Info, ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Chrome partagé de la page statistiques (MIN-85).
 *
 * Règle de mise en page : le titre d'une section vit TOUJOURS au-dessus de sa
 * carte, jamais dedans. C'est ce qui permet d'imbriquer du contenu (barres,
 * sous-cartes) sans empiler trois niveaux de bordures comme le faisait
 * l'ancienne section « Cycles ».
 */

/** Petit « i » avec une infobulle expliquant ce que compte une métrique. */
export function InfoHint({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={text}
          className="inline-flex shrink-0 text-muted-foreground/50 transition-colors hover:text-foreground"
        >
          <Info className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-[260px] text-xs leading-snug">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

/** En-tête de section : titre + info optionnelle, puis une ligne de contexte. */
export function StatsSectionHeader({
  title,
  info,
  description,
}: {
  title: string;
  info?: string;
  description?: string;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-1.5">
        {/* Casse normale : le titre se distingue par sa graisse, pas par des
            majuscules — c'est la convention des autres écrans de l'app. */}
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {info ? <InfoHint text={info} /> : null}
      </div>
      {description ? (
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}

/** Section complète : en-tête hors carte + enfants (souvent une `StatsCard`). */
export function StatsSection({
  title,
  info,
  description,
  className,
  children,
}: {
  title: string;
  info?: string;
  description?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("mt-8", className)}>
      <StatsSectionHeader title={title} info={info} description={description} />
      {children}
    </section>
  );
}

/** Surface de carte unique, réutilisée telle quelle par toutes les sections. */
export function StatsCard({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-5 text-card-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Une métrique. Deux poids :
 *   - `hero` : les 3 chiffres du bandeau « en ce moment » (texte 3xl) ;
 *   - `card` : une mesure secondaire à l'intérieur d'une carte (texte 2xl).
 * Le libellé passe avant la valeur : on lit ce qu'on regarde, puis combien.
 */
export function Metric({
  label,
  value,
  hint,
  info,
  variant = "card",
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  info?: string;
  variant?: "hero" | "card";
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <div className="flex items-center gap-1.5">
        <span className="truncate text-sm font-medium text-muted-foreground">
          {label}
        </span>
        {info ? <InfoHint text={info} /> : null}
      </div>
      <div
        className={cn(
          "font-semibold tabular-nums tracking-tight text-foreground",
          variant === "hero" ? "text-3xl" : "text-2xl",
        )}
      >
        {value}
      </div>
      {hint ? (
        <div className="text-xs leading-relaxed text-muted-foreground">{hint}</div>
      ) : null}
    </div>
  );
}

/**
 * Écart vs la période précédente. Volontairement neutre en couleur : une
 * semaine calme n'est pas une erreur — la flèche porte le sens, pas une alerte.
 */
export function Delta({ value, label }: { value: number; label: string }) {
  const Icon = value === 0 ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-1">
      <Icon className="size-3.5 shrink-0" />
      {label}
    </span>
  );
}

/** Une mesure de la bande « depuis le début » — petite, alignée, sans carte. */
export function TotalItem({
  label,
  value,
  info,
}: {
  label: string;
  value: number | string;
  info?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-xl font-semibold tabular-nums tracking-tight text-foreground">
        {value}
      </span>
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <span className="truncate">{label}</span>
        {info ? <InfoHint text={info} /> : null}
      </span>
    </div>
  );
}
