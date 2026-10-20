"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { GitPullRequestDraftIcon, GitPullRequestIcon } from "@hugeicons/core-free-icons";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import { Spinner } from "@/components/ui/spinner";
import { CommandAnchor } from "@/components/command-anchor";
import type { PullRequestListItem } from "@/lib/agent-api";
import { useAllPullRequestsQuery } from "@/lib/use-agent-runs";

/**
 * Open pull requests an issue of `projectId` can be linked to. The server only
 * accepts a PR whose repository the issue's project links, which is what the
 * list's `project` names.
 */
export function linkablePullRequests(
  pullRequests: readonly PullRequestListItem[],
  projectId: string | null,
): PullRequestListItem[] {
  return pullRequests.filter((pr) =>
    (pr.pr_state === "open" || pr.pr_state === "draft") &&
    (projectId === null || pr.project?.id === projectId));
}

/** The open pull requests list, read only while a picker is mounted. */
export function useLinkablePullRequests(projectId: string | null) {
  const { pullRequests, loading } = useAllPullRequestsQuery("open");
  return { pullRequests: linkablePullRequests(pullRequests, projectId), loading };
}

/**
 * Reports whether `projectId` has a pull request an issue can join; null while
 * the list loads. Mounted only while a menu is open, so the cards of a board do
 * not each subscribe to the pull request list.
 */
export function LinkablePullRequestsProbe({
  projectId,
  onChange,
}: {
  projectId: string;
  onChange: (hasLinkable: boolean | null) => void;
}) {
  const { pullRequests, loading } = useLinkablePullRequests(projectId);
  const hasLinkable = loading ? null : pullRequests.length > 0;
  useEffect(() => {
    onChange(hasLinkable);
  }, [hasLinkable, onChange]);
  return null;
}

/** Searchable picker, at the pointer, of the pull requests an issue can join. */
export function PrLinkTargetPicker({
  position,
  projectId,
  onClose,
  onSelect,
}: {
  position: { x: number; y: number } | null;
  projectId: string;
  onClose: () => void;
  onSelect: (pr: PullRequestListItem) => void;
}) {
  if (!position) return null;
  return <PickerContent position={position} projectId={projectId} onClose={onClose} onSelect={onSelect} />;
}

function PickerContent({
  position,
  projectId,
  onClose,
  onSelect,
}: {
  position: { x: number; y: number };
  projectId: string;
  onClose: () => void;
  onSelect: (pr: PullRequestListItem) => void;
}) {
  const t = useTranslations("PullRequests");
  const { pullRequests, loading } = useLinkablePullRequests(projectId);
  return (
    <CommandAnchor position={position} onClose={onClose} className="w-80" hideEmpty={loading}>
      <CommandGroup heading={t("linkToPullRequest")}>
        {loading ? (
          <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground">
            <Spinner className="size-3.5" />
            {t("linkToPullRequestLoading")}
          </div>
        ) : null}
        {pullRequests.map((pr) => (
          <CommandItem
            key={pr.prId}
            value={pr.prId}
            keywords={[`#${pr.pr_number}`, String(pr.pr_number), pr.title ?? "", pr.head_branch ?? ""]}
            onSelect={() => {
              onClose();
              onSelect(pr);
            }}
          >
            <HugeiconsIcon
              icon={pr.pr_state === "draft" ? GitPullRequestDraftIcon : GitPullRequestIcon}
              className={pr.pr_state === "draft" ? "size-4 text-muted-foreground" : "size-4 text-emerald-600 dark:text-emerald-500"}
            />
            <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">#{pr.pr_number}</span>
            <span className="truncate">{pr.title ?? pr.head_branch ?? ""}</span>
          </CommandItem>
        ))}
      </CommandGroup>
    </CommandAnchor>
  );
}
