"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useLocale, useNow, useTranslations, useFormatter } from "next-intl";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  Badge,
  Button,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  ConfirmDeleteDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Skeleton,
  Spinner,
  SplitButton,
  Switch,
  cn,
  toast,
} from "mangue-ui";
import {
  Ban,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Copy,
  GitMerge,
  Globe,
  Link2,
  Languages,
  ListFilter,
  Lock,
  MessagesSquare,
  MoreHorizontal,
  Plus,
  Send,
  ShieldAlert,
  Sparkles,
  Trash2,
  TriangleAlert,
  Undo2,
  X,
} from "lucide-react";
// (ChevronUp sert au compteur de voix des posts)
import { EmptyScene } from "@/components/empty-scene";
import { FeedbackSetupWizard } from "@/components/feedback/feedback-setup-wizard";
import { SecondarySidebar } from "@/components/secondary-sidebar";
import { matchesFilter } from "@/components/sidebar-filter-field";
import { SearchMenu } from "@/components/search-menu";
import { SearchSelect, checkedProps } from "@/components/search-select";
import { useScrollFade } from "@/lib/use-scroll-fade";
import { usePublishCurrentView } from "@/lib/current-view-context";
import { buildViewHref } from "@/lib/saved-view-href";
import { IssueSidePanel } from "@/components/issue-side-panel";
import { CategoryValue, PropertyRow, TRIGGER } from "@/components/issue-property-fields";
import { CommentComposer, IssueActivity } from "@/components/issue-timeline";
import { CreateIssueDialog } from "@/components/create-issue-dialog";
import { AgentBeamOverlay } from "@/components/agent-beam";
import { DictateButton } from "@/components/ai-elements/dictate-button";
import { NumoIcon } from "@/components/numo-icon";
import { useFeedbackDictation } from "@/lib/use-feedback-dictation";
import { SendShortcutTooltip, isSendShortcut } from "@/components/send-shortcut";
import { UserAvatar } from "@/components/user-avatar";
import { Markdown } from "@/components/markdown";
import { displayName } from "@/lib/display-name";
import { useIssuesQuery } from "@/lib/use-issues-query";
import { useIssueRelationsQuery } from "@/lib/use-issue-relations-query";
import { useMembersQuery } from "@/lib/use-members-query";
import { useCategoriesQuery } from "@/lib/use-categories-query";
import { useObjectivesQuery } from "@/lib/use-objectives-query";
import { useFeedbackTimeline } from "@/lib/use-feedback-timeline";
import { useAuth } from "@/lib/auth-context";
import {
  useAssistantContext,
  useAssistantPanel,
} from "@/lib/assistant-panel-context";
import {
  AskNumoFeedbackProvider,
  useAskNumoFeedbackTarget,
  type AskNumoFeedback,
} from "@/lib/ask-numo-context";
import type { EventContext } from "@/lib/describe-event";
import type {
  ResourceInput,
  Category,
  Issue,
  IssueRelationType,
  Member,
  Objective,
  Project,
} from "@/lib/types";
import { AutoTextarea } from "@/components/auto-textarea";
import { MarkdownEditor } from "@/components/markdown-editor";
import { StatusIndicator } from "@/components/issue-indicators";
import {
  FeedbackStatusBadge,
} from "@/app/f/[token]/feedback-bits";
import { useProjects } from "@/lib/projects-context";
import { issueIdentifier } from "@/lib/issue-constants";
import { defaultLocale } from "@/i18n/config";
import {
  languageLabel,
  normalizeLanguage,
  type FeedbackLanguage,
} from "@/lib/feedback/languages";
import {
  FEEDBACK_POST_STATUSES,
  FEEDBACK_TO_ISSUE_STATUS,
  isResolvedFeedbackStatus,
  type CommentVisibility,
  type FeedbackPostStatus,
  type FeedbackReviewState,
} from "@/lib/feedback/types";
import type { MessageKey } from "@/lib/i18n-keys";
import type {
  TeamFeedbackDetail,
  TeamFeedbackListItem,
} from "@/lib/server/feedback/team-queries";
import type { TeamFeedbackUserOption } from "@/app/api/projects/[id]/feedback/users/route";
import { trackEvent } from "@/lib/analytics";
import { TRASH_RETENTION_DAYS } from "@/lib/trash-retention";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Returns team tab (MIN-37) — two triage-style panels: list
 * filterable (real identities, AI suggestion indicator), detail with
 * editing the canonical layer (the raw remains visible), 1-click merge + undo,
 * suggestion queue, team response, resulting promotion and internal input
 * on behalf of a user.
 *
 * Two rules govern what the screen shows:
 *
 * - **Everything that is decided on a return can be read in the same place** — the table
 * key/value, like on a ticket: status, type, visibility, author,
 * categories. The top of the page only keeps what we DO (promote,
 * refuse), not what the return IS.
 * - **Without a public board, half of these orders no longer have a purpose**: no
 * votes to count, no public/private to decide. They disappear instead
 * to propose actions that lead nowhere (`boardEnabled`).
 */

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const data = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!response.ok) throw new Error(data?.error || "error");
  return data as T;
}

/** Chrome of a badge that OPENS something (status, visibility): the badge
    already bears its shape, the trigger only announces that we can click. */
const BADGE_TRIGGER =
  "rounded-full outline-none transition-opacity hover:opacity-80 focus-visible:opacity-80";

/** The badge as it fits in a LINE of the column — same template as on
    the list of pull requests, hence these three values. The icon goes down to 12 px
    with him: at its detailed size it filled the entire height of the badge. */
const LIST_BADGE = "h-5 px-2 text-[10px] [&>svg]:size-3";

// ── Column filters ────────────────────────── ──────────────────────────

/**
 * The filtered state. `unresolved` is not a status: it is “all that is not
 * not decided” — the starting point, and the exact counterpart of the “open” filter
 * pull requests, which also excludes merged and closed.
 */
type FeedbackStateFilter = "unresolved" | FeedbackPostStatus | "all";

/** The order of the column. `top` (the most supported first) is that of
    server and public board; the other two are chronological. */
type FeedbackSort = "top" | "recent" | "oldest";

const SORTS: ReadonlyArray<{
  value: FeedbackSort;
  label: MessageKey<"FeedbackBoard">;
}> = [
  { value: "top", label: "sortTop" },
  { value: "recent", label: "sortRecent" },
  { value: "oldest", label: "sortOldest" },
];

function matchesStateFilter(post: TeamFeedbackListItem, filter: FeedbackStateFilter) {
  if (filter === "all") return true;
  if (filter === "unresolved") return !isResolvedFeedbackStatus(post.status);
  return post.status === filter;
}

/**
 * The column filter: ONE trigger for three dimensions — state,
 * sorting, and what remains to be decided. The same combobox as pull requests, for
 * the same reason: on the title line there is only room for one icon,
 * and what the wording said goes into the tooltip. A tablet signals
 * far from a filter being placed — without it, a restricted list would no longer have
 * nothing to say.
 */
function FeedbackFilterMenu({
  state,
  sort,
  onlyToReview,
  toReviewCount,
  onStateChange,
  onSortChange,
  onToReviewChange,
}: {
  state: FeedbackStateFilter;
  sort: FeedbackSort;
  onlyToReview: boolean;
  toReviewCount: number;
  onStateChange: (state: FeedbackStateFilter) => void;
  onSortChange: (sort: FeedbackSort) => void;
  onToReviewChange: (only: boolean) => void;
}) {
  const t = useTranslations("FeedbackBoard");
  const tStatus = useTranslations("PublicFeedback");
  const [open, setOpen] = useState(false);

  const stateLabel =
    state === "unresolved"
      ? t("filterUnresolved")
      : state === "all"
        ? t("filterAll")
        : tStatus(`status.${state}`);
  // “Open, by popularity, everything” is the starting point: nothing to report.
  const active = state !== "unresolved" || sort !== "top" || onlyToReview;
  const tooltip = t("filterTooltip", { state: stateLabel });

  const pick = (run: () => void) => {
    run();
    setOpen(false);
  };

  return (
    <SearchMenu
      open={open}
      onOpenChange={setOpen}
      align="end"
      tooltip={tooltip}
      trigger={
        /* NO `-mr-2` here: this compensation aligns the icon on the edge
           right of the lines of the list, and it therefore only returns to the LAST
           action of the title line — the “+”, just after. Carried by the
           filter too, it cropped the 8 px which separate the two buttons and
           stuck them one to the other (the Objectives page, written afterwards, does not put it
           than on the “+”). */
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-foreground"
          aria-label={tooltip}
        >
          <span className="relative flex items-center justify-center">
            <ListFilter className="size-4" />
            {active ? (
              <span
                aria-hidden
                className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-primary ring-2 ring-sidebar"
              />
            ) : null}
          </span>
        </Button>
      }
    >
      <CommandGroup heading={t("filterStateLabel")}>
        <CommandItem
          value="state-unresolved"
          keywords={[t("filterUnresolved")]}
          onSelect={() => pick(() => onStateChange("unresolved"))}
          {...checkedProps(state === "unresolved")}
        >
          <span className="truncate">{t("filterUnresolved")}</span>
        </CommandItem>
        {FEEDBACK_POST_STATUSES.map((value) => (
          <CommandItem
            key={value}
            value={`state-${value}`}
            keywords={[tStatus(`status.${value}`)]}
            onSelect={() => pick(() => onStateChange(value))}
            {...checkedProps(state === value)}
          >
            {value === "spam" ? (
              <Ban className="size-4 shrink-0 text-muted-foreground" />
            ) : (
              <StatusIndicator
                status={FEEDBACK_TO_ISSUE_STATUS[value]}
                className="size-4 shrink-0"
              />
            )}
            <span className="truncate">{tStatus(`status.${value}`)}</span>
          </CommandItem>
        ))}
        <CommandItem
          value="state-all"
          keywords={[t("filterAll")]}
          onSelect={() => pick(() => onStateChange("all"))}
          {...checkedProps(state === "all")}
        >
          <span className="truncate">{t("filterAll")}</span>
        </CommandItem>
      </CommandGroup>

      <CommandSeparator className="my-1" />
      <CommandGroup heading={t("filterSortLabel")}>
        {SORTS.map((option) => (
          <CommandItem
            key={option.value}
            value={`sort-${option.value}`}
            keywords={[t(option.label)]}
            onSelect={() => pick(() => onSortChange(option.value))}
            {...checkedProps(sort === option.value)}
          >
            <span className="truncate">{t(option.label)}</span>
          </CommandItem>
        ))}
      </CommandGroup>

      {/* “To be reviewed” (MIN-87): what the automatic review has not decided is
          drowned in a list sorted by votes. The entry only appears if there is
          matter — no dead line. */}
      {toReviewCount > 0 ? (
        <>
          <CommandSeparator className="my-1" />
          <CommandGroup>
            <CommandItem
              value="to-review"
              keywords={[t("filterToReview")]}
              onSelect={() => pick(() => onToReviewChange(!onlyToReview))}
              {...checkedProps(onlyToReview)}
            >
              <span className="truncate">{t("filterToReview")}</span>
              <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                {toReviewCount}
              </span>
            </CommandItem>
          </CommandGroup>
        </>
      ) : null}
    </SearchMenu>
  );
}

// ── Shared bricks list / detail ──────────────────── ─────────────────────

/** Compact summary of the categories of a return in the column — pad + 1st
    name + “+N” for the rest (MIN-52). TEXT, not badges: next to the
    status and author, three more pellets made a line of
    confetti where nothing could be read. */
function CategorySummary({
  categoryIds,
  categoryMap,
  separated = false,
}: {
  categoryIds: string[];
  categoryMap: Map<string, Category>;
  /**
   * Precede the summary with a separator bullet (“·”).
   *
   * It is rendered HERE, not by the caller, because it is here only
   * that we know if there will be something behind it: a deleted category
   * leaves its id on the return without `categoryMap` resolving it, and a
   * Caller who counted `categoryIds` would display a bullet followed by nothing.
   */
  separated?: boolean;
}) {
  const cats = categoryIds
    .map((id) => categoryMap.get(id))
    .filter((c): c is Category => !!c);
  if (cats.length === 0) return null;
  const [first, ...rest] = cats;
  return (
    <>
      {separated && (
        <span aria-hidden className="shrink-0 text-muted-foreground/60">
          ·
        </span>
      )}
      {/* `shrink-0`: on a line that is too short, it is the AUTHOR who is truncated.
          A category fits into one or two words and trimming them makes them
          unreadable, where a cut email remains recognizable at its beginning. */}
      <span className="flex shrink-0 items-center gap-1">
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: first.color }}
          aria-hidden
        />
        <span className="max-w-[7rem] truncate">{first.name}</span>
        {rest.length > 0 && <span className="shrink-0">+{rest.length}</span>}
      </span>
    </>
  );
}

/**
 * Voice counter of a return. Absent when the public board is turned off: without
 * No one can vote for him, and a permanent “0” would be a reproach.
 *
 * It is painted like the neutral chips of the rest of the app (`--control` +
 * `--foreground`, the pair that the tokens document for this) and not in gray
 * about nothing. In gray on nothing, it was not visible: the background was transparent,
 * the rule at `--border` disappears on a list line, and the text at
 * `--muted-foreground` dropped to ~4.6:1 on clear — even worse on a line
 * SELECTED, where the `bg-muted` of the line went up under muted text.
 * The number which decides the order of the column was the lightest on the screen,
 * right next to full bottom badges.
 */
function VoteCount({
  count,
  size = "sm",
  className,
}: {
  count: number;
  /**
   * `sm` for the column header, in the list badge template.
   * `md` in the file, where it opens the key/value table: there were neighboring
   * badges of 28 px with its 20, and the most important number of the return
   * was the smallest on the screen.
   */
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md border bg-control font-semibold tabular-nums text-foreground",
        size === "md" ? "h-7 gap-1.5 px-3 text-xs" : "gap-1 px-1.5 py-0.5 text-xs",
        className
      )}
    >
      <ChevronUp className={size === "md" ? "size-3.5" : "size-3"} />
      {count}
    </span>
  );
}

/**
 * Public or private, said by its color as much as by its word: blue for what
 * is exposed, orange for what remains for the team. These are the two halves
 * of the same question, so both are shown — a badge present on one side
 * and absence of the other reads like an oblivion, not like a state.
 */
function VisibilityBadge({
  isPublic,
  className,
}: {
  isPublic: boolean;
  className?: string;
}) {
  const t = useTranslations("FeedbackBoard");
  return (
    <Badge
      variant="secondary"
      icon={isPublic ? <Globe /> : <Lock />}
      className={cn(
        isPublic
          ? "border-sky-700/30 bg-sky-500/10 text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-400"
          : "border-amber-700/30 bg-amber-500/10 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-400",
        className
      )}
    >
      {isPublic ? t("public") : t("private")}
    </Badge>
  );
}

/**
 * A return that requires a human decision (MIN-87): not yet published, or
 * published but flagged as sensitive. This is the stuff of the “To see again” filter — without
 * him, a post that the automatic review was unable to resolve remains invisible.
 */
function needsHumanReview(post: TeamFeedbackListItem): boolean {
  return post.review_state !== "published" || post.sensitivity !== null;
}

/** The automatic review has given up (3 failures): to be decided by hand (MIN-87). */
function reviewGaveUp(post: {
  analysis_failures: number;
  classified_at: string | null;
}): boolean {
  return post.analysis_failures >= 3 && post.classified_at === null;
}

/**
 * IA Journal Status Badges (MIN-54): Pending Publication, and Alert
 * sensitive content (the pattern is in tooltip). Shared list + detail.
 *
 * The rejection is no longer there: it has become the status `spam`, and is therefore read with
 * the other statuses, where the team reads all its decisions.
 */
function ReviewBadges({
  reviewState,
  sensitivity,
  moderationReason,
  reviewFailed,
  className,
}: {
  reviewState: FeedbackReviewState;
  sensitivity: string | null;
  moderationReason: string | null;
  reviewFailed?: boolean;
  /** Badge template — tight in the column, full retail size. */
  className?: string;
}) {
  const t = useTranslations("FeedbackBoard");
  return (
    <>
      {reviewState === "pending" && (
        <Badge variant="secondary" icon={<Clock />} className={className}>
          {t("reviewPending")}
        </Badge>
      )}
      {reviewFailed && (
        <Badge
          variant="secondary"
          icon={<TriangleAlert />}
          title={t("reviewFailedHint")}
          className={cn("text-muted-foreground", className)}
        >
          {t("reviewFailed")}
        </Badge>
      )}
      {sensitivity && (
        <Badge
          variant="secondary"
          icon={<ShieldAlert />}
          title={moderationReason ?? undefined}
          className={cn(
            "border-amber-700/30 bg-amber-500/10 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-400",
            className
          )}
        >
          {t("sensitive")}
        </Badge>
      )}
    </>
  );
}

/**
 * The author of a return, as he is called everywhere: his name if we know it,
 * otherwise his email — never the two pasted together, which gave an extended line
 * neither of which we read. The email remains on hover, and is copied:
 * it's the recontact channel, the only thing we're looking for here.
 */
function AuthorValue({
  name,
  email,
  pseudonym,
  seed,
}: {
  name: string | null;
  email: string | null;
  pseudonym: string | null;
  /** Avatar seed resolved by `authorAvatarSeed`. */
  seed: string;
}) {
  const t = useTranslations("FeedbackBoard");
  const [copied, setCopied] = useState(false);
  const label = name?.trim() || email?.trim() || pseudonym || "";

  const copy = () => {
    if (!email) return;
    void navigator.clipboard
      .writeText(email)
      .then(() => {
        // The check mark in the tooltip and the toast say the same thing twice,
        // and this is intentional: the tooltip disappears as soon as you move the mouse away —
        // often the very gesture which follows the copy — and would carry its proof.
        setCopied(true);
        toast.success(t("emailCopied"));
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => toast.error(t("errorGeneric")));
  };

  const identity = (
    <span className="flex min-w-0 items-center gap-1.5">
      <UserAvatar seed={seed} className="size-5" />
      <span className="min-w-0 truncate text-sm">{label}</span>
    </span>
  );

  // Without email there is nothing to reveal on hover: the name is enough.
  if (!email) return identity;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? t("emailCopied") : t("copyEmail")}
          className="-mr-1.5 flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 outline-none transition-colors hover:bg-muted focus-visible:bg-muted"
        >
          {identity}
        </button>
      </TooltipTrigger>
      {/* Email, and the icon gesture — “Copy email” written in all
          letters next to the address doubled the width of the tooltip to
          repeat what a pair of leaves already says. The checkmark that replaces
          the icon is acknowledgment; the word remains, but
          `aria-label`, for those who do not see the icon. */}
      <TooltipContent className="flex items-center gap-2">
        {email}
        {copied ? (
          <Check className="size-3.5 shrink-0" />
        ) : (
          <Copy className="size-3.5 shrink-0 text-muted-foreground" />
        )}
      </TooltipContent>
    </Tooltip>
  );
}

// ── Column line ─────────────────────────── ───────────────────────────

/**
 * A return to the list — the pull requests template, filled with what a
 * return to its own: instead of the identifier, the number of votes (this is what
 * who sorts the list and what we compare to it); on the right, the state and the date
 * in “there is…”, because a return is judged by its freshness more than by its day.
 */
function FeedbackRow({
  post,
  selected,
  boardEnabled,
  dateLabel,
  categoryMap,
  memberSeeds,
  teamLanguage,
  onSelect,
}: {
  post: TeamFeedbackListItem;
  selected: boolean;
  boardEnabled: boolean;
  dateLabel: string;
  categoryMap: Map<string, Category>;
  /** Email → graine d'avatar des membres (cf. `authorAvatarSeed`). */
  memberSeeds: Map<string, string>;
  /** Team language — decides whether the stored translation is still valid. */
  teamLanguage: FeedbackLanguage;
  onSelect: () => void;
}) {
  // The column is read in the language of the team: a title that we do not understand
  // There is no point in choosing what to open. This is the only place where
  // translation is required without switching — there is no room for one.
  const title =
    (normalizeLanguage(post.translated_language) === teamLanguage
      ? post.translated_title
      : null) ?? post.title;
  const authorLabel = post.author?.name?.trim() || post.author?.email?.trim() || null;
  // “@” while hovering over this line speaks of THIS return (MIN-105). THE
  // title passed is the canonical and not the one displayed above: it is the one
  // that the ambient context already publishes, and two titles for the same return
  // depending on how you open it would read like two returns.
  const askNumoRef = useAskNumoFeedbackTarget(post);

  return (
    <button
      ref={askNumoRef}
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex w-full flex-col gap-1 rounded-lg px-3 py-2.5 text-left outline-none transition-colors",
        selected ? "bg-muted" : "hover:bg-muted/60 focus-visible:bg-muted/60"
      )}
    >
      <div className="flex items-center gap-2">
        {/* ONE box at the head of the line, and the two things that can occupy it
            never coexist: support for a public return, or the fact
            let it be private. A private return has no voice to show —
            no one can give it to him - and this is what should be read to him
            place. Without a published board, neither has any meaning. */}
        {boardEnabled ? (
          post.is_public ? (
            <VoteCount count={post.vote_count} />
          ) : (
            <VisibilityBadge isPublic={false} className={LIST_BADGE} />
          )
        ) : null}
        {post.issue_id ? (
          <Link2 className="size-3 shrink-0 text-muted-foreground" aria-hidden />
        ) : null}
        {post.suggested_merge_into_id ? (
          <Sparkles className="size-3 shrink-0 text-brand" aria-hidden />
        ) : null}
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          <FeedbackStatusBadge status={post.status} className={LIST_BADGE} />
          <span className="text-xs text-muted-foreground">{dateLabel}</span>
        </span>
      </div>

      <span className="line-clamp-2 text-sm font-medium leading-snug">{title}</span>

      {/* ONE line, always. She moved to the line (`flex-wrap`): a card
          gained a floor as soon as an author had a long email, and the column
          began to breathe irregularly from one line to another — on one
          list that we go through vertically, it's the rhythm that breaks, not
          only the place. `overflow-hidden` allows children to shrink;
          the AUTHOR is the only one who does it, because he is the only one whose
          length is unpredictable (an email, sometimes very long) and the only
          whose ending means nothing. */}
      <span className="flex min-w-0 items-center gap-1.5 overflow-hidden text-xs text-muted-foreground">
        {authorLabel ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <UserAvatar
              seed={authorAvatarSeed(post.author, memberSeeds)}
              className="size-3.5 shrink-0"
            />
            <span className="truncate">{authorLabel}</span>
          </span>
        ) : null}
        <ReviewBadges
          reviewState={post.review_state}
          sensitivity={post.sensitivity}
          moderationReason={post.moderation_reason}
          reviewFailed={reviewGaveUp(post)}
          className={LIST_BADGE}
        />
        <CategorySummary
          categoryIds={post.category_ids}
          categoryMap={categoryMap}
          // The chip only separates two TEXTS: it therefore asks for an author from its
          // LEFT. Review badges are pellets — they are
          // stand out on their own, and framing them with points would make punctuation
          // autour de ce qui n'en demande pas.
          separated={!!authorLabel}
        />
      </span>
    </button>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function FeedbackTeamPage() {
  const t = useTranslations("FeedbackBoard");
  const tCommon = useTranslations("Common");
  const format = useFormatter();
  const now = useNow();
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const searchParams = useSearchParams();
  const postParam = searchParams.get("post");
  const router = useRouter();
  const pathname = usePathname();
  const { projects } = useProjects();
  const project = projects.find((p) => p.id === projectId);
  const queryClient = useQueryClient();
  // The wizard provisions and creates secrets: it is only offered to the owner.
  const { user } = useAuth();
  const isOwner = !!project && project.owner_id === user?.id;
  const [setupOpen, setSetupOpen] = useState(false);

  const { data: listData, isPending } = useQuery({
    queryKey: ["feedback", projectId],
    queryFn: () =>
      api<{ posts: TeamFeedbackListItem[]; board_enabled: boolean }>(
        `/api/projects/${projectId}/feedback`
      ),
  });
  const posts = useMemo(() => listData?.posts ?? [], [listData]);
  const boardEnabled = listData?.board_enabled ?? false;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [query, setQuery] = useState("");

  // We arrive on this page to decide what is not decided: the
  // column therefore opens on the open returns, and not on the hundreds
  // archives which buried them.
  const [state, setState] = useState<FeedbackStateFilter>("unresolved");
  const [sort, setSort] = useState<FeedbackSort>("top");
  const [onlyToReview, setOnlyToReview] = useState(false);
  const toReviewCount = useMemo(() => posts.filter(needsHumanReview).length, [posts]);
  useEffect(() => {
    if (toReviewCount === 0 && onlyToReview) setOnlyToReview(false);
  }, [toReviewCount, onlyToReview]);

  const visiblePosts = useMemo(() => {
    const kept = posts.filter(
      (p) => matchesStateFilter(p, state) && (!onlyToReview || needsHumanReview(p))
    );
    /**
     * The sort chosen is the sort obtained — NOTHING goes ahead.
     *
     * The list arrived already ordered by the server: decreasing votes, then
     * date, and especially the resolved returns pushed down to the bottom. The latter
     * rule predated the sort selector, where it was useful. From
     * that we can ask for “the most popular”, she is lying: the most
     * supported by the project, if delivered, is at the bottom of the list, and
     * the most RECENT is displayed at the top. An order we asked for
     * explicitly cannot be corrected by a heuristic.
     */
    const sorted = [...kept];
    if (sort === "top") {
      sorted.sort(
        (a, b) =>
          b.vote_count - a.vote_count ||
          Date.parse(b.created_at) - Date.parse(a.created_at)
      );
    } else {
      sorted.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
      if (sort === "recent") sorted.reverse();
    }
    return sorted;
  }, [posts, state, onlyToReview, sort]);

  /**
   * What the column DISPLAYS. One notch BELOW `visiblePosts`, which carries the
   * selection: the text filter must not move it, otherwise each keystroke
   * would change the open return to the right — while we filter precisely for
   * go find another one, and choose it yourself.
   *
   * The SUBMITTED text is searched as much as the canonical text: it is often
   * with the words of the author that we remember a return, not with the title
   * rewritten by the team.
   */
  const listedPosts = useMemo(() => {
    if (!query.trim()) return visiblePosts;
    return visiblePosts.filter((p) =>
      matchesFilter(query, [
        p.title,
        p.body,
        p.submitted_title,
        p.submitted_body,
        // We seek a return with the words we READ: the translated title is
        // the one that the column displays, so it must respond to the keystroke.
        p.translated_title,
        p.translated_body,
        p.author?.name,
        p.author?.email,
        p.author?.pseudonym,
      ])
    );
  }, [visiblePosts, query]);

  // Side panel issue: the linked ticket opens HERE, without navigation — even
  // cabling as the board (issues + relationships + project collections).
  const { issues, createIssue, updateIssue, deleteIssue, setCategories } =
    useIssuesQuery(projectId);
  const { relations, addRelation, removeRelation } = useIssueRelationsQuery(projectId);
  const { members } = useMembersQuery(projectId, !!project);
  const { categories } = useCategoriesQuery(projectId);
  const { objectives } = useObjectivesQuery(projectId);
  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories]
  );
  const memberSeeds = useMemberSeeds(members);
  const teamLanguage =
    normalizeLanguage(project?.feedback_team_language) ??
    (normalizeLanguage(defaultLocale) as FeedbackLanguage);

  // Publishes the selected feedback to Numo (MIN-52): it resolves “this feedback”,
  // “promote it”, “reply to it” on this post without looking for it — like the
  // panneau d'issue publie l'issue ouverte.
  const selectedPost = posts.find((p) => p.id === selectedId) ?? null;

  // “Save current view” (⌘K): the open return to the right is a
  // page selection, but `?post=` is consumed then deleted from the address
  // (same idiom as `?open=` of objectives) — without this publication, the view
  // saved would reopen the list on its first element.
  //
  // The proposed name bears the PROJECT, as on the objectives: the field is arriving
  // pre-selected, Enter accepts it, and “Returns” for short is the same
  // name on each project — the second view would overwrite the first.
  usePublishCurrentView({
    href: buildViewHref(pathname, searchParams.toString(), {
      post: selectedPost?.id ?? null,
    }),
    label: project
      ? selectedPost
        ? `${project.name} · ${selectedPost.title}`
        : `${project.name} · ${t("title")}`
      : t("title"),
  });

  useAssistantContext(
    project
      ? selectedPost
        ? { projectId, feedbackId: selectedPost.id, feedbackTitle: selectedPost.title }
        : { projectId }
      : null
  );

  /**
   * “@” when hovering over a line (MIN-105): the TARGET return goes into Numo, even
   * if it is not the one that is open on the right. The explicit past context
   * here prevails over the ambient published just above - otherwise the shortcut
   * would only ever talk about the already selected return.
   */
  const { open: openAssistant } = useAssistantPanel();
  const handleAskNumo = useCallback(
    (post: AskNumoFeedback) => {
      openAssistant({
        projectId,
        pageContext: {
          projectId,
          feedbackId: post.id,
          feedbackTitle: post.title,
        },
      });
    },
    [openAssistant, projectId]
  );
  const [openIssueId, setOpenIssueId] = useState<string | null>(null);
  const openIssue: Issue | null = issues.find((i) => i.id === openIssueId) ?? null;
  const handleAddRelation = useCallback(
    (sourceId: string, type: IssueRelationType, targetId: string) => {
      void addRelation(sourceId, type, targetId).catch((err) =>
        toast.error((err as Error).message)
      );
    },
    [addRelation]
  );
  const handleRemoveRelation = useCallback(
    (relationId: string) => {
      void removeRelation(relationId).catch((err) => toast.error((err as Error).message));
    },
    [removeRelation]
  );

  useEffect(() => {
    if (visiblePosts.length === 0) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    if (!selectedId || !visiblePosts.some((p) => p.id === selectedId)) {
      setSelectedId(visiblePosts[0].id);
    }
  }, [visiblePosts, selectedId]);

  // Deep link from an Inbox notification: ?post=<id> selects that feedback and
  // opens the detail on mobile, then strips the param so a background list
  // refetch can't snap the selection back (same idiom as the objectives ?open).
  //
  // The filter returns to “all”: the targeted return can be delivered, declined or
  // discarded, and the link should open it regardless of its state.
  //
  // We EXPECT the list to carry the targeted return, like the objectives page
  // wait for his. Cold (new tab, saved view, tracked notification
  // from a link), `posts` is still empty: the guard effect just above
  // reset the selection to zero on the next rendering — and `?post=` had already been
  // erased from the address, so nothing could restore it. The link
  // fell on the first return in the list.
  useEffect(() => {
    if (!postParam) return;
    if (!posts.some((p) => p.id === postParam)) return;
    setState("all");
    setOnlyToReview(false);
    setSelectedId(postParam);
    setMobileDetail(true);
    router.replace(pathname);
  }, [postParam, posts, pathname, router]);

  // Invalidates the list AND all project details (prefix): a merge/undo
  // also changes the canonical post, not just the one we are looking at. THE
  // sidebar badge also follows (open/planned counter).
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["feedback", projectId] });
    void queryClient.invalidateQueries({ queryKey: ["feedback-detail", projectId] });
    void queryClient.invalidateQueries({ queryKey: ["feedback-count", projectId] });
  };

  const createDialog = (
    <InternalFeedbackDialog
      projectId={projectId}
      members={members}
      boardEnabled={boardEnabled}
      open={createOpen}
      onOpenChange={setCreateOpen}
      onCreated={(postId) => {
        refresh();
        // A return just entered is opened: it falls into the filter by
        // default. But if the column is elsewhere, open it without bringing it back there
        // would select a post that the list does not show.
        setState("all");
        setSelectedId(postId);
      }}
    />
  );

  // Nothing at all (not “nothing in this filter”): the two columns no longer have
  // nothing to show, and the screen should say where the feedback is coming from rather than
  // to display an empty list next to a "select return". Both
  // gestures remain within reach: grab one in your hand, and go and adjust the
  // collection — it is she who then fills the page.
  if (!isPending && posts.length === 0) {
    return (
      <>
        <div className="flex h-full flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
            <div className="mx-auto max-w-5xl">
              <EmptyScene icon={MessagesSquare} title={t("emptyTitle")}>
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus />
                  {t("newFeedback")}
                </Button>
                {/* Pay for the collection is done HERE, not at the end of a link:
                    this is the gesture that the scene proposes, and send it into a
                    settings tab would make him leave the page he came from
                    fill. One member only has the ability to read the settings
                    offer — he therefore keeps the link. */}
                {isOwner ? (
                  <Button variant="outline" onClick={() => setSetupOpen(true)}>
                    <Globe />
                    {t("emptyConfigure")}
                  </Button>
                ) : (
                  <Button variant="outline" asChild>
                    <Link href={`/projects/${projectId}/settings?tab=feedback`}>
                      <Globe />
                      {t("emptyConfigure")}
                    </Link>
                  </Button>
                )}
              </EmptyScene>
            </div>
          </div>
        </div>

        {/* The dialog remains edited: it is this that “New Return” opens. */}
        {createDialog}

        {/* The board was able to turn on during the course, and `board_enabled` comes
            from the list: refetch it when closing, otherwise the page continues to
            refuse to post feedback on a board that is now active. */}
        {isOwner && (
          <FeedbackSetupWizard
            projectId={projectId}
            isOwner={isOwner}
            open={setupOpen}
            onOpenChange={(next) => {
              setSetupOpen(next);
              if (!next) {
                void queryClient.invalidateQueries({
                  queryKey: ["feedback", projectId],
                });
              }
            }}
          />
        )}
      </>
    );
  }

  return (
    /* “@” when hovering over a row of the column opens Numo on this return
       (MIN-105). The context passes through the secondary bar portal, which
       is only deported to the DOM. */
    <AskNumoFeedbackProvider onAskNumo={handleAskNumo}>
    <div className="flex h-full min-h-0">
      {/* ── Liste ────────────────────────────────────────────────────────── */}
      <SecondarySidebar
        title={t("title")}
        hiddenOnMobile={mobileDetail}
        filter={{
          value: query,
          onChange: setQuery,
          placeholder: t("filterPlaceholder", { count: listedPosts.length }),
          clearLabel: tCommon("clearFilter"),
        }}
        actions={
          <>
            <FeedbackFilterMenu
              state={state}
              sort={sort}
              onlyToReview={onlyToReview}
              toReviewCount={toReviewCount}
              onStateChange={setState}
              onSortChange={setSort}
              onToReviewChange={setOnlyToReview}
            />
            {/* Icon alone: ​​the complete wording took up half of the line.
                Ce qu'il disait revient au survol — un vrai tooltip, celui de
                the app, not the browser tooltip. */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="-mr-2 text-muted-foreground hover:text-foreground"
                  aria-label={t("newFeedback")}
                  onClick={() => setCreateOpen(true)}
                >
                  <Plus className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("newFeedback")}</TooltipContent>
            </Tooltip>
          </>
        }
      >
        <div className="min-h-0 flex-1">
          {isPending ? (
            <div className="flex flex-col gap-2 p-4">
              <Skeleton className="h-16 w-full rounded-lg" />
              <Skeleton className="h-16 w-full rounded-lg" />
              <Skeleton className="h-16 w-full rounded-lg" />
            </div>
          ) : listedPosts.length === 0 ? (
            /* Returns necessarily exist here — the entirely empty surface
               is discussed above. The list can therefore only be empty because
               that a filter emptied it, and the same scene as the other states
               blanks says it, to the size of the column.
               “Nothing matches” and “no returns open” are not the
               same news: the first is repaired by erasing three letters,
               the second asks to reopen the filter — hence the button, which has no
               nothing to offer as long as it is the seizure that restricts. */
            <EmptyScene
              size="compact"
              icon={MessagesSquare}
              /* The empty column NAMES what we were looking for. “No return in
                 this filter" returned to reopen the menu to remember which one
                 was asked — while the answer lies in the sentence.
                 The order matters: a seizure that does not match anything is repaired in
                 erasing three letters, and it is this news that takes precedence
                 on the state, whatever it may be. */
              title={
                query.trim()
                  ? tCommon("noFilterMatch")
                  : onlyToReview
                    ? t("emptyToReview")
                    : state === "unresolved"
                      ? t("emptyUnresolved")
                      : state === "all"
                        ? t("emptyFiltered")
                        : // Key assembled at runtime: it escapes typing
                          // keys, hence the cast (see CLAUDE.md).
                          t(`emptyStatus.${state}` as MessageKey<"FeedbackBoard">)
              }
              className="py-10"
            >
              {query.trim() ? null : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setState("all");
                    setOnlyToReview(false);
                  }}
                >
                  {t("emptyShowAll")}
                </Button>
              )}
            </EmptyScene>
          ) : (
            /* The SAME line as triage, agents and pull requests:
               a rounded pellet in an 8 px gutter, not a banner
               pleine largeur. Quatre listes qui se ressemblent doivent se
               resemble even in the form of their selection. */
            <ul className="flex flex-col gap-1 px-2 pt-2 pb-4">
              {listedPosts.map((post) => (
                <li key={post.id}>
                  <FeedbackRow
                    post={post}
                    selected={selectedId === post.id}
                    boardEnabled={boardEnabled}
                    dateLabel={format.relativeTime(new Date(post.created_at), now)}
                    categoryMap={categoryMap}
                    memberSeeds={memberSeeds}
                    teamLanguage={teamLanguage}
                    onSelect={() => {
                      setSelectedId(post.id);
                      setMobileDetail(true);
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </SecondarySidebar>

      {/* ── Detail ──────────────────────────── ──────────────────────────── */}
      <div className={cn("min-w-0 flex-1", !mobileDetail && "hidden md:block")}>
        {selectedId ? (
          <FeedbackDetail
            key={selectedId}
            projectId={projectId}
            project={project ?? null}
            projectKey={project?.key ?? ""}
            postId={selectedId}
            boardEnabled={boardEnabled}
            allPosts={posts}
            members={members}
            categories={categories}
            objectives={objectives}
            issues={issues}
            onBack={() => setMobileDetail(false)}
            onChanged={refresh}
            onOpenIssue={setOpenIssueId}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">{t("selectPost")}</p>
          </div>
        )}
      </div>

      {createDialog}

      <IssueSidePanel
        issue={openIssue}
        open={!!openIssue}
        onOpenChange={(next) => {
          if (!next) setOpenIssueId(null);
        }}
        projectKey={project?.key ?? ""}
        members={members}
        categories={categories}
        objectives={objectives}
        allIssues={issues}
        relations={relations}
        onUpdate={updateIssue}
        onDelete={async (issueId) => {
          await deleteIssue(issueId);
          setOpenIssueId(null);
          refresh();
        }}
        onSetCategories={setCategories}
        onCreate={createIssue}
        onOpenIssue={setOpenIssueId}
        onAddRelation={handleAddRelation}
        onRemoveRelation={handleRemoveRelation}
      />
    </div>
    </AskNumoFeedbackProvider>
  );
}

// ── Detail ───────────────────────────────── ─────────────────────────────────

function FeedbackDetail({
  projectId,
  project,
  projectKey,
  postId,
  boardEnabled,
  allPosts,
  members,
  categories,
  objectives,
  issues,
  onBack,
  onChanged,
  onOpenIssue,
}: {
  projectId: string;
  /** The project itself — the promotion form needs it. */
  project: Project | null;
  projectKey: string;
  postId: string;
  /** Public board published: without it, no voice or public/private choice. */
  boardEnabled: boolean;
  allPosts: TeamFeedbackListItem[];
  /** Project members + issues — resolve actor names and issue refs in the feed. */
  members: Member[];
  /** Project categories (those of outcomes) — reused here (MIN-52). */
  categories: Category[];
  /** Project objectives — the promotion form selector. */
  objectives: Objective[];
  issues: Issue[];
  onBack: () => void;
  onChanged: () => void;
  /** Opens the issue side panel directly (no navigation). */
  onOpenIssue: (issueId: string) => void;
}) {
  const t = useTranslations("FeedbackBoard");
  const tStatus = useTranslations("PublicFeedback");
  const tField = useTranslations("Field");
  const tCommon = useTranslations("Common");
  const format = useFormatter();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const memberSeeds = useMemberSeeds(members);
  // The language the journal translates into. NULL in base = never entered
  // (project before the migration): same fallback as on the server side, so that the
  // two judge a translation valid on the same criterion.
  const teamLanguage =
    normalizeLanguage(project?.feedback_team_language) ??
    (normalizeLanguage(defaultLocale) as FeedbackLanguage);
  const {
    items: activityItems,
    addComment,
    updateComment,
    deleteComment,
    deleteAttachment,
  } = useFeedbackTimeline(projectId, postId);

  // IssueActivity is generic — the feedback thread wires the same handlers as
  // the issue/objective panels (onReply flips the arg order of addComment).
  const handleReply = useCallback(
    (
      parentId: string,
      body: string,
      mentionedUserIds: string[],
      attachments: ResourceInput[]
    ) => addComment(body, mentionedUserIds, parentId, attachments),
    [addComment]
  );
  const handleComment = useCallback(
    (
      body: string,
      mentionedUserIds: string[],
      attachments: ResourceInput[],
      visibility: CommentVisibility
    ) => addComment(body, mentionedUserIds, null, attachments, visibility),
    [addComment]
  );

  const { data, isPending } = useQuery({
    queryKey: ["feedback-detail", projectId, postId],
    queryFn: () =>
      api<{ post: TeamFeedbackDetail }>(`/api/projects/${projectId}/feedback/${postId}`),
  });
  const post = data?.post ?? null;

  // describeFeedbackEvent reads members (actors) + issues/projectKey (refs);
  // objectives/categories are not used for feedback. `feedbackAuthor` names it
  // submission board: the person who wrote, with the same name and face
  // than the author sheet below — never two spellings two blocks apart.
  const author = post?.author ?? null;
  const authorSeed = authorAvatarSeed(author, memberSeeds);
  const eventCtx = useMemo<EventContext>(
    () => ({
      members,
      objectives: [],
      categories: [],
      issues,
      projectKey,
      feedbackAuthor: author
        ? {
            label: author.name?.trim() || author.email?.trim() || author.pseudonym,
            seed: authorSeed,
          }
        : null,
    }),
    [members, issues, projectKey, author, authorSeed]
  );

  const [title, setTitle] = useState("");
  const [mergeOpen, setMergeOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  /**
   * Refusing and rejecting require confirmation: these are the two gestures
   * who say no to someone, and the only team screen where they care about
   * one click — on the button, under its chevron, and in the status selector
   * the form, which has exactly the same status.
   *
   * The opening and the targeted status are TWO states rather than a single nullable one:
   * the box remains on the screen for the duration of its exit animation, and a state
   * reset to null would make it reread “Refuse” at the very moment when we close
   * « Marquer comme spam ».
   */
  const [confirmStatus, setConfirmStatus] = useState<"declined" | "spam">("declined");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const askStatus = (status: "declined" | "spam") => {
    setConfirmStatus(status);
    setConfirmOpen(true);
  };
  // Translated, the return opens with its translation: this is the version that
  // the team can read. The seesaw is by return and starts again from zero by changing
  // back (`key={selectedId}` brings up all the details).
  const [showTranslated, setShowTranslated] = useState(true);

  useEffect(() => {
    if (post) setTitle(post.title);
  }, [post?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshDetail = () => {
    void queryClient.invalidateQueries({ queryKey: ["feedback-detail", projectId] });
    // The activity feed has no realtime: each action refreshes it.
    void queryClient.invalidateQueries({ queryKey: ["feedback-events", projectId] });
    onChanged();
  };

  const patch = useMutation({
    mutationFn: (updates: Record<string, unknown>) =>
      api(`/api/projects/${projectId}/feedback/${postId}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      }),
    onSuccess: refreshDetail,
    onError: (e: Error) => toast.error(e.message || t("errorGeneric")),
  });

  const action = useMutation({
    mutationFn: ({ path, body: payload }: { path: string; body?: unknown }) =>
      api(`/api/projects/${projectId}/feedback/${path}`, {
        method: "POST",
        body: JSON.stringify(payload ?? {}),
      }),
    onSuccess: (_data, variables) => {
      // All team actions (promote, merge, cancel a team)
      // fusion…) go through this mutation: the last segment of the path IS
      // the name of the action. A single instrumentation point rather than one
      // button, and future actions are automatically covered.
      const verb = variables.path.split("/").filter(Boolean).pop() ?? "unknown";
      trackEvent("feedback_action", { action: verb });
      return refreshDetail();
    },
    onError: (e: Error) => toast.error(e.message || t("errorGeneric")),
  });

  // Post categories (MIN-52): optimistic + debounce 300 ms, like cards
  // of outcome. Quick toggles patch the cache right away and merge into
  // a single PUT of the final game (avoids the concurrent delete-then-insert on the
  // junction table). Error → toast + authoritative refetch.
  const catTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const catLatest = useRef<string[] | null>(null);
  const flushCategories = useCallback(
    (ids: string[]) =>
      api(`/api/projects/${projectId}/feedback/${postId}/categories`, {
        method: "PUT",
        body: JSON.stringify({ category_ids: ids }),
      }),
    [projectId, postId]
  );
  const handleCategoriesChange = useCallback(
    (ids: string[]) => {
      queryClient.setQueryData<{ post: TeamFeedbackDetail }>(
        ["feedback-detail", projectId, postId],
        (old) => (old ? { post: { ...old.post, category_ids: ids } } : old)
      );
      queryClient.setQueryData<{ posts: TeamFeedbackListItem[]; board_enabled: boolean }>(
        ["feedback", projectId],
        (old) =>
          old
            ? {
                ...old,
                posts: old.posts.map((p) =>
                  p.id === postId ? { ...p, category_ids: ids } : p
                ),
              }
            : old
      );
      catLatest.current = ids;
      if (catTimer.current) clearTimeout(catTimer.current);
      catTimer.current = setTimeout(() => {
        catTimer.current = null;
        const finalIds = catLatest.current ?? ids;
        catLatest.current = null;
        void flushCategories(finalIds).catch((e: Error) => {
          toast.error(e.message || t("errorGeneric"));
          void queryClient.invalidateQueries({ queryKey: ["feedback", projectId] });
          void queryClient.invalidateQueries({ queryKey: ["feedback-detail", projectId] });
        });
      }, 300);
    },
    [projectId, postId, queryClient, flushCategories, t]
  );
  // Exiting the detail before the end of the debounce should not lose the edition:
  // we flush the pending write to unmount (the optimistic patch is already installed).
  useEffect(() => {
    return () => {
      if (!catTimer.current) return;
      clearTimeout(catTimer.current);
      catTimer.current = null;
      const ids = catLatest.current;
      catLatest.current = null;
      if (ids) void flushCategories(ids).catch(() => {});
    };
  }, [flushCategories]);

  // The fade that replaces the border under the top bar: it only appears
  // on the side where there is still something to discover.
  //
  // It is declared HERE, far from the JSX which uses it, and not just above
  // him: it's a HOOK, and the loading skeleton makes it lower. Called
  // after this `return`, it did not exist at the first rendering (`post` still null)
  // and appeared in the second — “Rendered more hooks than during the previous
  // render", and the entire Returns screen fell on its error boundary as soon as
  // that a project had feedback to display.
  const detailFade = useScrollFade<HTMLDivElement>();

  if (isPending || !post) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const rawDiffers =
    post.submitted_title !== post.title || post.submitted_body !== post.body;

  /**
   * The translation, if the magazine has produced one AND it is still valid.
   *
   * `translated_language` is compared to the language of the team: a team that
   * goes from French to English based on French translations, and the
   * presenting it as “the version you can read” would be a lie.
   * They will only reappear if the language returns — we do not re-translate
   * l'historique.
   */
  const translation =
    post.translated_title &&
    normalizeLanguage(post.translated_language) === teamLanguage
      ? { title: post.translated_title, body: post.translated_body }
      : null;

  /**
   * The status of a return linked to a ticket is no longer its own: `status-sync` on
   * copies from the issue at each change. Leave it editable here
   * would offer a gesture that the next ticket transition would overwrite — hence
   * reading only, on the status as well as on the shortcuts that set it.
   */
  const statusLocked = !!post.issue;

  /**
   * We answered no. There is no longer a ticket to generate from a return
   * refused or discarded — still proposing “Promote” would reopen, with one click
   * without confirmation, a decision that we have just made.
   *
   * The gesture is not lost however: it returns as soon as the status
   * returns to open, and this status is just below, in the file.
   */
  const settledAsNo = post.status === "declined" || post.status === "spam";

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Top bar, sorting style: return (mobile) · identifiers (voice,
          source, date) on the left · what we DO with the return on the right. What he
          EST — status, visibility, type, author — can be read below, in the
          key/value table, with the rest of its properties.
          WITHOUT border: it is the fading of the content which says that it continues
          above, and a separate bar would cut it off from what it covers (even
          part as the pull request and the agent conversation). */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 py-3 md:px-6">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("title")}
          className="md:hidden"
          onClick={onBack}
        >
          <ChevronLeft />
        </Button>
        {/* What's left here: review alerts, the only things that require
            a reaction. The voices, the date and the origin came down
            in the key/value table, with the rest of what the return IS. */}
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <ReviewBadges
            reviewState={post.review_state}
            sensitivity={post.sensitivity}
            moderationReason={post.moderation_reason}
            reviewFailed={reviewGaveUp(post)}
          />
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {/* The linked ticket is no longer ANNOUNCED here: it has its row in the
              file, with its status, title and detachment. Only remains
              the gesture that only exists before it — making one. */}
          {post.issue || settledAsNo ? null : (
            <SplitButton
              variant="outline"
              size="sm"
              disabled={action.isPending}
              onClick={() => setPromoteOpen(true)}
              menuLabel={t("linkToIssue")}
              menu={
                <DropdownMenuItem onSelect={() => setLinkOpen(true)}>
                  <Link2 className="size-4" />
                  {t("linkToIssue")}
                </DropdownMenuItem>
              }
            >
              {t("promote")}
            </SplitButton>
          )}
          {/* Both results from a still open return: we take it, or we
              denied. The third case — it was not a return — lives under the
              chevron: this is a judgment on the sender, not on the request,
              and it doesn't have to be a click away. */}
          {post.status === "open" && !statusLocked ? (
            <SplitButton
              // Destructive: to refuse is to say no to someone. The button
              // must say it before the click, not after.
              variant="destructive"
              size="sm"
              disabled={patch.isPending}
              onClick={() => askStatus("declined")}
              menuLabel={t("markSpam")}
              menu={
                <DropdownMenuItem onSelect={() => askStatus("spam")}>
                  <Ban className="size-4" />
                  {t("markSpam")}
                </DropdownMenuItem>
              }
            >
              {t("decline")}
            </SplitButton>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="…">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {/* IA Review (MIN-54): the team can publish feedback that the
                  review hasn't let it go yet. To dismiss it is
                  become a status — it arises in the key/value table. */}
              {post.review_state !== "published" && (
                <DropdownMenuItem
                  onSelect={() => patch.mutate({ review_state: "published" })}
                >
                  <Send className="size-4" />
                  {t("publishReview")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => setMergeOpen(true)}>
                <GitMerge className="size-4" />
                {t("mergeInto")}
              </DropdownMenuItem>
              {/* Unlink followed the ticket in the file: it is done on the
                  line of the ticket itself, where you see it. */}
              <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
                <Trash2 className="size-4" />
                {t("deletePost")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Scrolling body, centered like the yard. */}
      <div
        ref={detailFade.ref}
        {...detailFade.scrollProps}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-6"
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
        {post.suggested_merge_into_id && post.suggested_title && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-brand/30 bg-brand/5 px-3 py-2">
            <Sparkles className="size-3.5 shrink-0 text-brand" />
            <p className="min-w-0 flex-1 text-xs">
              {t("suggestionBanner", {
                title: post.suggested_title,
                confidence: Math.round((post.suggested_confidence ?? 0) * 100),
              })}
            </p>
            <div className="flex gap-1.5">
              <Button
                size="sm"
                variant="outline"
                disabled={action.isPending}
                onClick={() =>
                  action.mutate({ path: `${postId}/suggestion`, body: { action: "accept" } })
                }
              >
                {t("acceptSuggestion")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={action.isPending}
                onClick={() =>
                  action.mutate({ path: `${postId}/suggestion`, body: { action: "reject" } })
                }
              >
                {t("rejectSuggestion")}
              </Button>
            </div>
          </div>
        )}

        {/* Title + description brought together, as in triage — the
            description is edited in rendered markdown (same editor).

            Translated, the return opens ON its translation: this is the version that
            the team can read, and hiding it behind a tab would amount to
            for not having translated it. But it is READ ONLY — edit
            a translation would produce a text that no longer connects to what
            the user wrote, and that the next review pass would overwrite
            without knowing it. The canonical layer is edited as before, under
            l'onglet « version originale ». */}
        {translation ? (
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
              {([true, false] as const).map((wanted) => (
                <button
                  key={String(wanted)}
                  type="button"
                  aria-pressed={showTranslated === wanted}
                  onClick={() => setShowTranslated(wanted)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    showTranslated === wanted
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {wanted ? t("translated") : t("original")}
                </button>
              ))}
            </div>
            {showTranslated ? (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Languages className="size-3.5" />
                {t("translatedFrom", {
                  language: languageLabel(post.source_language ?? "", locale),
                })}
              </span>
            ) : null}
          </div>
        ) : null}

        {translation && showTranslated ? (
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl leading-tight font-semibold">{translation.title}</h2>
            {translation.body ? (
              <Markdown className="text-sm">{translation.body}</Markdown>
            ) : null}
            <p className="text-xs text-muted-foreground">{t("translatedReadOnly")}</p>
          </div>
        ) : (
        <div className="flex flex-col gap-2">
          <AutoTextarea
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => {
              const trimmed = title.trim();
              if (trimmed && trimmed !== post.title) patch.mutate({ title: trimmed });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            className="w-full overflow-hidden bg-transparent text-2xl leading-tight font-semibold outline-none placeholder:text-muted-foreground/50"
            maxLength={200}
          />
          <MarkdownEditor
            key={post.id}
            value={post.body}
            onCommit={(markdown) => {
              if (markdown !== post.body) patch.mutate({ body: markdown });
            }}
            placeholder={t("postBodyPlaceholder")}
            className="min-h-16"
          />
        </div>
        )}

        {/* What the person wrote, word for word — the withdrawal we come from
            look for when the text above has been retouched. Its place is HERE,
            stuck to this text: it is the version from before, and
            returned under the form it became a property of the return, which it
            is not. Chevron rather than the native triangle, like the others
            unfoldable sections of the app, and a net on the left which places it in
            quote: it is a text that we reread, not one more field that we
            could edit. */}
        {rawDiffers && (
          <details className="group rounded-md border border-border/60 px-3 py-2">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
              <ChevronRight className="size-3.5 shrink-0 transition-transform group-open:rotate-90" />
              {t("rawTitle")}
            </summary>
            {/* ml-1.5 + pl-3: the net falls in the axis of the rafter, and the
                text takes exactly the margin of the wording above. */}
            <div className="mt-2 ml-1.5 flex flex-col gap-1.5 border-l-2 border-border/60 pl-3 text-sm">
              <p className="font-medium">{post.submitted_title}</p>
              {post.submitted_body ? (
                <p className="whitespace-pre-wrap text-muted-foreground">
                  {post.submitted_body}
                </p>
              ) : (
                // Without this line, "sent without description" and "description
                // unchanged, only the title has moved" are similar: nothing under
                // the title. She says which of the two we are reading.
                <p className="italic text-muted-foreground/70">{t("rawNoBody")}</p>
              )}
            </div>
          </details>
        )}

        {/* Whatever the return IS, on key/value rows — same
            controls as the exit panel. It's here, and nowhere else,
            that we read its status, its nature, its visibility, its author. */}
        <div className="flex flex-col">
          {/* At the top of the list: support. This is the number we come from
              compare, and whoever decides the order of the column. He doesn't
              consider only where we can give — board published AND return
              audience ; on a private return it would be a number that will not move
              jamais. */}
          {boardEnabled && post.is_public ? (
            <PropertyRow label={t("votes")}>
              <VoteCount count={post.vote_count} size="md" />
            </PropertyRow>
          ) : null}

          <PropertyRow label={tField("status")}>
            {statusLocked ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <FeedbackStatusBadge status={post.status} />
                  </span>
                </TooltipTrigger>
                <TooltipContent>{t("statusLockedHint")}</TooltipContent>
              </Tooltip>
            ) : (
              <SearchSelect
                value={post.status}
                onChange={(value) => {
                  if (!value || value === post.status) return;
                  // The selector sets the same status as the “Refuse” button and
                  // than its “spam” entry: it therefore asks for the same
                  // confirmation. Other statuses (planned, in progress, delivered,
                  // open) do not close anything and go directly.
                  if (value === "declined" || value === "spam") {
                    askStatus(value);
                    return;
                  }
                  patch.mutate({ status: value });
                }}
                options={FEEDBACK_POST_STATUSES.map((status) => ({
                  value: status,
                  label: tStatus(`status.${status}`),
                  icon:
                    status === "spam" ? (
                      <Ban className="size-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <StatusIndicator
                        status={FEEDBACK_TO_ISSUE_STATUS[status]}
                        className="size-4 shrink-0"
                      />
                    ),
                }))}
                align="end"
                tooltip={tField("status")}
                trigger={
                  <button type="button" className={BADGE_TRIGGER}>
                    <FeedbackStatusBadge status={post.status} />
                  </button>
                }
              />
            )}
          </PropertyRow>

          {/* The linked ticket, based on the model of ticket relationships: the line
              ALWAYS exists, even when empty. It is she who learns that a return
              can carry a ticket — hidden until there is one, she
              taught it only to those who already knew it. Empty, its trigger
              opens search; garnished, the ticket reads below, full
              width, because a title does not fit in the right half
              of a key/value row. */}
          <PropertyRow label={t("linkedIssue")}>
            {post.issue ? null : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={t("linkToIssue")}
                    className={cn(TRIGGER, "text-muted-foreground")}
                    onClick={() => setLinkOpen(true)}
                  >
                    <Link2 className="size-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{t("linkToIssue")}</TooltipContent>
              </Tooltip>
            )}
          </PropertyRow>
          {post.issue ? (
            <div className="group/linked mb-2 flex items-center gap-2 rounded-md px-1.5 py-1.5 hover:bg-muted/60">
              <button
                type="button"
                onClick={() => onOpenIssue(post.issue!.id)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <StatusIndicator
                  status={post.issue.status as Issue["status"]}
                  className="size-4 shrink-0"
                />
                <span className="w-14 shrink-0 font-mono text-xs text-muted-foreground">
                  {issueIdentifier(projectKey, post.issue.number)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {issues.find((i) => i.id === post.issue!.id)?.title ??
                    issueIdentifier(projectKey, post.issue.number)}
                </span>
              </button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("unlinkIssue")}
                className="size-6 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/linked:opacity-100 focus-visible:opacity-100"
                onClick={() =>
                  void api(`/api/projects/${projectId}/feedback/${postId}/link`, {
                    method: "DELETE",
                  })
                    .then(refreshDetail)
                    .catch((e: Error) => toast.error(e.message || t("errorGeneric")))
                }
              >
                <X />
              </Button>
            </div>
          ) : null}

          {/* Internal/external: who does this feedback come from? This is not editable
              — it is a fact about its provenance, not a decision — so the
              hover explains instead of opening. He also says WHERE he is
              arrived (board, API), what the top bar carried before: the
              distinction remains useful, but not to the point of occupying a line. */}
          <PropertyRow label={t("feedbackType")}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0} className="rounded-md px-1.5 py-1 text-sm outline-none">
                  {post.source === "internal" ? t("typeInternal") : t("typeExternal")}
                </span>
              </TooltipTrigger>
              <TooltipContent>{t(`typeHint.${post.source}`)}</TooltipContent>
            </Tooltip>
          </PropertyRow>

          {/* Public or private — the question only arises if there is a board
              where to publish. */}
          {boardEnabled ? (
            <PropertyRow label={t("visibility")}>
              <SearchSelect
                value={post.is_public ? "public" : "private"}
                onChange={(value) => {
                  const next = value === "public";
                  if (next !== post.is_public) patch.mutate({ is_public: next });
                }}
                options={[
                  {
                    value: "public",
                    label: t("public"),
                    icon: <Globe className="size-4 shrink-0" />,
                  },
                  {
                    value: "private",
                    label: t("private"),
                    icon: <Lock className="size-4 shrink-0" />,
                  },
                ]}
                align="end"
                tooltip={post.is_public ? t("publicHint") : t("privateHint")}
                trigger={
                  <button type="button" className={BADGE_TRIGGER}>
                    <VisibilityBadge isPublic={post.is_public} />
                  </button>
                }
              />
            </PropertyRow>
          ) : null}

          {post.author && (post.author.name || post.author.email) && (
            <PropertyRow label={t("author")}>
              <AuthorValue
                name={post.author.name}
                email={post.author.email}
                pseudonym={post.author.pseudonym}
                seed={authorAvatarSeed(post.author, memberSeeds)}
              />
            </PropertyRow>
          )}

          <PropertyRow label={tField("categories")}>
            <CategoryValue
              categories={categories}
              projectId={projectId}
              value={post.category_ids}
              onChange={handleCategoriesChange}
            />
          </PropertyRow>

          <PropertyRow label={t("createdAt")}>
            <span className="text-sm">
              {format.dateTime(new Date(post.created_at), { dateStyle: "medium" })}
            </span>
          </PropertyRow>
        </div>

        {post.merged_from.length > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <GitMerge className="size-3" />
            {t("mergedFromLabel")} : {post.merged_from.map((m) => m.title).join(" · ")}
          </p>
        )}

        {post.merge_events.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded-md border border-border/60 px-3 py-2">
            <p className="text-xs font-medium text-muted-foreground">{t("merges")}</p>
            {post.merge_events.map((event) => (
              <div key={event.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="min-w-0 truncate">
                  {event.dup_title ?? event.dup_id} ·{" "}
                  {event.performed_by === "ai" ? t("byAi") : t("byTeam")}
                  {event.confidence !== null &&
                    ` (${Math.round(event.confidence * 100)} %)`}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={action.isPending}
                  onClick={() => action.mutate({ path: `merges/${event.id}/undo` })}
                >
                  <Undo2 className="size-3.5" />
                  {t("undo")}
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Activity log + THE feedback thread — internal and public in the
            same list (MIN-196). “Team Response” is no longer a section
            except above: it was a field that the product published on its
            own page, even though it's someone replying to someone. She
            is now written where everything else is written, the seesaw of
            composer deciding to whom. */}
        <div className="flex flex-col gap-3">
          <IssueActivity
            items={activityItems}
            ctx={eventCtx}
            entity="feedback"
            currentUserId={user?.id ?? null}
            projectId={projectId}
            onReply={handleReply}
            onEditComment={updateComment}
            onDeleteComment={deleteComment}
            onDeleteAttachment={deleteAttachment}
          />
          <CommentComposer
            members={members}
            projectId={projectId}
            onSubmit={handleComment}
            // Without a published board, a public comment has no pages where
            // displayed: the toggle remains visible but off, and says
            // why rather than disappearing without explanation.
            publicOption={{
              disabledReason: boardEnabled ? undefined : t("publicNeedsBoard"),
            }}
          />
        </div>
        </div>
      </div>

      <MergeDialog
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        boardEnabled={boardEnabled}
        // Neither this return, nor a return already carried by a ticket, nor spam:
        // absorbing a real return in a discarded post would bury it behind a
        // tombstone that the board no longer shows (same guard as the AI ​​review).
        candidates={allPosts.filter(
          (p) => p.id !== postId && !p.issue_id && p.status !== "spam"
        )}
        onMerge={(canonicalId) => {
          setMergeOpen(false);
          action.mutate({ path: `${postId}/merge`, body: { canonical_id: canonicalId } });
        }}
      />
      <LinkIssueDialog
        projectId={projectId}
        projectKey={projectKey}
        open={linkOpen}
        onOpenChange={setLinkOpen}
        onLink={(issueId) => {
          setLinkOpen(false);
          action.mutate({ path: `${postId}/link`, body: { issue_id: issueId } });
        }}
      />
      {/* Promoting means opening the ticket creation form already
          filled by the return — not make a ticket behind whose back
          click. The return gives what it knows (title, text, categories);
          effort, priority, assignment and deadline are judgments
          team, and ask themselves here rather than reopening the ticket just
          After. It's the SAME form as everywhere else: its shortcuts
          field, his dictation and his drafts come with it.
          `projects` only carries the current project: a return belongs to
          his project, “creating in another project” would not make sense and
          would leave the link behind. */}
      <CreateIssueDialog
        open={promoteOpen}
        onOpenChange={setPromoteOpen}
        projectId={projectId}
        projects={project ? [project] : []}
        members={members}
        categories={categories}
        objectives={objectives}
        initialTitle={post.title}
        initialDescription={post.body}
        initialCategoryIds={post.category_ids}
        analyticsSource="feedback"
        onCreate={async (input) => {
          await api(`/api/projects/${projectId}/feedback/${postId}/promote`, {
            method: "POST",
            body: JSON.stringify(input),
          });
          trackEvent("feedback_action", { action: "promote" });
          setPromoteOpen(false);
          refreshDetail();
        }}
        // Unattainable (no other projects in the list), but the prop is
        // required: failing loudly is better than a ticket created
        // elsewhere and detached from his return.
        onCreateInProject={() => Promise.reject(new Error(t("errorGeneric")))}
      />
      {/* Refuse/discard. Nothing is destroyed — the status is replaced later
          suddenly — but both see each other from the outside: one displays a no on the
          board, the other takes the return. The box says which one. */}
      <ConfirmDeleteDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={
          confirmStatus === "spam"
            ? t("markSpamTitle", { title: post.title })
            : t("declineTitle", { title: post.title })
        }
        description={
          confirmStatus === "spam" ? t("markSpamConfirm") : t("declineConfirm")
        }
        confirmLabel={confirmStatus === "spam" ? t("markSpam") : t("decline")}
        cancelLabel={tCommon("cancel")}
        // The failure is already indicated by the `onError` of the mutation: we swallow the
        // rejection so that the box closes on the toast, and not on a
        // uncaptured promise that would leave it open and frozen.
        onConfirm={async () => {
          await patch.mutateAsync({ status: confirmStatus }).catch(() => {});
        }}
      />
      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t("deletePostTitle", { title: post.title })}
        description={t("deletePostConfirm", { days: TRASH_RETENTION_DAYS })}
        confirmLabel={t("deletePost")}
        cancelLabel={tCommon("cancel")}
        onConfirm={async () => {
          await api(`/api/projects/${projectId}/feedback/${postId}`, { method: "DELETE" });
          setDeleteOpen(false);
          onChanged();
        }}
      />
    </div>
  );
}

// ── Dialogs ──────────────────────────────────────────────────────────────────

/**
 * Merge this return INTO another.
 *
 * Two steps, and this is deliberate: we choose the parent return, then we confirm
 * while reading it. A merge moves votes and redirects a public URL;
 * it unravels, but after the fact, and a click in a list of nearby titles
 * is not a place to be silently wrong.
 */
function MergeDialog({
  open,
  onOpenChange,
  boardEnabled,
  candidates,
  onMerge,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boardEnabled: boolean;
  candidates: TeamFeedbackListItem[];
  onMerge: (canonicalId: string) => void;
}) {
  const t = useTranslations("FeedbackBoard");
  const tCommon = useTranslations("Common");
  const [search, setSearch] = useState("");
  const [confirming, setConfirming] = useState<TeamFeedbackListItem | null>(null);
  const filtered = candidates.filter((p) =>
    p.title.toLowerCase().includes(search.trim().toLowerCase())
  );

  const close = (next: boolean) => {
    if (!next) {
      setSearch("");
      setConfirming(null);
    }
    onOpenChange(next);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitMerge className="size-4 text-brand" />
              {t("mergeDialogTitle")}
            </DialogTitle>
            <DialogDescription>{t("mergeDialogDesc")}</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("mergeSearchPlaceholder")}
          />
          <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
            {filtered.map((post) => (
              <button
                key={post.id}
                type="button"
                onClick={() => setConfirming(post)}
                className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
              >
                <span className="min-w-0 truncate">{post.title}</span>
                {boardEnabled ? (
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    ▲ {post.vote_count}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirming} onOpenChange={(next) => !next && setConfirming(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("mergeConfirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("mergeConfirmDesc", { title: confirming?.title ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirming(null)}>
              {tCommon("cancel")}
            </Button>
            <Button
              onClick={() => {
                const target = confirming;
                setConfirming(null);
                if (target) onMerge(target.id);
              }}
            >
              <GitMerge className="size-4" />
              {t("merge")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Link to an existing issue: search by title or identifier, the
    closed issues (canceled/duplicate) are excluded. */
function LinkIssueDialog({
  projectId,
  projectKey,
  open,
  onOpenChange,
  onLink,
}: {
  projectId: string;
  projectKey: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLink: (issueId: string) => void;
}) {
  const t = useTranslations("FeedbackBoard");
  const { issues } = useIssuesQuery(open ? projectId : null);
  const [search, setSearch] = useState("");

  const needle = search.trim().toLowerCase();
  const candidates = issues
    .filter((issue) => issue.status !== "canceled" && issue.status !== "duplicate")
    .filter(
      (issue) =>
        !needle ||
        issue.title.toLowerCase().includes(needle) ||
        issueIdentifier(projectKey, issue.number).toLowerCase().includes(needle)
    )
    .slice(0, 30);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setSearch("");
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="size-4 text-brand" />
            {t("linkToIssue")}
          </DialogTitle>
          <DialogDescription>{t("linkIssueDialogDesc")}</DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("linkIssueSearchPlaceholder")}
        />
        <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
          {candidates.map((issue) => (
            <button
              key={issue.id}
              type="button"
              onClick={() => onLink(issue.id)}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
            >
              <StatusIndicator status={issue.status} className="size-4 shrink-0" />
              <code className="shrink-0 font-mono text-xs text-muted-foreground">
                {issueIdentifier(projectKey, issue.number)}
              </code>
              <span className="min-w-0 truncate">{issue.title}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Saisie interne ───────────────────────────────────────────────────────────

/** The author chosen in the composer: someone we already know, or a
    fresh email. Both resolve to the same identity on the server side. */
interface ComposerAuthor {
  email: string;
  name: string | null;
  /** Team member avatar seed — see {@link authorAvatarSeed}. */
  seed?: string | null;
}

/**
 * The seed of an author's avatar.
 *
 * A team member ALREADY has a face in minddy, drawn once
 * for all (`public.user_avatars`) and displayed everywhere else — on its
 * tickets, in the activity feed, in the assignee selector. Sow it here
 * on his email he would draw a second one, unrelated to the first:
 * the same person, two faces, on two neighboring screens.
 *
 * Hence the order: the seed of the account if it has one, the email otherwise (a visitor
 * of the board does not have an account, and his email is what is stable), the
 * pseudonyme en dernier recours.
 */
function authorAvatarSeed(
  author: { email?: string | null; pseudonym?: string | null } | null,
  memberSeeds: Map<string, string>
): string {
  const email = author?.email?.trim().toLowerCase() || null;
  return (
    (email ? memberSeeds.get(email) : null) ?? email ?? author?.pseudonym ?? ""
  );
}

/** Email (lower case) → avatar seed, for project members. */
function useMemberSeeds(members: Member[]): Map<string, string> {
  return useMemo(
    () =>
      new Map(
        members
          .filter((m) => m.email)
          .map((m) => [m.email!.trim().toLowerCase(), m.avatar_seed])
      ),
    [members]
  );
}

/**
 * In whose name the team enters this return.
 *
 * Retyping the head email created a SECOND identity at the slightest mistake — with
 * his pseudonym, voice and history separated. The field therefore offers those
 * who have already written or voted, and only accepts free entry after having
 * shown that none of them match.
 */
function AuthorPicker({
  projectId,
  members,
  value,
  onChange,
  onCreateRequested,
}: {
  projectId: string;
  /** The members of the project — they too have feedback to give. */
  members: Member[];
  value: ComposerAuthor | null;
  onChange: (author: ComposerAuthor | null) => void;
  /** Switches the field to a new person's input, with what was typed. */
  onCreateRequested: (typed: string) => void;
}) {
  const t = useTranslations("FeedbackBoard");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data } = useQuery({
    queryKey: ["feedback-users", projectId, search.trim()],
    queryFn: () =>
      api<{ users: TeamFeedbackUserOption[] }>(
        `/api/projects/${projectId}/feedback/users?q=${encodeURIComponent(search.trim())}`
      ),
    enabled: open,
  });
  const users = data?.users ?? [];
  const typed = search.trim();

  /**
   * The team first. A return typed by hand very often comes from
   * the interior — someone came across a defect, reported it in a meeting, and
   * we record it. Without the members in this list, it was necessary to retype
   * memory the email of a colleague who is already in the project.
   *
   * They are NOT filtered by hand: cmdk already filters the items on their
   * value and their keywords, and doing it twice would give two results
   * different for the same keystroke.
   */
  const teamOptions = useMemo(
    () => members.filter((m) => m.email),
    [members]
  );
  // A member who has already written on the board ALSO has a line on the visitors side:
  // it's the same person, and it's the "team" entry that we keep - she
  // only bears his real face and account name.
  const teamEmails = useMemo(
    () => new Set(teamOptions.map((m) => m.email!.trim().toLowerCase())),
    [teamOptions]
  );
  const visitorOptions = users.filter(
    (u) => !u.email || !teamEmails.has(u.email.trim().toLowerCase())
  );

  const pick = (author: ComposerAuthor) => {
    onChange(author);
    setSearch("");
    setOpen(false);
  };

  return (
    <SearchMenu
      open={open}
      onOpenChange={(next) => {
        if (!next) setSearch("");
        setOpen(next);
      }}
      align="start"
      searchValue={search}
      onSearchValueChange={setSearch}
      searchPlaceholder={t("authorSearchPlaceholder")}
      // “No results” never has the last word here: the creative line
      // just below IS the answer when nothing matches.
      hideEmpty
      contentClassName="w-80"
      trigger={
        <button
          type="button"
          className="flex min-w-0 items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm outline-none transition-colors hover:bg-muted focus-visible:border-ring"
        >
          {value ? (
            <>
              <UserAvatar seed={value.seed || value.email} className="size-5" />
              <span className="min-w-0 truncate">{value.name?.trim() || value.email}</span>
            </>
          ) : (
            <span className="text-muted-foreground">{t("authorPlaceholder")}</span>
          )}
        </button>
      }
    >
      <CommandGroup heading={t("authorTeamGroup")}>
        {teamOptions.map((m) => (
          <CommandItem
            key={m.user_id}
            value={`member-${m.user_id}`}
            keywords={[m.email ?? "", m.full_name ?? ""]}
            onSelect={() =>
              pick({ email: m.email!, name: m.full_name, seed: m.avatar_seed })
            }
          >
            {/* His account seed, not his email: the same face as everywhere
                elsewhere in minddy. */}
            <UserAvatar seed={m.avatar_seed} className="size-5 shrink-0" />
            <span className="flex min-w-0 flex-col">
              <span className="truncate">{displayName(m)}</span>
              {m.full_name?.trim() && m.email ? (
                <span className="truncate text-xs text-muted-foreground">{m.email}</span>
              ) : null}
            </span>
          </CommandItem>
        ))}
      </CommandGroup>
      <CommandGroup heading={t("authorPeopleGroup")}>
        {visitorOptions.map((u) => (
          <CommandItem
            key={u.id}
            value={u.id}
            keywords={[u.email ?? "", u.name ?? "", u.pseudonym]}
            onSelect={() =>
              u.email ? pick({ email: u.email, name: u.name }) : undefined
            }
            disabled={!u.email}
          >
            <UserAvatar seed={u.email || u.pseudonym} className="size-5 shrink-0" />
            <span className="flex min-w-0 flex-col">
              <span className="truncate">{u.name?.trim() || u.email || u.pseudonym}</span>
              {u.name?.trim() && u.email ? (
                <span className="truncate text-xs text-muted-foreground">{u.email}</span>
              ) : null}
            </span>
          </CommandItem>
        ))}
      </CommandGroup>
      {/* Creating someone is ALWAYS within reach, not just when the
          search fails: most often, enter a return received by email,
          it's capturing a person you've never seen before. `forceMount` custody
          displayed when cmdk finds nothing — that is, precisely where
          elle sert. */}
      <CommandSeparator alwaysRender className="my-1" />
      <CommandGroup forceMount>
        <CommandItem
          forceMount
          value="__new__"
          keywords={[t("authorCreate")]}
          onSelect={() => {
            setOpen(false);
            setSearch("");
            onCreateRequested(typed);
          }}
        >
          <Plus className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">
            {typed ? t("authorNew", { name: typed }) : t("authorCreate")}
          </span>
        </CommandItem>
      </CommandGroup>
    </SearchMenu>
  );
}

/**
 * The new person: email and name, the two fields that the internal entry has
 * always had. They come back because the selector alone had lost them —
 * we could only find someone, never register them, while
 * entering a return received by email almost always starts there.
 *
 * Rendered ON-SITE, in the composer, rather than in a second dialog:
 * stacking two modals for two fields costs more in attention than this
 * qu'elles demandent.
 */
function NewAuthorFields({
  email,
  name,
  onEmailChange,
  onNameChange,
  onCancel,
}: {
  email: string;
  name: string;
  onEmailChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("FeedbackBoard");
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <Input
        autoFocus
        type="email"
        value={email}
        onChange={(e) => onEmailChange(e.target.value)}
        placeholder={t("authorEmail")}
        className="h-8 min-w-0 flex-1"
      />
      <Input
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        placeholder={t("authorName")}
        className="h-8 min-w-0 flex-1"
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("authorBack")}
            onClick={onCancel}
          >
            <Undo2 className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("authorBack")}</TooltipContent>
      </Tooltip>
    </div>
  );
}

/**
 * Enter feedback received elsewhere — an email, a call, a conversation.
 *
 * Same writing surface as the composer of the public board: the title and the
 * bodies are free fields, without chrome, because what we write here ends
 * exactly the same place. What is added is what the visitor does not have
 * to choose: IN WHOSE NAME we write.
 */
function InternalFeedbackDialog({
  projectId,
  members,
  boardEnabled,
  open,
  onOpenChange,
  onCreated,
}: {
  projectId: string;
  /** The members of the project, proposed as authors in the same way as the
      visiteurs du board. */
  members: Member[];
  boardEnabled: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (postId: string) => void;
}) {
  const t = useTranslations("FeedbackBoard");
  const tCommon = useTranslations("Common");
  const tDictate = useTranslations("Dictate");
  const locale = useLocale();
  const [author, setAuthor] = useState<ComposerAuthor | null>(null);
  // New person being entered. `null` = we are on the selector.
  const [draftAuthor, setDraftAuthor] = useState<{ email: string; name: string } | null>(
    null
  );
  const [title, setTitle] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [busy, setBusy] = useState(false);
  // The MarkdownEditor only commits to blur — the ref always carries the
  // last committed value, and submit() forces the blur before reading.
  const bodyRef = useRef("");
  const [initialBody, setInitialBody] = useState("");
  const [editorKey, setEditorKey] = useState(0);

  // ── Dictation ──────────────────────────────── ────────────────────────────────
  // The same gesture as on the public board, on the same pair of fields: we tell
  // the return received, Numo writes it down. What changes is due to transport — here we are
  // authenticated, and it is the member who speaks who pays.

  const [transcribing, setTranscribing] = useState(false);

  const applyPatch = (patch: { title?: string; body?: string }) => {
    if (patch.title !== undefined) setTitle(patch.title);
    if (patch.body !== undefined) {
      bodyRef.current = patch.body;
      setInitialBody(patch.body);
      setEditorKey((k) => k + 1);
    }
  };

  const {
    busy: numoBusy,
    onTranscript,
    noteRun,
    reset: resetDictation,
  } = useFeedbackDictation({
    getDraft: () => ({ title, body: bodyRef.current }),
    applyPatch,
    dictate: async ({ runId, transcript, draft, history }) => {
      const res = await fetch(`/api/projects/${projectId}/dictate-feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, transcript, draft, history }),
      });
      if (!res.ok) {
        if (res.status === 503) {
          toast.error(tDictate("unavailable"));
          return { ok: false, handled: true };
        }
        if (res.status === 429) {
          const data = (await res.json().catch(() => ({}))) as { retry_after?: number };
          const minutes = Math.max(1, Math.ceil((data.retry_after ?? 3600) / 60));
          toast.error(tDictate("rateLimitReached", { minutes }));
          return { ok: false, handled: true };
        }
        return { ok: false };
      }
      const data = (await res.json()) as {
        patch: { title?: string; body?: string };
        reply: string;
      };
      return { ok: true, patch: data.patch, reply: data.reply };
    },
  });

  /** Listening goes through the common transcription route, but is part of the
      ledger under `feedback_voice`: at the usage counter, dictating a return is
      an expense of “Returns”, not of “Voice dictation”. */
  const uploadAudio = async (blob: Blob): Promise<string | null> => {
    const form = new FormData();
    form.append(
      "audio",
      blob,
      `feedback.${blob.type.includes("ogg") ? "ogg" : "webm"}`
    );
    form.append("lang", locale);
    form.append("feature", "feedback_voice");
    const res = await fetch("/api/transcribe", { method: "POST", body: form });
    if (!res.ok) {
      if (res.status === 413) toast.error(tDictate("tooLarge"));
      else if (res.status === 429) {
        const data = (await res.json().catch(() => ({}))) as { retry_after?: number };
        const minutes = Math.max(1, Math.ceil((data.retry_after ?? 60) / 60));
        toast.error(tDictate("rateLimitReached", { minutes }));
      } else toast.error(tDictate("error"));
      return null;
    }
    const data = (await res.json()) as { text?: string; runId?: string };
    noteRun(data.runId ?? null);
    return data.text ?? "";
  };

  const reset = () => {
    setAuthor(null);
    setDraftAuthor(null);
    setTitle("");
    setIsPublic(true);
    bodyRef.current = "";
    setInitialBody("");
    setEditorKey((k) => k + 1);
    resetDictation();
  };

  /**
   * Who signs this return, whatever the method: the person chosen in the
   * list, or the one we are currently listing. An email is the minimum —
   * it is he who resolves the identity on the server side (`upsertFeedbackUser`), and
   * it is through him that we will contact again.
   */
  const resolvedAuthor: ComposerAuthor | null = draftAuthor
    ? draftAuthor.email.trim().includes("@")
      ? { email: draftAuthor.email.trim(), name: draftAuthor.name.trim() || null, seed: null }
      : null
    : author;

  const canSubmit = !busy && !numoBusy && !!title.trim() && !!resolvedAuthor;

  const submit = async () => {
    const signer = resolvedAuthor;
    if (busy || numoBusy || !title.trim() || !signer) return;
    setBusy(true);
    try {
      (document.activeElement as HTMLElement | null)?.blur();
      await new Promise((resolve) => setTimeout(resolve, 0));
      const created = await api<{ post: { id: string } }>(
        `/api/projects/${projectId}/feedback`,
        {
          method: "POST",
          body: JSON.stringify({
            title: title.trim(),
            body: bodyRef.current.trim(),
            is_public: boardEnabled ? isPublic : false,
            user: { email: signer.email, name: signer.name ?? undefined },
          }),
        }
      );
      reset();
      onOpenChange(false);
      onCreated(created.post.id);
    } catch (err) {
      toast.error((err as Error).message || t("errorGeneric"));
    } finally {
      setBusy(false);
    }
  };

  const requestClose = () => {
    // A dictation in flight lands in this form: closing it would throw it away.
    if (transcribing || numoBusy) {
      toast.info(tDictate("inFlight"), { id: "dictation-in-flight" });
      return;
    }
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) requestClose();
        else onOpenChange(true);
      }}
    >
      {/* ⌘/Ctrl+Enter sends from ANY field in the modal — the title
          like the body. The shortcut is placed here rather than on each field
          because the body is a rich editor: the key goes back to it through
          bubbling. `defaultPrevented` leaves priority to the editor
          when he uses it himself (exiting a block of code). */}
      <DialogContent
        className="top-24 translate-y-0 gap-0 sm:max-w-xl"
        onKeyDown={(e) => {
          if (e.defaultPrevented || !isSendShortcut(e)) return;
          e.preventDefault();
          void submit();
        }}
      >
        <DialogTitle className="sr-only">{t("internalDialogTitle")}</DialogTitle>
        <AutoTextarea
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            void submit();
          }}
          placeholder={t("postTitlePlaceholder")}
          maxLength={200}
          className="w-full overflow-hidden bg-transparent text-xl leading-tight font-semibold outline-none placeholder:text-muted-foreground/50"
        />
        <MarkdownEditor
          key={editorKey}
          value={initialBody}
          onCommit={(markdown) => {
            bodyRef.current = markdown;
          }}
          placeholder={t("postBodyPlaceholder")}
          className="mt-3 min-h-24"
        />

        <div className="mt-4 flex items-center justify-between gap-4">
          <span className="shrink-0 text-sm font-medium">{t("authorLabel")}</span>
          {draftAuthor ? (
            <NewAuthorFields
              email={draftAuthor.email}
              name={draftAuthor.name}
              onEmailChange={(email) => setDraftAuthor((d) => ({ ...d!, email }))}
              onNameChange={(name) => setDraftAuthor((d) => ({ ...d!, name }))}
              onCancel={() => setDraftAuthor(null)}
            />
          ) : (
            <AuthorPicker
              projectId={projectId}
              members={members}
              value={author}
              onChange={setAuthor}
              // What has been typed is not lost in passing: an email leaves
              // in the email field, everything else in the name field.
              onCreateRequested={(typed) => {
                setAuthor(null);
                setDraftAuthor(
                  typed.includes("@")
                    ? { email: typed, name: "" }
                    : { email: "", name: typed }
                );
              }}
            />
          )}
        </div>

        {boardEnabled ? (
          <div className="mt-3 flex items-center justify-between gap-4 rounded-lg border px-3 py-2.5">
            <label
              htmlFor="internal-feedback-public"
              className="flex min-w-0 cursor-pointer flex-col"
            >
              <span className="text-sm font-medium">{t("public")}</span>
              <span className="text-xs text-muted-foreground">
                {isPublic ? t("publicHint") : t("privateHint")}
              </span>
            </label>
            <Switch
              id="internal-feedback-public"
              checked={isPublic}
              onCheckedChange={setIsPublic}
            />
          </div>
        ) : null}

        {/* The voice on the left, the creation on the right — the same bar as on the board
            public and only in the ticket modal. While Numo tidies up, his face
            takes the place of the microphone. */}
        <div className="mt-3 flex items-center justify-between gap-4 border-t pt-3">
          {numoBusy ? (
            <span
              className="-ml-2 inline-flex size-8 shrink-0 items-center justify-center"
              aria-hidden
            >
              <NumoIcon
                state="thinking"
                className="size-6 text-primary animate-in fade-in duration-300"
              />
            </span>
          ) : (
            <DictateButton
              onTranscription={onTranscript}
              uploadAudio={uploadAudio}
              onProcessingChange={setTranscribing}
              disabled={busy}
              shortcutKey="mod+shift+d"
              className="-ml-2"
            />
          )}
          {numoBusy && (
            <span className="sr-only" role="status">
              {tDictate("numoWorking")}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button type="button" variant="ghost" disabled={busy || numoBusy} onClick={requestClose}>
              {tCommon("cancel")}
            </Button>
            <SendShortcutTooltip scope="form" label={t("create")}>
              <Button disabled={!canSubmit} onClick={() => void submit()}>
                {busy && <Spinner />}
                {t("create")}
              </Button>
            </SendShortcutTooltip>
          </div>
        </div>

        {/* Numo takes over the dictation: the border highlights the edge of the modal during
            that he is working — same signal as his face, higher up. */}
        <AgentBeamOverlay active={numoBusy} />
      </DialogContent>
    </Dialog>
  );
}
