"use client";

import { useTranslations } from "next-intl";
import { Ban, ChevronUp } from "lucide-react";
import { Badge, cn } from "mangue-ui";
import { StatusIndicator } from "@/components/issue-indicators";
import { UserAvatar } from "@/components/user-avatar";
import type { IssueStatus } from "@/lib/issue-constants";
import type {
  FeedbackPostStatus,
  PublicCategory,
  PublicIdentity,
} from "@/lib/feedback/types";

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
  // Le spam n'a pas d'équivalent chez les tickets : il emprunte l'icône du
  // ticket annulé pour les endroits qui n'affichent QUE l'indicateur (le
  // sélecteur de statut), mais le badge, lui, se peint avec son propre signe.
  spam: "canceled",
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
  // Le spam ne se peint pas : il s'éteint. Une couleur d'alerte lui donnerait
  // le poids d'une décision à relire, alors qu'il est justement ce qu'on a
  // fini de regarder.
  spam: "border-border bg-muted text-muted-foreground",
};

/**
 * Le badge de statut d'un retour, partagé par le board public et la vue équipe.
 *
 * Il emprunte la FORME des badges du reste de l'app (`Badge` de mangue-ui, la
 * même hauteur que sur les pull requests et les sessions d'agent) plutôt que la
 * micro-pastille qu'il portait : quatre listes qui se ressemblent doivent se
 * ressembler, et un badge de 11 px au milieu de badges de 12 se lit comme un
 * badge de seconde classe.
 */
export function FeedbackStatusBadge({
  status,
  className,
}: {
  status: FeedbackPostStatus;
  className?: string;
}) {
  const t = useTranslations("PublicFeedback");
  return (
    <Badge
      variant="secondary"
      icon={
        status === "spam" ? (
          <Ban />
        ) : (
          <StatusIndicator status={FEEDBACK_TO_ISSUE_STATUS[status]} />
        )
      }
      className={cn(STATUS_BADGE_CLASSES[status] ?? "text-muted-foreground", className)}
    >
      {t(`status.${status}`)}
    </Badge>
  );
}

/** Pastille de catégorie (MIN-52) — point coloré + nom, ton neutre pour rester
    discret sous le titre du post. Même gabarit que le badge de statut à côté
    duquel elle se lit toujours. */
export function CategoryTag({
  category,
  className,
}: {
  category: PublicCategory;
  className?: string;
}) {
  return (
    <Badge
      variant="secondary"
      icon={
        <span
          className="size-2 rounded-full"
          style={{ backgroundColor: category.color }}
          aria-hidden
        />
      }
      className={cn("font-normal text-muted-foreground", className)}
    >
      {category.name}
    </Badge>
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

/** Avatar du visiteur, la même marque abstraite que dans l'app : semée sur la
    graine de son compte minddy quand le SSO l'a identifié — le visage qu'il y
    connaît — et sinon sur son pseudonyme, les votants du board public étant
    anonymes. C'est le seul avatar du board, et seul son propriétaire le voit. */
export function IdentityAvatar({
  identity,
  className,
}: {
  identity: PublicIdentity;
  className?: string;
}) {
  return (
    <UserAvatar
      seed={identity.avatarSeed ?? identity.pseudonym}
      className={cn("size-5", className)}
    />
  );
}
