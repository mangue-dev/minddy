"use client";

import { useMemo, useState } from "react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import {
  Badge,
  Button,
  Skeleton,
  cn,
} from "mangue-ui";
import { Check, Copy, ExternalLink, ShieldCheck } from "lucide-react";
import { AuthorNames, AuthorStack } from "@/components/git/author-stack";
import { normalizeForgeInstant } from "@/lib/forge-time";
import { PrCommitDiffSheet } from "@/components/pull-requests/pr-commit-diff-sheet";
import type { PullRequestCommit } from "@/lib/agent-api";
import { newestFirstPullRequestCommits } from "@/lib/pull-request-commits";
import type { RepoProviderId } from "@/lib/repo-providers";
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
 * customize: groups by day, commit title, author + relative date,
 * SHA runs in a minivan (copiable), and the link to the forge. The body of
 * message — when there is one — unfolds behind the “…” of GitHub instead
 * than stretching each line to the height of its longest commit.
 */

/** Title (1st line) and body (the rest) of a commit message. */
function splitMessage(message: string): { title: string; body: string } {
  const newline = message.indexOf("\n");
  if (newline === -1) return { title: message.trim(), body: "" };
  return {
    title: message.slice(0, newline).trim(),
    body: message.slice(newline + 1).trim(),
  };
}

/** The first 7 characters, like everywhere else in git. */
function shortSha(sha: string): string {
  return sha.slice(0, 7);
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

/** The short SHA, clickable to copy it — the gesture we are looking for here. */
function ShaButton({ sha }: { sha: string }) {
  const t = useTranslations("PullRequests");
  const [copied, setCopied] = useState(false);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 font-mono text-xs text-muted-foreground hover:text-foreground"
          onClick={() => {
            void navigator.clipboard.writeText(sha);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {shortSha(sha)}
          {copied ? (
            <Check className="size-3.5 text-emerald-500" />
          ) : (
            <Copy className="size-3.5 opacity-60" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{copied ? t("shaCopied") : t("copySha")}</TooltipContent>
    </Tooltip>
  );
}

/**
 * The weight of the commit, and the entry point for its diff: what this commit is
 * changes, by itself, in the side panel. This is the number we look at
 * before deciding whether the commit is worth opening — it might as well be
 * button that opens it.
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
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 font-medium tabular-nums"
          onClick={onOpen}
        >
          <span className="text-green-700 dark:text-green-500">
            +{format.number(additions)}
          </span>
          <span className="text-red-700 dark:text-red-500">
            −{format.number(deletions)}
          </span>
        </Button>
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
  const [showBody, setShowBody] = useState(false);
  const { title, body } = useMemo(() => splitMessage(commit.message), [commit.message]);

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

  return (
    <li className="flex items-start gap-3 px-3.5 py-3">
      <AuthorStack authors={authors} className="mt-0.5" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-start gap-1.5">
          {/* The title opens the diff, as it opens the commit on GitHub: it is
              the gesture we attempt first, and the +/− indicator on the right makes the
              same thing for those aiming for the figure. */}
          <button
            type="button"
            onClick={() => onOpenDiff(commit.sha)}
            className="min-w-0 flex-1 cursor-pointer text-left text-sm leading-snug font-medium break-words outline-none hover:text-brand hover:underline focus-visible:text-brand focus-visible:underline"
          >
            {title || t("commitNoMessage")}
          </button>
          {/* The “…” of GitHub: the body of the message is often long and
              rarely read — it unfolds, it does not occupy the list. */}
          {body ? (
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={showBody}
              className={cn(
                "h-5 shrink-0 px-1.5 font-mono text-xs leading-none text-muted-foreground",
                showBody && "bg-muted text-foreground",
              )}
              onClick={() => setShowBody((v) => !v)}
            >
              …
              <span className="sr-only">{t("commitMessageToggle")}</span>
            </Button>
          ) : null}
        </div>
        {showBody && body ? (
          <pre className="overflow-x-auto rounded-md bg-muted/50 px-2.5 py-2 font-mono text-xs whitespace-pre-wrap text-muted-foreground">
            {body}
          </pre>
        ) : null}
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
          <TooltipContent side="bottom">{t("commitVerifiedHint")}</TooltipContent>
        </Tooltip>
      ) : null}
      <div className="flex shrink-0 items-center">
        {/* Silent when the forge was unable to give the numbers: “+0 −0” is
            would read as an empty commit, and that's not what we know. */}
        {commit.additions != null && commit.deletions != null ? (
          <CommitStats
            additions={commit.additions}
            deletions={commit.deletions}
            onOpen={() => onOpenDiff(commit.sha)}
          />
        ) : null}
        <ShaButton sha={commit.sha} />
        {commit.url ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href={commit.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ExternalLink className="size-3.5" />
                <span className="sr-only">
                  {t(provider === "gitlab" ? "viewOnGitlab" : "viewOnGithub")}
                </span>
              </a>
            </TooltipTrigger>
            <TooltipContent side="top">
              {t(provider === "gitlab" ? "viewOnGitlab" : "viewOnGithub")}
            </TooltipContent>
          </Tooltip>
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
