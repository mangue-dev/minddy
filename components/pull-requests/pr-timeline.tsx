"use client";

import { useFormatter, useNow, useTranslations } from "next-intl";
import {
  Check,
  CircleDot,
  CircleSlash,
  Eye,
  FileDiff,
  GitBranch,
  GitCommitHorizontal,
  GitMerge,
  GitPullRequestArrow,
  GitPullRequestClosed,
  GitPullRequestDraft,
  History,
  Link2,
  Lock,
  LockOpen,
  Milestone,
  SquarePen,
  Tag,
  Trash2,
  Upload,
  UserMinus,
  UserPlus,
  X,
  Zap,
} from "lucide-react";
import { cn } from "mangue-ui";
import { AuthorNames, AuthorStack } from "@/components/git/author-stack";
import { GitLogin } from "@/components/git/git-login";
import { Markdown } from "@/components/markdown";
import { UserAvatar } from "@/components/user-avatar";
import { hunkPreview } from "@/lib/pr-diff-hunk";
import { displayLineOf } from "@/lib/pr-review-threads";
import type { PrTimelineEvent, PrReviewState } from "@/lib/pr-timeline";
import type { PullRequestReviewComment } from "@/lib/agent-api";
import type { MessageKey } from "@/lib/i18n-keys";

/**
 * L'ACTIVITÉ de la PR dans le fil de conversation (MIN-159) — ce qui s'est passé
 * entre deux messages, et qui manquait entièrement à minddy : une approbation
 * motivée n'y était visible nulle part, pas plus qu'un push, un renommage ou un
 * passage en brouillon.
 *
 * Deux formes, comme chez GitHub, et l'écart entre elles est ce qui rend le fil
 * lisible :
 *  - une **review** est un MESSAGE (verdict + corps + les points posés sur le
 *    code) : elle prend une carte, au même gabarit que les commentaires ;
 *  - tout le reste est une **ligne** : une pastille, un nom, un verbe, une heure.
 *    Les empiler en cartes noierait les trois messages qui comptent.
 */

/** Pastille de chaque fait — la même grammaire visuelle que GitHub. */
const KIND_ICON: Record<PrTimelineEvent["kind"], typeof Check> = {
  reviewed: Eye,
  review_dismissed: CircleSlash,
  review_requested: Eye,
  review_request_removed: Eye,
  committed: GitCommitHorizontal,
  force_pushed: Upload,
  branch_deleted: Trash2,
  branch_restored: GitBranch,
  labeled: Tag,
  unlabeled: Tag,
  assigned: UserPlus,
  unassigned: UserMinus,
  renamed: SquarePen,
  milestoned: Milestone,
  demilestoned: Milestone,
  ready_for_review: GitPullRequestArrow,
  converted_to_draft: GitPullRequestDraft,
  merged: GitMerge,
  closed: GitPullRequestClosed,
  reopened: CircleDot,
  referenced: Link2,
  cross_referenced: Link2,
  locked: Lock,
  unlocked: LockOpen,
  auto_merge_enabled: Zap,
  auto_merge_disabled: Zap,
  system: History,
};

/** Le verbe de chaque fait. Les clés à placeholder sont appelées avec leurs valeurs. */
const KIND_MESSAGE: Record<
  Exclude<PrTimelineEvent["kind"], "reviewed" | "system">,
  MessageKey<"PullRequests">
> = {
  review_dismissed: "timelineReviewDismissed",
  review_requested: "timelineReviewRequested",
  review_request_removed: "timelineReviewRequestRemoved",
  committed: "timelineCommitted",
  force_pushed: "timelineForcePushed",
  branch_deleted: "timelineBranchDeleted",
  branch_restored: "timelineBranchRestored",
  labeled: "timelineLabeled",
  unlabeled: "timelineUnlabeled",
  assigned: "timelineAssigned",
  unassigned: "timelineUnassigned",
  renamed: "timelineRenamed",
  milestoned: "timelineMilestoned",
  demilestoned: "timelineDemilestoned",
  ready_for_review: "timelineReadyForReview",
  converted_to_draft: "timelineConvertedToDraft",
  merged: "timelineMerged",
  closed: "timelineClosed",
  reopened: "timelineReopened",
  referenced: "timelineReferenced",
  cross_referenced: "timelineCrossReferenced",
  locked: "timelineLocked",
  unlocked: "timelineUnlocked",
  auto_merge_enabled: "timelineAutoMergeEnabled",
  auto_merge_disabled: "timelineAutoMergeDisabled",
};

/**
 * Un fait, en une ligne. Le nom de l'auteur ouvre la phrase, comme sur GitHub —
 * c'est lui qu'on scanne en descendant le fil.
 *
 * Le cas `system` est le repli GitLab : une phrase que minddy n'a pas su traduire
 * dans son vocabulaire, rendue telle que GitLab l'a écrite. Un fait dit en
 * anglais reste un fait dit ; le taire serait le seul vrai défaut.
 */
export function PrTimelineRow({ event }: { event: PrTimelineEvent }) {
  const t = useTranslations("PullRequests");
  const format = useFormatter();
  const now = useNow();
  // Une review NUE — approuvée sans un mot — arrive ici plutôt qu'en carte : elle
  // garde alors l'icône et la couleur de son verdict, seuls porteurs du sens.
  const verdict = event.kind === "reviewed" ? REVIEW_STATE[event.reviewState ?? "commented"] : null;
  const Icon = verdict?.icon ?? KIND_ICON[event.kind] ?? History;
  // `actors` n'est rempli que sur les commits : partout ailleurs un fait a un
  // seul auteur, et la pile retombe sur le rendu d'origine.
  const authors = event.actors ?? [];

  return (
    // `items-start` + hauteur de ligne imposée : la pastille se cale sur la
    // PREMIÈRE ligne du texte, et n'y flotte plus — elle fait pile la hauteur
    // d'une ligne `text-sm` (20 px), donc aucun décalage à corriger. Centrer sur
    // tout le bloc la ferait descendre dès qu'une phrase passe à la ligne.
    <li className="flex items-start gap-2.5 px-1 py-0.5 text-sm leading-5 text-muted-foreground">
      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground/80",
          verdict?.className,
        )}
        aria-hidden
      >
        <Icon className="size-3" />
      </span>
      {/* Les auteurs au pluriel quand le fait en a plusieurs — un commit
          co-signé, une poussée à plusieurs mains. Sinon l'acteur seul, ce qui
          rend exactement l'avatar d'avant. */}
      {authors.length > 0 ? (
        // 16 px centrés dans la ligne de 20 px : le même calage que la pastille.
        <AuthorStack authors={authors} size="size-4" className="mt-0.5" />
      ) : event.actor ? (
        <UserAvatar
          url={event.actor.avatar_url}
          seed={event.actor.login}
          className="mt-0.5 size-4 shrink-0"
        />
      ) : null}
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-0.5">
        {authors.length > 0 ? (
          <AuthorNames authors={authors} className="text-sm" />
        ) : event.actor ? (
          <GitLogin login={event.actor.login} className="font-medium text-foreground" />
        ) : null}
        <span className={cn("min-w-0", verdict?.className)}>{timelineText(event, t)}</span>
        {event.createdAt ? (
          <span className="shrink-0 text-xs text-muted-foreground/70">
            {format.relativeTime(new Date(event.createdAt), now)}
          </span>
        ) : null}
      </span>
    </li>
  );
}

/** Le texte du fait, valeurs des placeholders comprises (le contrat i18n). */
function timelineText(
  event: PrTimelineEvent,
  t: ReturnType<typeof useTranslations<"PullRequests">>,
): string {
  switch (event.kind) {
    // Une phrase de GitLab qu'aucun motif ne reconnaît : elle se rend telle
    // quelle, c'est la seule information qu'on ait.
    case "system":
      return event.body ?? "";
    case "committed":
      return t("timelineCommitted", { count: event.commitCount ?? 1 });
    case "labeled":
    case "unlabeled":
      return t(KIND_MESSAGE[event.kind], { label: event.label?.name ?? "—" });
    case "assigned":
    case "unassigned":
    case "review_requested":
    case "review_request_removed":
      return t(KIND_MESSAGE[event.kind], { login: event.subject ?? "—" });
    case "renamed":
      return t("timelineRenamed", { from: event.from ?? "—", to: event.to ?? "—" });
    case "milestoned":
      return t("timelineMilestoned", { name: event.name ?? "—" });
    case "cross_referenced":
      return t("timelineCrossReferenced", { reference: event.reference ?? "—" });
    // Une review qui atterrit en LIGNE n'a ni corps ni point : son verdict est
    // tout ce qu'elle dit, et c'est le même mot que sur sa carte.
    case "reviewed":
      return t(REVIEW_STATE[event.reviewState ?? "commented"].label);
    default:
      return t(KIND_MESSAGE[event.kind]);
  }
}

/**
 * Verdict → mot et couleur. Les mêmes que l'état de la PR : c'est un standard.
 *
 * `icon: null` sur « a relu », et c'est délibéré : ce verdict ne TRANCHE rien —
 * son contenu est juste en dessous, dans la carte. Une bulle de commentaire
 * devant un bloc qui n'est fait que de commentaires ne dit rien de plus, et le
 * bruit se paie sur les deux verdicts qui, eux, comptent.
 */
const REVIEW_STATE: Record<
  PrReviewState,
  { label: MessageKey<"PullRequests">; icon: typeof Check | null; className: string }
> = {
  approved: {
    label: "timelineReviewApproved",
    icon: Check,
    className: "text-emerald-600 dark:text-emerald-500",
  },
  changes_requested: {
    label: "timelineReviewChangesRequested",
    icon: X,
    className: "text-destructive",
  },
  commented: {
    label: "timelineReviewCommented",
    icon: null,
    className: "text-muted-foreground",
  },
  dismissed: {
    label: "timelineReviewDismissedState",
    icon: CircleSlash,
    className: "text-muted-foreground",
  },
};

/**
 * Une review soumise, rendue comme un message : le verdict en en-tête, le corps
 * en dessous, et les points posés sur le code repliés à la suite.
 *
 * Ces points vivent dans l'onglet Fichiers, à leur ligne — mais une review dont
 * le fil ne montrerait QUE « a demandé des changements », sans dire lesquels,
 * obligerait à changer d'onglet pour comprendre ce qui vient d'arriver. Ils sont
 * donc rappelés ici, en extrait, avec leur ancre : le détail (le hunk, le fil de
 * réponses) reste dans le diff.
 *
 * Une review NUE — pas de corps, pas de point — ne mérite pas une carte : c'est
 * un fait, et l'appelant la range en ligne comme les autres.
 */
export function PrTimelineReview({
  event,
  comments,
}: {
  event: PrTimelineEvent;
  /** Les points de CETTE review, déjà filtrés par l'appelant. */
  comments: PullRequestReviewComment[];
}) {
  const t = useTranslations("PullRequests");
  const format = useFormatter();
  const now = useNow();
  const state = REVIEW_STATE[event.reviewState ?? "commented"];
  // Absente sur « a relu » : la carte est déjà faite de ce que l'icône annonce.
  const Icon = state.icon;

  return (
    <li className="flex flex-col gap-1.5 rounded-lg border border-border bg-card px-3.5 py-3">
      <div className="flex items-center gap-2">
        <UserAvatar
          url={event.actor?.avatar_url}
          seed={event.actor?.login ?? "?"}
          className="size-5"
        />
        <GitLogin login={event.actor?.login} className="text-sm font-medium text-foreground" />
        <span className={cn("flex shrink-0 items-center gap-1 text-xs", state.className)}>
          {Icon ? <Icon className="size-3.5" /> : null}
          {t(state.label)}
        </span>
        {event.createdAt ? (
          <span className="shrink-0 text-xs text-muted-foreground/80">
            {format.relativeTime(new Date(event.createdAt), now)}
          </span>
        ) : null}
      </div>
      {event.body ? (
        <Markdown className="text-foreground [&_code]:bg-primary/10 [&_code]:text-primary [&_pre_code]:text-inherit">
          {event.body}
        </Markdown>
      ) : null}
      {comments.length > 0 ? (
        <ul className="flex flex-col gap-2 pt-0.5">
          {comments.map((c) => (
            <ReviewCommentBlock key={c.id} comment={c} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/**
 * Un point de review, rendu comme GitHub le rend dans le fil : le fichier, le
 * CODE dont il parle, puis le commentaire lui-même.
 *
 * Les trois parties sont dans cet ordre pour une raison. Le chemin situe, le code
 * montre de quoi on parle — un commentaire de ligne sans son extrait est une
 * phrase sans sujet, et c'est exactement ce qui rendait ces blocs illisibles — et
 * la séparation nette (fond, bordure, avatar) dit que ce qui suit est quelqu'un
 * qui PARLE, pas une suite du diff.
 *
 * Sans hunk (GitLab n'en sert aucun), l'extrait disparaît et l'ancre
 * `fichier:ligne` porte seule le contexte : le bloc se lit encore.
 *
 * Exporté parce que le déroulé de la passe de Numo (`PrReviewActivity`) montre
 * les mêmes points : ils doivent se lire pareil des deux côtés, sous peine d'un
 * commentaire de ligne qui a deux apparences dans la même page.
 */
export function ReviewCommentBlock({ comment }: { comment: PullRequestReviewComment }) {
  const t = useTranslations("PullRequests");
  const format = useFormatter();
  const now = useNow();
  const line = displayLineOf(comment);
  const preview = hunkPreview(comment.diff_hunk);

  return (
    <li className="overflow-hidden rounded-md border border-border bg-background">
      <span className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-2.5 py-1.5">
        <FileDiff className="size-3.5 shrink-0 text-muted-foreground/70" />
        <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
          {line != null ? t("staleAnchor", { path: comment.path, line }) : comment.path}
        </span>
      </span>

      {preview.length > 0 ? (
        <div className="overflow-x-auto border-b border-border font-mono text-[11px] leading-5">
          {preview.map((l, i) => (
            <div
              key={i}
              className={cn(
                "flex whitespace-pre",
                l.type === "add" && "bg-emerald-500/10",
                l.type === "del" && "bg-destructive/10",
              )}
            >
              {/* La gouttière porte le numéro du côté qui existe — comme le diff
                  de l'onglet Fichiers, pour que les deux vues se lisent pareil. */}
              <span className="w-10 shrink-0 select-none pr-2 text-right text-muted-foreground/50">
                {l.newLine ?? l.oldLine ?? ""}
              </span>
              <span
                className={cn(
                  "w-3 shrink-0 select-none text-muted-foreground/60",
                  l.type === "add" && "text-emerald-600 dark:text-emerald-500",
                  l.type === "del" && "text-destructive",
                )}
              >
                {l.type === "add" ? "+" : l.type === "del" ? "-" : " "}
              </span>
              <span className="pr-3 text-foreground/90">{l.content || " "}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-1 px-2.5 py-2">
        <span className="flex items-center gap-1.5">
          <UserAvatar
            url={comment.user?.avatar_url}
            seed={comment.user?.login ?? "?"}
            className="size-4"
          />
          <GitLogin login={comment.user?.login} className="text-xs font-medium text-foreground" />
          <span className="shrink-0 text-[11px] text-muted-foreground/70">
            {format.relativeTime(new Date(comment.created_at), now)}
          </span>
        </span>
        <Markdown className="text-sm text-foreground">{comment.body}</Markdown>
      </div>
    </li>
  );
}
