"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
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
import { PrEndpointProvider } from "@/lib/pr-endpoint-context";
import { runPrEndpoint } from "@/lib/agent-api";
import { fileAnchorId } from "@/lib/pr-file-tree";
import { useAgentRunDiffQuery } from "@/lib/use-agent-runs";
import type { PullRequestFile } from "@/lib/agent-api";

/**
 * Diff view IN agent conversation: session changes without
 * leave the thread nor wait for the PR. Open by clicking a block file
 * “changed files” (wire as header), in a floating side panel placed ABOVE the
 * conversation — which itself sometimes lives in a sheet (outcome modal).
 *
 * In the cloud, the content comes from /api/agent-runs/[runId]/diff: microVM during
 * the lathe, forge at rest. Locally, this route cannot read the disk of
 * the user: the harness therefore sends a limited patch on a dedicated channel, then
 * keeps it in the end-of-turn event `files_changed`.
 *
 * Read only: the review (anchored comments) lives on the Pull requests page.
 */
export function AgentDiffSheet({
  runId,
  open,
  onOpenChange,
  working,
  baseBranch,
  branchName,
  focusPath,
  local = false,
  localFiles = [],
  localTruncated = false,
}: {
  runId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The agent works: the diff re-pollls (it advances during the turn). */
  working: boolean;
  /** Original branch → session branch, displayed below the title. */
  baseBranch: string | null;
  branchName: string | null;
  /** File through which we entered: the view opens on it. */
  focusPath?: string | null;
  /** The repository lives on the machine: the server cannot reread its patch. */
  local?: boolean;
  /** Patch raised by the local harness (direct + end of turn events). */
  localFiles?: PullRequestFile[];
  localTruncated?: boolean;
}) {
  const t = useTranslations("Agent");
  const remote = useAgentRunDiffQuery(runId, open && !local, working);
  const files = local ? localFiles : remote.files;
  const provider = local ? undefined : remote.provider;
  const url = local ? null : remote.url;
  const live = local ? working && files.length > 0 : remote.live;
  const loading = local ? false : remote.loading;

  /**
   * We arrive ON the clicked file. The anchor only exists once the diff is painted,
   * and the diff arrives after the panel opens: the jump therefore waits for both.
   *
   * Only once per opening (`jumped`), and that's the point: the difference
   * re-poll every 7 seconds during the round, and re-jump with each response
   * would take away the sight before the eyes of anyone who is reading elsewhere.
   */
  const jumped = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      jumped.current = null;
      return;
    }
    if (!focusPath || files.length === 0 || jumped.current === focusPath) return;
    const node = document.getElementById(fileAnchorId(focusPath));
    // Not in this diff (file just touched, diff not yet refreshed):
    // we don't mark anything and the next answer will try the jump again.
    if (!node) return;
    jumped.current = focusPath;
    node.scrollIntoView({ block: "start" });
  }, [open, focusPath, files]);

  return (
    <SidePanel open={open} onOpenChange={onOpenChange}>
      <SidePanelContent
        side="right"
        className="w-[min(880px,calc(100vw-2rem))]"
      >
        <SidePanelHeader>
          <SidePanelTitle>{t("diffTitle")}</SidePanelTitle>
          {/* What the line first says is WHERE this diff is going (origin → session).
              When it comes from the sandbox, it also says what it contains
              more than the forge: the work of the lathe, not yet advanced. */}
          {local ? (
            <SidePanelDescription className="truncate text-xs">
              {branchName ? <span className="font-mono">{branchName}</span> : null}
              {branchName ? <span>{" · "}</span> : null}
              <span className={live ? "text-shimmer" : undefined}>
                {t(live ? "diffLocalLive" : "diffLocalDescription")}
              </span>
            </SidePanelDescription>
          ) : branchName ? (
            <SidePanelDescription className="truncate text-xs">
              <span className="font-mono">
                {baseBranch ? `${baseBranch} → ${branchName}` : branchName}
              </span>
              {live ? <span className="text-shimmer">{` · ${t("diffLive")}`}</span> : null}
            </SidePanelDescription>
          ) : (
            <SidePanelDescription>
              {live ? t("diffLive") : t("diffDescription")}
            </SidePanelDescription>
          )}
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
          ) : files.length === 0 ? (
            <p className="pt-4 text-sm text-muted-foreground">
              {t(local ? "diffEmptyLocal" : "diffEmpty")}
            </p>
          ) : (
            // Diff view of the CONVERSATION: she only has one run to give — her
            // session sometimes has no PR (compare base…branch). She passes
            // therefore by the facade indexed by the run (MIN-143).
            // The envelope here serves the IMAGES: a capture pasted in a
            // line remark is not serviceable as is (MIN-162), and
            // it passes through the facade indexed by the run. Composing it does not
            // does not open — this view is read-only.
            <>
              {local && localTruncated ? (
                <p className="pt-4 text-xs text-muted-foreground">{t("diffLocalTruncated")}</p>
              ) : null}
              <PrEndpointProvider endpoint={runPrEndpoint(runId)}>
                <PrDiff
                  files={files}
                  endpoint={runPrEndpoint(runId)}
                  prUrl={url}
                  provider={provider}
                  readOnly
                  expandableContext={!local}
                  className="pt-4"
                />
              </PrEndpointProvider>
            </>
          )}
        </SidePanelBody>
      </SidePanelContent>
    </SidePanel>
  );
}
