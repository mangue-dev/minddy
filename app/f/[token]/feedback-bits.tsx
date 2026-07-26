"use client";

import { useTranslations } from "next-intl";
import { ChevronUp } from "lucide-react";
import { cn } from "mangue-ui";
import { StatusIndicator } from "@/components/issue-indicators";
import { UserAvatar } from "@/components/user-avatar";
import type { IssueStatus } from "@/lib/issue-constants";
import type { FeedbackPostStatus, PublicCategory } from "@/lib/feedback/types";

/** Petites briques partagées du board public : badge de statut (mêmes icônes
    que les statuts d'issue), vote en pill horizontal (style UserJot) et
    mini-avatar déterministe. */

/** Statut public → statut d'issue équivalent (pour l'icône Linear-style). */
export const FEEDBACK_TO_ISSUE_STATUS: Record<FeedbackPostStatus, IssueStatus> = {
  open: "backlog",
  planned: "todo",
  in_progress: "in_progress",
  shipped: "done",
  declined: "canceled",
};

/** Teintes du badge par statut — appariées à la couleur des icônes d'issue
    mais déclinées par thème : les hex des icônes (#FADB28…) sont pensés pour
    le dark et deviennent illisibles en texte sur fond clair. Chaque paire
    tient un contraste ≥ 4.5:1 ; null = neutre. */
const STATUS_BADGE_CLASSES: Record<FeedbackPostStatus, string | null> = {
  open: null,
  planned: null,
  in_progress:
    "border-amber-700/30 bg-amber-500/10 text-amber-700 dark:border-yellow-300/30 dark:bg-yellow-300/10 dark:text-yellow-300",
  shipped:
    "border-green-700/30 bg-green-500/10 text-green-700 dark:border-green-400/30 dark:bg-green-400/10 dark:text-green-400",
  declined:
    "border-red-700/30 bg-red-500/10 text-red-700 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-400",
};

export function FeedbackStatusBadge({ status }: { status: FeedbackPostStatus }) {
  const t = useTranslations("PublicFeedback");
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        STATUS_BADGE_CLASSES[status] ?? "text-muted-foreground"
      )}
    >
      <StatusIndicator
        status={FEEDBACK_TO_ISSUE_STATUS[status]}
        className="size-3.5"
      />
      {t(`status.${status}`)}
    </span>
  );
}

/** Pastille de catégorie du board public (MIN-52) — point coloré + nom, ton
    neutre pour rester discret sous le titre du post. */
export function CategoryTag({ category }: { category: PublicCategory }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
      <span
        className="size-2 rounded-full"
        style={{ backgroundColor: category.color }}
        aria-hidden
      />
      {category.name}
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
        "inline-flex shrink-0 items-center rounded-full border font-semibold tabular-nums transition-colors",
        size === "md" ? "gap-1 px-3 py-1.5 text-sm" : "gap-0.5 px-2 py-0.5 text-xs",
        voted
          ? "border-primary/50 bg-primary/10 text-primary"
          : "text-muted-foreground hover:border-foreground/30 hover:text-foreground"
      )}
    >
      <ChevronUp className={size === "md" ? "size-4" : "size-3.5"} />
      {count}
    </button>
  );
}

/** Avatar déterministe d'un pseudonyme : la même marque abstraite que dans
    l'app, semée sur le pseudonyme plutôt que sur un identifiant de compte —
    les votants du board public sont anonymes. */
export function PseudonymAvatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return <UserAvatar seed={name} className={cn("size-5", className)} />;
}
