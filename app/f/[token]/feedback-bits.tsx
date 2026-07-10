"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronUp } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, cn } from "mangue-ui";
import { StatusIndicator } from "@/components/issue-indicators";
import type { IssueStatus } from "@/lib/issue-constants";
import type { FeedbackPostStatus, PublicFacet } from "@/lib/feedback/types";
import { toggleFacetVoteAction } from "./actions";

/** Petites briques partagées du board public : badge de statut (mêmes icônes
    que les statuts d'issue), vote en pill horizontal (style UserJot), pill de
    facette votable et mini-avatar déterministe. */

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

/** Carte de facette votable — rectangle arrondi, affichée en carrousel sous la
    carte du post (liste ET page dédiée). Un clic sur le vote = une voix sur la
    facette (et implicitement sur la racine) ; un clic sur la carte ouvre le
    texte complet en dialog, avec le vote. */
export function FacetCard({
  token,
  facet,
  onNeedAuth,
}: {
  token: string;
  facet: PublicFacet;
  onNeedAuth: (run: () => void) => void;
}) {
  const t = useTranslations("PublicFeedback");
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [optimistic, setOptimistic] = useState<{ voted: boolean; count: number } | null>(null);
  const voted = optimistic?.voted ?? facet.votedByMe;
  const count = optimistic?.count ?? facet.voteCount;

  const toggle = () => {
    const next = { voted: !voted, count: count + (voted ? -1 : 1) };
    setOptimistic(next);
    void toggleFacetVoteAction(token, facet.id, next.voted)
      .then((result) => {
        if (!result.ok) {
          setOptimistic(null);
          if (result.notAuthenticated) onNeedAuth(toggle);
          return;
        }
        router.refresh();
      })
      .catch(() => setOptimistic(null));
  };

  const voteButton = (size: "sm" | "md") => (
    <button
      type="button"
      aria-label={`${voted ? t("unvote") : t("vote")} · ${facet.text}`}
      aria-pressed={voted}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle();
      }}
      className={cn(
        "inline-flex w-fit items-center rounded-md border font-semibold tabular-nums transition-colors",
        size === "sm" ? "gap-1 px-1.5 py-0.5 text-xs" : "gap-1.5 px-3 py-1.5 text-sm",
        voted
          ? "border-primary/50 bg-primary/10 text-primary"
          : "text-muted-foreground hover:border-foreground/30 hover:text-foreground"
      )}
    >
      <ChevronUp className={size === "sm" ? "size-3" : "size-4"} />
      {count}
    </button>
  );

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setDialogOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setDialogOpen(true);
          }
        }}
        className="flex w-52 shrink-0 cursor-pointer flex-col justify-between gap-2 rounded-lg border border-border/70 bg-card/50 px-3 py-2.5 outline-none transition-colors hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <p className="line-clamp-2 text-xs leading-snug text-foreground/90">
          {facet.text}
          {facet.isMine && (
            <span className="ml-1 text-muted-foreground">({t("you")})</span>
          )}
        </p>
        {voteButton("sm")}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogTitle className="sr-only">{t("facetsTitle")}</DialogTitle>
          {/* mt-4 : le bouton de fermeture du dialog vit en haut à droite. */}
          <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed">{facet.text}</p>
          <div className="mt-1">{voteButton("md")}</div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Avatar déterministe d'un pseudonyme : initiale sur un fond teinté stable. */
export function PseudonymAvatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  let hash = 5381;
  for (let i = 0; i < name.length; i++) hash = (hash * 33) ^ name.charCodeAt(i);
  const hue = Math.abs(hash) % 360;
  return (
    <span
      aria-hidden
      style={{ backgroundColor: `oklch(0.65 0.11 ${hue})` }}
      className={cn(
        "flex size-5 shrink-0 select-none items-center justify-center rounded-full text-[10px] font-semibold text-white/90",
        className
      )}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
