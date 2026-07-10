"use client";

import { useTranslations } from "next-intl";
import { ChevronUp } from "lucide-react";
import { cn } from "mangue-ui";
import type { FeedbackPostStatus } from "@/lib/feedback/types";

/** Petites briques partagées du board public : badge de statut et bouton de
    vote (style Canny — chevron + compteur, état optimiste géré par l'appelant). */

const STATUS_DOT: Record<FeedbackPostStatus, string> = {
  open: "bg-muted-foreground/50",
  planned: "bg-blue-500",
  in_progress: "bg-amber-500",
  shipped: "bg-emerald-500",
  declined: "bg-rose-500",
};

export function FeedbackStatusBadge({ status }: { status: FeedbackPostStatus }) {
  const t = useTranslations("PublicFeedback");
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      <span className={cn("size-1.5 rounded-full", STATUS_DOT[status])} />
      {t(`status.${status}`)}
    </span>
  );
}

export function VoteButton({
  count,
  voted,
  onToggle,
  size = "md",
}: {
  count: number;
  voted: boolean;
  onToggle: () => void;
  size?: "md" | "sm";
}) {
  const t = useTranslations("PublicFeedback");
  return (
    <button
      type="button"
      aria-label={voted ? t("unvote") : t("vote")}
      aria-pressed={voted}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        "flex shrink-0 flex-col items-center justify-center rounded-md border transition-colors",
        size === "md" ? "h-12 w-10 gap-0.5" : "h-9 w-8",
        voted
          ? "border-primary/50 bg-primary/10 text-primary"
          : "text-muted-foreground hover:border-foreground/30 hover:text-foreground"
      )}
    >
      <ChevronUp className={size === "md" ? "size-4" : "size-3.5"} />
      <span
        className={cn(
          "font-semibold tabular-nums leading-none",
          size === "md" ? "text-xs" : "text-[10px]"
        )}
      >
        {count}
      </span>
    </button>
  );
}
