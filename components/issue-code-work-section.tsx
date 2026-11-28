"use client";

import { memo, useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { HugeiconsIcon } from "@hugeicons/react";
import { GitBranchIcon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import { PropertyRow } from "@/components/issue-property-fields";
import { Button } from "@/components/ui/button";
import { CopyStateIcon } from "@/components/ui/copy-state-icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { normalizeForgeInstant } from "@/lib/forge-time";
import { UserAvatar } from "@/components/user-avatar";
import { displayName } from "@/lib/display-name";
import {
  shortSha,
  type IssueBranch,
  type IssueCommit,
  type IssueCommitAuthor,
} from "@/lib/issue-code-work";
import { parseForgeLogin } from "@/lib/repo-providers";
import type { Member } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useIssueCodeWorkQuery } from "@/lib/use-agent-runs";
import { useLiveNow } from "@/lib/use-live-now";

/** Commits listed before "Show more". */
const COLLAPSED_COMMITS = 5;

/**
 * The code work an issue carries outside a pull request (MIN-1037): the
 * branches named after it and the commits that name it, each linked to its
 * forge. Rendered like the other rows of the property table, and absent when
 * the issue has none.
 *
 * Each commit names everyone who wrote it, its co-signers included, with
 * their avatars. Commits of a pull request are not listed here: the pull
 * request shows them.
 */
export const IssueCodeWorkSection = memo(function IssueCodeWorkSection({
  issueId,
  members,
}: {
  issueId: string;
  /** The people of the project: an author among them is shown as a member. */
  members: Member[];
}) {
  const t = useTranslations("IssueUI");
  const tCommon = useTranslations("Common");
  const { commits, branches } = useIssueCodeWorkQuery(issueId);
  const [expanded, setExpanded] = useState(false);
  const membersById = useMemo(
    () => new Map(members.map((member) => [member.user_id, member])),
    [members],
  );

  if (commits.length === 0 && branches.length === 0) return null;
  const shown = expanded ? commits : commits.slice(0, COLLAPSED_COMMITS);

  return (
    <>
      {branches.length > 0 && (
        <div className="rounded-lg">
          <PropertyRow label={t("codeBranches")}>{null}</PropertyRow>
          <ul className="flex flex-col gap-1 pb-2">
            {branches.map((branch) => (
              <BranchRow key={`${branch.provider}:${branch.name}`} branch={branch} />
            ))}
          </ul>
        </div>
      )}
      {commits.length > 0 && (
        <div className="rounded-lg">
          <PropertyRow label={t("codeCommits")}>
            <span className="text-sm text-muted-foreground tabular-nums">{commits.length}</span>
          </PropertyRow>
          <ul className="flex flex-col gap-2 pb-2">
            {shown.map((commit) => (
              <CommitRow key={`${commit.provider}:${commit.sha}`} commit={commit} members={membersById} />
            ))}
          </ul>
          {commits.length > COLLAPSED_COMMITS && !expanded && (
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2 mb-2 text-muted-foreground"
              onClick={() => setExpanded(true)}
            >
              {tCommon("showMore")}
            </Button>
          )}
        </div>
      )}
    </>
  );
});

function BranchRow({ branch }: { branch: IssueBranch }) {
  const tPr = useTranslations("PullRequests");
  const tCommon = useTranslations("Common");
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(branch.name);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(tCommon("copyFailed"));
    }
  };

  const name = (
    <span className="min-w-0 truncate font-mono text-xs">{branch.name}</span>
  );
  return (
    <li className="flex min-w-0 items-center gap-2 text-sm">
      <HugeiconsIcon icon={GitBranchIcon} className="size-4 shrink-0 text-muted-foreground" />
      <Tooltip>
        <TooltipTrigger asChild>
          {branch.url ? (
            <a
              href={branch.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-w-0 hover:underline focus-visible:underline focus-visible:outline-none"
            >
              {name}
            </a>
          ) : (
            <span className="flex min-w-0">{name}</span>
          )}
        </TooltipTrigger>
        <TooltipContent side="top">{branch.name}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-6 shrink-0 text-muted-foreground"
            aria-label={tPr("copyBranch")}
            onClick={() => void copy()}
          >
            <CopyStateIcon copied={copied} className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">{tPr("copyBranch")}</TooltipContent>
      </Tooltip>
    </li>
  );
}

/** An author as the row shows it: one name, one avatar. */
interface ShownAuthor {
  key: string;
  name: string;
  /** Image of a forge account; a member's portrait comes from `seed`. */
  avatarUrl: string | null;
  seed: string;
  bot: boolean;
}

/**
 * Who to show for an author. Someone of the project appears as in the rest of
 * minddy, under their own name and avatar; anyone else under their forge
 * account, or the name written in the commit when the forge names no account.
 */
function shownAuthor(
  author: IssueCommitAuthor,
  members: ReadonlyMap<string, Member>,
  fallback: string,
): ShownAuthor {
  const member = author.userId ? members.get(author.userId) : undefined;
  if (member) {
    return {
      key: `member:${member.user_id}`,
      name: displayName(member, fallback),
      avatarUrl: null,
      seed: member.avatar_seed,
      bot: false,
    };
  }
  const forge = author.login ? parseForgeLogin(author.login) : null;
  const name = forge?.name ?? author.name ?? fallback;
  return {
    key: `forge:${author.login ?? author.name ?? ""}`,
    name,
    avatarUrl: author.avatarUrl,
    seed: author.login ?? name,
    bot: forge?.isBot ?? false,
  };
}

/** The authors' avatars, stacked like those of a pull request commit. */
function AuthorAvatars({ authors }: { authors: ShownAuthor[] }) {
  return (
    <span className="flex shrink-0 items-center">
      {authors.map((author, index) => (
        <Tooltip key={author.key}>
          <TooltipTrigger asChild>
            <span
              className={cn(
                "shrink-0",
                index > 0 && "-ml-1.5 ring-2 ring-card",
                author.bot ? "rounded-[6px]" : "rounded-full",
              )}
              // The main author sits in front.
              style={{ zIndex: authors.length - index }}
            >
              <UserAvatar
                url={author.avatarUrl}
                seed={author.seed}
                shape={author.bot ? "rounded" : "circle"}
                // The names are written beside the stack.
                alt=""
                className="size-4"
              />
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">{author.name}</TooltipContent>
        </Tooltip>
      ))}
    </span>
  );
}

function CommitRow({
  commit,
  members,
}: {
  commit: IssueCommit;
  members: ReadonlyMap<string, Member>;
}) {
  const tPr = useTranslations("PullRequests");
  const tTimeline = useTranslations("Timeline");
  const format = useFormatter();
  const now = useLiveNow();
  const at = normalizeForgeInstant(commit.committedAt, now);
  // One person can sign twice (a member whose trailer repeats their account).
  const authors = [...new Map(
    commit.authors.map((author) => shownAuthor(author, members, tTimeline("someUser")))
      .map((author) => [author.key, author]),
  ).values()];
  const [first, second] = authors;
  const names = authors.length === 0
    ? null
    : authors.length === 1
      ? first.name
      : authors.length === 2
        ? tPr("authorsPair", { first: first.name, second: second.name })
        : tPr("authorsMore", { first: first.name, count: authors.length - 1 });
  const title = commit.title || tPr("commitNoMessage");
  const sha = <span className="font-mono text-xs text-muted-foreground">{shortSha(commit.sha)}</span>;

  return (
    <li className="flex min-w-0 text-sm">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="min-w-0 truncate">{title}</span>
          </TooltipTrigger>
          <TooltipContent side="top">{title}</TooltipContent>
        </Tooltip>
        {/* The avatars sit on the second line: a stack of any width leaves
            the titles aligned from one commit to the next. */}
        <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <AuthorAvatars authors={authors} />
          {names && <span className="min-w-0 truncate font-medium text-foreground/80">{names}</span>}
          {at && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="shrink-0">
                  {tPr("committedAt", { time: format.relativeTime(at, now) })}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {format.dateTime(at, { dateStyle: "long", timeStyle: "short" })}
              </TooltipContent>
            </Tooltip>
          )}
          {commit.url ? (
            <a
              href={commit.url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto shrink-0 hover:underline focus-visible:underline focus-visible:outline-none"
            >
              {sha}
            </a>
          ) : (
            <span className="ml-auto shrink-0">{sha}</span>
          )}
        </p>
      </div>
    </li>
  );
}
