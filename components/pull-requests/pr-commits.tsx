"use client";

import { useMemo, useState } from "react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import {
  Badge,
  Button,
  Skeleton,
} from "mangue-ui";
import { ShieldCheck } from "lucide-react";
import { AuthorNames, AuthorStack } from "@/components/git/author-stack";
import { normalizeForgeInstant } from "@/lib/forge-time";
import { PrCommitDiffSheet } from "@/components/pull-requests/pr-commit-diff-sheet";
import { ShaButton } from "@/components/pull-requests/pr-sha-button";
import type { PullRequestCommit } from "@/lib/agent-api";
import { newestFirstPullRequestCommits } from "@/lib/pull-request-commits";
import { REPO_PROVIDERS, type RepoProviderId } from "@/lib/repo-providers";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Commits tab of a pull request: what COMPOSES it, in the order in which the
 * work was done — the view that minddy did not have and which forced us to open
 * the forge to know in how long, and in how many gestures, a PR
 * had arrived there.
 *
 * Rendering modeled on GitHub, because it is a standard and not a place to
 * customize: groups by day, commit title, author + relative date, SHA runs
 * in a minivan (copiable). The whole row is the way in (MIN-548): it opens
 * the diff of the commit in the side panel, and the +/− counters and the
 * copy-SHA stay as secondary gestures on the right.
 */

/** The title of a commit message — its first line. The body never renders
    here anymore (MIN-548): the diff sheet shows the full message. */
function commitTitle(message: string): string {
  const newline = message.indexOf("\n");
  return (newline === -1 ? message : message.slice(0, newline)).trim();
}

/**
 * Group key = the local DAY of the commit. Undated commits all fall
 * in the same empty group: rendering then gives them the “Commits” header
 * naked rather than a made-up date.
 */
function dayKey(authoredAt: string | null): string {
  if (!authoredAt) return "";
  const d = new Date(authoredAt);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

interface CommitDay {
  key: string;
  /** The group's date, or null when none of its commits have one. */
  date: Date | null;
  commits: PullRequestCommit[];
}

/** Consecutive group per day — the list arrives already sorted from most recent. */
function groupByDay(commits: PullRequestCommit[]): CommitDay[] {
  const days: CommitDay[] = [];
  for (const commit of commits) {
    const key = dayKey(commit.authoredAt);
    const last = days[days.length - 1];
    if (last && last.key === key) {
      last.commits.push(commit);
      continue;
    }
    days.push({
      key,
      date: key && commit.authoredAt ? new Date(commit.authoredAt) : null,
      commits: [commit],
    });
  }
  return days;
}

/**
 * The weight of the commit, AND its way in (MIN-548): the +/− counters are
 * themselves the button that opens the diff — the numbers sit in the same
 * place as before, but they click.
 */
function CommitStats({
  additions,
  deletions,
  onOpen,
}: {
  additions: number;
  deletions: number;
  onOpen: () => void;
}) {
  const t = useTranslations("PullRequests");
  const format = useFormatter();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          data-testid="pr-commit-stats"
          aria-label={t("viewCommitDiff")}
          className="flex h-7 items-center gap-1.5 rounded-md px-2 text-sm font-medium tabular-nums outline-none transition-colors hover:bg-muted focus-visible:bg-muted"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
        >
          <span className="text-green-700 dark:text-green-500">
            +{format.number(additions)}
          </span>
          <span className="text-red-700 dark:text-red-500">
            −{format.number(deletions)}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{t("viewCommitDiff")}</TooltipContent>
    </Tooltip>
  );
}

function CommitRow({
  commit,
  provider,
  onOpenDiff,
}: {
  commit: PullRequestCommit;
  provider: RepoProviderId;
  /** Open the diff of THIS commit in the side panel. */
  onOpenDiff: (sha: string) => void;
}) {
  const t = useTranslations("PullRequests");
  const format = useFormatter();
  const now = useNow();
  const title = useMemo(() => commitTitle(commit.message), [commit.message]);

  // ALL authors, principal first (MIN-159): a co-signed commit has
  // several, and this is the common case as soon as an agent has held the keyboard. THE
  // fallback — the forge did not respond, or the cached response dates from before
  // deployment that added the field — is the primary author alone, exactly
  // what this view displayed before.
  const authors =
    commit.authors?.length
      ? commit.authors
      : commit.author || commit.authorName
        ? [
            {
              login: commit.author?.login ?? null,
              name: commit.authorName ?? commit.author?.login ?? commit.sha,
              avatar_url: commit.author?.avatar_url ?? null,
            },
          ]
        : [];

  const openDiff = () => onOpenDiff(commit.sha);

  return (
    <li
      role="button"
      tabIndex={0}
      onClick={openDiff}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openDiff();
        }
      }}
      className="flex cursor-pointer items-start gap-3 px-3.5 py-3 outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50"
    >
      <AuthorStack authors={authors} className="mt-0.5" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {/* The title no longer opens the diff BY ITSELF: the whole row is the
            gesture, and it stays plain — no underline, no hover tint of its
            own, the row already reacts as one surface. */}
        <p className="min-w-0 text-sm leading-snug font-medium break-words">
          {title || t("commitNoMessage")}
        </p>
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
          <AuthorNames authors={authors} />
          {normalizeForgeInstant(commit.authoredAt, now) ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  {t("committedAt", {
                    time: format.relativeTime(
                      normalizeForgeInstant(commit.authoredAt, now) as Date,
                      now,
                    ),
                  })}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {format.dateTime(normalizeForgeInstant(commit.authoredAt, now) as Date, {
                  dateStyle: "long",
                  timeStyle: "short",
                })}
              </TooltipContent>
            </Tooltip>
          ) : null}
        </p>
      </div>
      {/* Signature: only displayed when the forge has VERIFIED it. `null` wants
          say “we don’t know” (GitLab), and an “unverified” on all
          commits to an MR would make silence look like a defect. */}
      {commit.verified ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="secondary"
              icon={<ShieldCheck className="size-3" />}
              className="mt-0.5 h-6 shrink-0 border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-500"
            >
              {t("commitVerified")}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {t("commitVerifiedHint", { provider: REPO_PROVIDERS[provider].displayName })}
          </TooltipContent>
        </Tooltip>
      ) : null}
      <div className="flex shrink-0 items-start gap-1">
        {/* The two gestures read side by side (MIN-548): copy the SHA, and —
            through its own numbers — open what the commit changes. Silent
            when the forge was unable to give the numbers: “+0 −0” would read
            as an empty commit, and that's not what we know. */}
        <ShaButton sha={commit.sha} />
        {commit.additions != null && commit.deletions != null ? (
          <CommitStats
            additions={commit.additions}
            deletions={commit.deletions}
            onOpen={openDiff}
          />
        ) : null}
      </div>
    </li>
  );
}

export function PrCommits({
  prId,
  commits,
  truncated,
  loading,
  provider,
}: {
  prId: string;
  commits: PullRequestCommit[];
  /** The PR has more commits than minddy can list in one go. */
  truncated: boolean;
  loading: boolean;
  provider: RepoProviderId;
}) {
  const t = useTranslations("PullRequests");
  const format = useFormatter();
  const days = useMemo(
    () => groupByDay(newestFirstPullRequestCommits(commits)),
    [commits],
  );
  // The commit whose diff we look at, and the opening of the panel — two states
  // and not one: the sha must SURVIVE the closure, which Radix animates.
  const [diffSha, setDiffSha] = useState<string | null>(null);
  const [diffOpen, setDiffOpen] = useState(false);
  const openDiff = (sha: string) => {
    setDiffSha(sha);
    setDiffOpen(true);
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-32 rounded-lg" />
      </div>
    );
  }
  if (commits.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("noCommits")}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {days.map((day) => (
        <div key={day.key || "undated"} className="flex flex-col gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">
            {day.date
              ? t("commitsOnDate", {
                  date: format.dateTime(day.date, { dateStyle: "long" }),
                })
              : t("commitsUndated")}
          </h3>
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
            {day.commits.map((commit) => (
              <CommitRow
                key={commit.sha}
                commit={commit}
                provider={provider}
                onOpenDiff={openDiff}
              />
            ))}
          </ul>
        </div>
      ))}
      {truncated ? (
        <p className="text-xs text-muted-foreground">{t("commitsTruncated")}</p>
      ) : null}

      <PrCommitDiffSheet
        prId={prId}
        sha={diffSha}
        open={diffOpen}
        provider={provider}
        onOpenChange={setDiffOpen}
      />
    </div>
  );
}
