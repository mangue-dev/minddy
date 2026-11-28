"use client";

import { memo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { HugeiconsIcon } from "@hugeicons/react";
import { GitBranchIcon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import { PropertyRow } from "@/components/issue-property-fields";
import { Button } from "@/components/ui/button";
import { CopyStateIcon } from "@/components/ui/copy-state-icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { normalizeForgeInstant } from "@/lib/forge-time";
import { shortSha, type IssueBranch, type IssueCommit } from "@/lib/issue-code-work";
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
 * Commits of a pull request are not listed here: the pull request shows them.
 */
export const IssueCodeWorkSection = memo(function IssueCodeWorkSection({
  issueId,
}: {
  issueId: string;
}) {
  const t = useTranslations("IssueUI");
  const tCommon = useTranslations("Common");
  const { commits, branches } = useIssueCodeWorkQuery(issueId);
  const [expanded, setExpanded] = useState(false);

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
              <CommitRow key={`${commit.provider}:${commit.sha}`} commit={commit} />
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

function CommitRow({ commit }: { commit: IssueCommit }) {
  const tPr = useTranslations("PullRequests");
  const format = useFormatter();
  const now = useLiveNow();
  const at = normalizeForgeInstant(commit.committedAt, now);
  const author = commit.authorLogin ?? commit.authorName;
  const title = commit.title || tPr("commitNoMessage");
  const sha = <span className="font-mono text-xs text-muted-foreground">{shortSha(commit.sha)}</span>;

  return (
    <li className="flex min-w-0 flex-col gap-0.5 text-sm">
      <div className="flex min-w-0 items-baseline gap-2">
        {commit.url ? (
          <a
            href={commit.url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 hover:underline focus-visible:underline focus-visible:outline-none"
          >
            {sha}
          </a>
        ) : (
          sha
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="min-w-0 truncate">{title}</span>
          </TooltipTrigger>
          <TooltipContent side="top">{title}</TooltipContent>
        </Tooltip>
      </div>
      {(author || at) && (
        <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          {author && <span className="min-w-0 truncate">{author}</span>}
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
        </p>
      )}
    </li>
  );
}
