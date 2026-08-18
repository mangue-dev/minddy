"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowLeft, Ban, ChevronUp, EyeOff, MessageSquare } from "lucide-react";
import { Badge, Button, cn } from "mangue-ui";
import { StatusIndicator } from "@/components/issue-indicators";
import { ProjectOrb } from "@/components/project-orb";
import { orbSeedOr } from "@/lib/project-orb-colors";
import { UserAvatar } from "@/components/user-avatar";
import type { MessageKey } from "@/lib/i18n-keys";
import {
  FEEDBACK_TO_ISSUE_STATUS,
  isHiddenFeedbackStatus,
  type FeedbackPostStatus,
  type PublicIdentity,
  type PublicPost,
  type PublicProject,
} from "@/lib/feedback/types";
import { togglePostVoteAction } from "./actions";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** Shared bricks of the public board: status badge (same icons as the
 issue statuses), horizontal pill voting (UserJot style), deterministic avatars
, and THE feedback line — that of the board like that of
 “my feedback”. */

/** Badge shades by status — matched to the color of the issue icons
 but declined by theme: the hexes of the icons (#FADB28…) are designed for
 dark and become illegible in text on a light background. Each pair
 holds a contrast ≥ 4.5:1; null = neutral. */
const STATUS_BADGE_CLASSES: Record<FeedbackPostStatus, string | null> = {
  open: null,
  planned: null,
  in_progress:
    "border-amber-700/30 bg-amber-500/10 text-amber-700 dark:border-yellow-300/30 dark:bg-yellow-300/10 dark:text-yellow-300",
  shipped:
    "border-green-700/30 bg-green-500/10 text-green-700 dark:border-green-400/30 dark:bg-green-400/10 dark:text-green-400",
  declined:
    "border-red-700/30 bg-red-500/10 text-red-700 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-400",
  // Spam cannot be painted off: it goes out. An alert color would give it
  // the weight of a decision to reread, when it is precisely what we have
  // fini de regarder.
  spam: "border-border bg-muted text-muted-foreground",
};

/**
 * The status badge of a return, shared by the public board and the team view.
 *
 * It borrows the SHAPE of the badges from the rest of the app (`Badge` from mangue-ui, the
 * same height as on pull requests and agent sessions) rather than the
 * micro-pastille qu'il portait : quatre listes qui se ressemblent doivent se
 * look like, and an 11 px badge in the middle of 12 badges reads like a
 * badge de seconde classe.
 */
export function FeedbackStatusBadge({
  status,
  projectName,
  className,
}: {
  status: FeedbackPostStatus;
  /**
   * The name of the product — and, by the way, the request for a tooltip that
   * EXPLAIN the condition.
   *
   * A visitor to the board does not know the convention: “Planned” does not say
   * who planned it or what it entails, and “Open” reads as well
   * “no one has read it” that “it’s under discussion”. The sentence names
   * the team that created the report, so it needs the project. On the team side we don't
   * it does not pass: the word is enough, and the surface already bears its own
   * infobulles.
   */
  projectName?: string;
  className?: string;
}) {
  const t = useTranslations("PublicFeedback");
  const badge = (
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
  if (!projectName) return badge;
  return (
    <Tooltip>
      {/* The `span` carries the trigger: `Badge` also returns a `span`, but
 `asChild` needs a node to place handlers on without overwriting the
 hue classes. */}
      <TooltipTrigger asChild>
        <span className="flex">{badge}</span>
      </TooltipTrigger>
      <TooltipContent side="top">
        {/* Key assembled at runtime (lib/i18n-keys.ts). */}
        {t(`statusHint.${status}` as MessageKey<"PublicFeedback">, { project: projectName })}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * The “unpublished” badge of “my returns”.
 *
 * A return absent from the board is for two reasons — its author kept it
 * private, or moderation has ruled it out — and they are NOT said to the one who has
 * writing. “Spam” is the team word, not a response to a visitor; and a
 * “Private” badge next to a status makes two labels for one idea.
 * A single badge, a single word, the same tooltip in both cases: this is not
 * not on the board, the team still has it.
 */
export function UnpublishedBadge({ projectName }: { projectName?: string }) {
  const t = useTranslations("PublicFeedback");
  const badge = (
    <Badge variant="secondary" icon={<EyeOff />} className="text-muted-foreground">
      {t("rejected")}
    </Badge>
  );
  if (!projectName) return badge;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex">{badge}</span>
      </TooltipTrigger>
      <TooltipContent side="top">
        {t("unpublishedHint", { project: projectName })}
      </TooltipContent>
    </Tooltip>
  );
}

export function VoteButton({
  count,
  voted,
  onToggle,
  size = "md",
  className,
}: {
  count: number;
  voted: boolean;
  onToggle: () => void;
  size?: "md" | "sm";
  className?: string;
}) {
  const t = useTranslations("PublicFeedback");
  // The chevron and a number, without a word: what the click DOES reads zero
  // leaves, and it cannot be guessed in the other direction either — a counter already
  // lit removes itself, which the up arrow says wrong. The sentence says
  // gesture and its common meaning, and serves as an accessible label at the same time.
  const label = voted ? t("unvote") : t("vote");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
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
              : // Not voted for is not “extinct”. In gray on transparent, the
                // central gesture of the board was the palest element of the
                // map — and since the map lights up on hover, its background
                // went right back under the counter. It takes the bottom of
                // neutral chips (`--control`) and its full text: a button
                // that we see, whose voted state remains distinct in color.
                "bg-control text-foreground hover:border-foreground/30 hover:bg-control-hover",
            className
          )}
        >
          <ChevronUp className={size === "md" ? "size-4" : "size-3.5"} />
          {count}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

/** Visitor avatar in the header, the same abstract mark as in the app:
 sown on the seed of his minddy account when the SSO identified him — the
 face he knows there — and otherwise on his pseudonym, the voters of the public board
 being anonymous. */
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

/**
 * The avatar of the one who wrote the return — sown on his PSEUDONYM, never on
 * their email or account.
 *
 * What he adds to the board: two returns from the same author have the same face,
 * and a list ceases to be a pile of titles with no one behind it. What he
 * does not add: a noun. The nickname itself is not displayed anywhere next to
 * public — the avatar is the only trace of it, and it cannot be traced back to
 * anyone.
 *
 * Without author (unattached internal entry), `UserAvatar` makes a disk neutral
 * rather than a face: the line keeps its size, and we don't invent anyone.
 *
 * Its size is that of the state badge it precedes (`h-7`), and not a size
 * chosen for him: both open the same meta line, and a face of
 * 16 px in front of a 28 badge read like a list bullet rather than
 * like a person.
 */
export function AuthorAvatar({
  pseudonym,
  className,
}: {
  pseudonym: string | null;
  className?: string;
}) {
  return <UserAvatar seed={pseudonym} className={cn("size-7", className)} />;
}

/**
 * The discussion of a return, in a single badge.
 *
 * He wore two: "The team responded" on one side, the number of
 * comments from the other — and never both at the same time, because side by side
 * they said the same thing twice (there is something to be said in that). Result, the
 * many disappeared precisely when the discussion was most lively:
 * the one where the team spoke.
 *
 * A single badge, therefore, which always says HOW MUCH. What the team adds passes
 * in the ICON: the orb of the project, that of the header, instead of the bubble
 * generic. A bubble says “there are messages”; the orb says that one of these
 * messages comes from the product — and that's the news. The word we lose in
 * path is rendered by the tooltip, because a 14 px logo never said
 * “the team responded” to anyone who didn’t already know.
 *
 * No comments → no badge: a “0” is not information, it is
 * an empty box that was left in the line.
 */
function FeedbackCommentsBadge({
  post,
  project,
}: {
  post: PublicPost;
  project: PublicProject;
}) {
  const t = useTranslations("PublicFeedback");
  if (post.commentCount === 0) return null;

  // The team has spoken: its message is one that counts.
  const teamIsIn = post.teamRepliedAt !== null;
  const badge = (
    <Badge
      variant="secondary"
      // No additional tint: the orb of the project is already in color where the
      // bubble is gray, and the state badge right next to it ALREADY paints its own
      // (“In progress” in amber, “Delivered” in green). Two colorful badges side by side
      // coast, and we no longer know which of the two is the news.
      icon={
        teamIsIn ? (
          <ProjectOrb
            seed={orbSeedOr(project.id, project.orbSeed)}
            iconUrl={project.iconUrl}
            className="size-3.5 rounded-[4px]"
          />
        ) : (
          <MessageSquare />
        )
      }
    >
      {t("commentCount", { count: post.commentCount })}
    </Badge>
  );
  return (
    <Tooltip>
      {/* The `span` carries the trigger: `Badge` also returns a `span`, but
 `asChild` needs a node to place handlers on without overwriting the
 hue classes. */}
      <TooltipTrigger asChild>
        <span className="flex">{badge}</span>
      </TooltipTrigger>
      <TooltipContent side="top">
        {teamIsIn ? t("teamRepliedHint", { project: project.name }) : t("commentsHint")}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * The date of a return, SAY.
 *
 * A bare date in the middle of a meta line doesn't say what it's about
 * date — creation, last vote, team response. The verb fixes her. And he
 * changes with what we look at: on “my returns” live private returns
 * and returns awaiting verification, which are not published anywhere —
 * sticking “Published on” next to an “Unpublished” badge would write the
 * contradiction on the same line.
 */
export function FeedbackPostedAt({ post }: { post: PublicPost }) {
  const t = useTranslations("PublicFeedback");
  const format = useFormatter();
  const date = format.dateTime(new Date(post.createdAt), { dateStyle: "medium" });
  const onBoard =
    post.isPublic && post.reviewState === "published" && !isHiddenFeedbackStatus(post.status);
  return <span>{onBoard ? t("postedOn", { date }) : t("sentOn", { date })}</span>;
}

/**
 * The return to the board, from a page of a return as from “my returns”.
 *
 * This is the ONLY exit path for these two pages: they have neither sidebar nor
 * breadcrumbs, and the header only carries the identity of the visitor. He therefore has the
 * template of a real solid button — not the 24 px gray dot that it was,
 * which bore the size and color of the meta line just below and
 * read like a legend rather than the command it is.
 */
export function BackToBoardLink({ basePath }: { basePath: string }) {
  const t = useTranslations("PublicFeedback");
  return (
    <Button asChild className="w-fit">
      {/* basePath "" (custom domain): the root of the board is "/". */}
      <Link href={basePath || "/"}>
        <ArrowLeft />
        {t("back")}
      </Link>
    </Button>
  );
}

/**
 * THE line of a return — the same on the board and on “my returns”.
 *
 * It is because it is the same object: two lists which show the same
 * return and do not show it the same makes one doubt whether it is the same one. THE
 * vote is alive everywhere, including from “my returns” — a list where the
 * Center gesture of the next page is off reads like a screenshot.
 *
 * What changes from one view to another goes through `meta` (the badges specific to the
 * view: private, in verification, written/voted by me) and `footer`.
 */
export function FeedbackPostRow({
  token,
  href,
  post,
  project,
  onNeedAuth,
  statusBadge,
  meta,
  footer,
}: {
  token: string;
  href: string;
  post: PublicPost;
  /** The product: its name populates the status tooltips, its icon signs the
 badge “The team responded”. */
  project: PublicProject;
  /** Open the OTP gate then replay the vote. The public board needs it; “my
 returns” is only displayed when connected and does without it. */
  onNeedAuth?: (run: () => void) => void;
  /**
   * Replaces the status badge. This is not a style variation: on “my
   * returns", a return rejected by moderation does not say "spam" to the one
   * who wrote it — it's the team's word, not a response to a visitor.
   */
  statusBadge?: ReactNode;
  /** View-specific badges, following status and date. */
  meta?: ReactNode;
  /** Free line under the meta (“your feedback has been grouped with this one”). */
  footer?: ReactNode;
}) {
  const router = useRouter();
  const [optimistic, setOptimistic] = useState<{ voted: boolean; count: number } | null>(null);
  const voted = optimistic?.voted ?? post.votedByMe;
  const count = optimistic?.count ?? post.voteCount;

  const toggle = () => {
    const next = { voted: !voted, count: count + (voted ? -1 : 1) };
    setOptimistic(next);
    void togglePostVoteAction(token, post.id, next.voted)
      .then((result) => {
        if (!result.ok) {
          setOptimistic(null);
          if (result.notAuthenticated) onNeedAuth?.(toggle);
          return;
        }
        router.refresh();
      })
      .catch(() => setOptimistic(null));
  };

  return (
    /* The target of the hover is RETURN — not its title. A title that turns blue
 designates a link in the middle of a card to which the rest does not react, and it
 had to aim for three words to open it. The background that lights up designates the entire board, and the link extends behind it (`before:inset-0`) so that the surface that lights up is exactly the one that opens. What
 must remain clickable on top - voting, tooltip badges - is repositioned (`relative`), otherwise the link table covers it. */
    <li className="relative flex flex-col gap-2 rounded-lg px-3 py-3.5 transition-colors hover:bg-muted/50">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Link href={href} className="flex flex-col gap-1 before:absolute before:inset-0 before:content-['']">
            <h3 className="text-[15px] font-semibold leading-snug">{post.title}</h3>
            {post.body && (
              <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                {post.body}
              </p>
            )}
          </Link>
          <div className="relative mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <AuthorAvatar pseudonym={post.authorPseudonym} />
            {statusBadge ?? (
              <FeedbackStatusBadge status={post.status} projectName={project.name} />
            )}
            <FeedbackCommentsBadge post={post} project={project} />
            <FeedbackPostedAt post={post} />
            {meta}
          </div>
          {footer}
        </div>
        <VoteButton count={count} voted={voted} onToggle={toggle} className="relative" />
      </div>
    </li>
  );
}
