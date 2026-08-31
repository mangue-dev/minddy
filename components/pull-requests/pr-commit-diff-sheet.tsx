"use client";

import { useFormatter, useTranslations } from "next-intl";
import {
  SidePanel,
  SidePanelBody,
  SidePanelContent,
  SidePanelDescription,
  SidePanelHeader,
  SidePanelTitle,
  Spinner,
} from "mangue-ui";
import { PrDiff } from "@/components/pull-requests/pr-diff";
import { prCommitEndpoint } from "@/lib/agent-api";
import { usePrCommitDiffQuery } from "@/lib/use-agent-runs";
import type { RepoProviderId } from "@/lib/repo-providers";

/**
 * The diff of ONE commit, in the same side panel as the diff view of the commit
 * agent conversation (`AgentDiffSheet`) — same widths, same header,
 * even `PrDiff` read-only. Two surfaces that show the same thing
 * must look the same; what changes here is only the SOURCE of the diff.
 *
 * Reading only, and not by simplification: a review comment is anchored to
 * a line from the diff of the PR, not that of a commit. The review remains in
 * the Files tab, where the anchor is the one the forge expects.
 *
 * The endpoint passed to `PrDiff` is that of the COMMIT: context unfolding there
 * resolves the parent of the commit, where that of the PR resolves the merge base.
 */
export function PrCommitDiffSheet({
  prId,
  sha,
  open,
  provider,
  onOpenChange,
}: {
  prId: string;
  /**
   * The commit looked. It SURVIVES closing (`open` returns to false without
   * the sha moves): Radix animates the exit of the panel, and empty the sha all
   * afterward would show a white panel during the animation.
   */
  sha: string | null;
  open: boolean;
  provider: RepoProviderId;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("PullRequests");
  const format = useFormatter();
  // `enabled` on `open`: close should not restart the request, but
  // reopening on the same commit serves it from the cache (a commit is immutable).
  const { diff, loading } = usePrCommitDiffQuery(prId, open ? sha : null);

  const title = (diff?.message ?? "").split("\n")[0].trim();

  return (
    <SidePanel open={open} onOpenChange={onOpenChange}>
      <SidePanelContent
        side="right"
        className="w-[min(880px,calc(100vw-2rem))]"
      >
        <SidePanelHeader>
          <SidePanelTitle className="truncate">
            {title || t("commitDiffTitle")}
          </SidePanelTitle>
          <SidePanelDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-xs">{sha?.slice(0, 7)}</span>
            {diff ? (
              <span className="inline-flex items-center gap-1.5 font-medium tabular-nums">
                <span className="text-green-700 dark:text-green-500">
                  +{format.number(diff.additions)}
                </span>
                <span className="text-red-700 dark:text-red-500">
                  −{format.number(diff.deletions)}
                </span>
              </span>
            ) : null}
          </SidePanelDescription>
        </SidePanelHeader>
        {/* No padding at the TOP of the scrolling container: `position: sticky` is
            holds on its contents, not on its edge, and the file header of the
            diff would stop 16 px too low (MIN-182). It is given to each
            branch, where it scrolls with the content. */}
        <SidePanelBody className="min-h-0 px-4 pt-0 pb-4">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Spinner className="size-5 text-muted-foreground" />
            </div>
          ) : !diff ? (
            <p className="pt-4 text-sm text-muted-foreground">{t("commitDiffUnavailable")}</p>
          ) : diff.files.length === 0 ? (
            // An empty commit, or a merge commit whose first parent
            // already carries everything: the forge responds with zero files, it is not a
            // failure.
            <p className="pt-4 text-sm text-muted-foreground">{t("commitDiffEmpty")}</p>
          ) : (
            <PrDiff
              files={diff.files}
              endpoint={prCommitEndpoint(prId, sha as string)}
              prUrl={diff.url}
              provider={diff.provider ?? provider}
              readOnly
              className="pt-4"
            />
          )}
        </SidePanelBody>
      </SidePanelContent>
    </SidePanel>
  );
}
