"use client";

import { Check } from "lucide-react";
import { cn } from "mangue-ui";

/**
 * Une ligne de la colonne de gauche de l'onboarding — reprise telle quelle
 * d'AutoKap (`components/onboarding-step-row.tsx`), aux primitives mangue-ui
 * près : une pastille numérotée tant que l'étape est devant, la coche verte et
 * le titre barré une fois derrière, un liseré pointillé sur l'étape courante.
 *
 * La pastille disparaît quand l'étape est faite : ce qu'on veut lire à ce
 * moment-là est « c'est fait », pas son rang.
 */
export type OnboardingStepRowState = "pending" | "current" | "completed";

export function OnboardingStepRow({
  index,
  title,
  state,
}: {
  index: number;
  title: string;
  state: OnboardingStepRowState;
}) {
  const isPending = state === "pending";
  const isCurrent = state === "current";
  const isCompleted = state === "completed";

  return (
    <div
      data-state={state}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors",
        isCurrent && "border border-dashed border-brand/30 bg-brand/8",
        isCompleted && "border border-transparent bg-success/8",
        isPending && "border border-transparent",
      )}
    >
      {!isCompleted && (
        <span
          aria-hidden
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium tabular-nums",
            isCurrent && "bg-brand/15 text-brand",
            isPending && "bg-muted text-muted-foreground",
          )}
        >
          {index}
        </span>
      )}
      <span
        className={cn(
          "flex-1 truncate text-sm",
          isCompleted && "text-foreground/70 line-through",
          isCurrent && "font-medium text-foreground",
          isPending && "text-foreground",
        )}
      >
        {title}
      </span>
      {isCompleted && (
        <Check aria-hidden className="size-4 shrink-0 text-success" strokeWidth={2.5} />
      )}
    </div>
  );
}
