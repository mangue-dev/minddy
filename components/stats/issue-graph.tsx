"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowExpand01Icon } from "@hugeicons/core-free-icons";
import { useIssuePanelActions } from "@/lib/issue-panel-context";
import { useAppRouter } from "@/lib/use-app-router";
import { objectiveHref } from "@/lib/app-urls";
import type { Issue, IssueRelation, Objective, Project } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { StatsCard, StatsSection } from "@/components/stats/stats-chrome";
import { IssueGraphCanvas, IssueGraphLegend, useIssueGraph, type GraphFrame } from "@/components/stats/issue-graph-canvas";

const WIDTH = 720;
const HEIGHT = 380;
/** A crowded graph gets more room rather than smaller gaps. */
const TALL_HEIGHT = 540;
const TALL_FROM_NODES = 60;
const CARD_FRAME: GraphFrame = (linked) => ({ width: WIDTH, height: linked >= TALL_FROM_NODES ? TALL_HEIGHT : HEIGHT });

/** Longer than the reader's exit animation (components/image-viewer.tsx). */
const VIEWER_EXIT_MS = 400;

/** The enlarged view and its zoom library load when it first opens. */
const IssueGraphViewer = dynamic(
  () => import("@/components/stats/issue-graph-viewer").then((module) => module.IssueGraphViewer),
  { ssr: false },
);

/**
 * The project's tickets as a graph (MIN-878): a dot per ticket that has a
 * relation or a parent, a line per link, open tickets only unless closed ones
 * are asked for (see `IssueGraphCanvas` for the drawing). Selecting a dot
 * opens the ticket in the side panel, without leaving the page; selecting an
 * anchor opens the objective. Nothing renders without any link.
 *
 * The card's frame is small for a large project: a button opens the same
 * graph in the full-screen reader, larger and with zoom (MIN-897).
 */
export function IssueGraphCard({
  project,
  issues,
  relations,
  objectives,
}: {
  project: Project;
  issues: Issue[];
  relations: IssueRelation[];
  objectives: Objective[];
}) {
  const t = useTranslations("ProjectStats");
  // A quick look, not a trip to the board: the shell's issue panel opens
  // above the settings.
  const { openIssue } = useIssuePanelActions();
  const router = useAppRouter();
  const [showClosed, setShowClosed] = useState(false);
  const [enlarged, setEnlarged] = useState(false);
  // The viewer lays out up to five times the card's tickets: it is mounted
  // while open and through its exit, then dropped, so a closed viewer never
  // lays the project out again on each change.
  const [viewerMounted, setViewerMounted] = useState(false);
  useEffect(() => {
    if (enlarged) return;
    const timer = setTimeout(() => setViewerMounted(false), VIEWER_EXIT_MS);
    return () => clearTimeout(timer);
  }, [enlarged]);
  const { graph, scope, canToggleClosed } = useIssueGraph({ issues, relations, objectives, showClosed, frame: CARD_FRAME });
  const onOpenIssue = useCallback((issue: Issue) => openIssue(project.id, issue.id), [openIssue, project.id]);
  const onOpenObjective = useCallback(
    (objective: Objective) => router.push(objectiveHref(project, objective.id)),
    [router, project],
  );
  if (graph.nodes.length === 0) return null;

  return (
    <StatsSection title={t("graphTitle")} description={t("graphDescription")}>
      <StatsCard className="overflow-hidden p-0">
        <div className="relative">
          <IssueGraphCanvas
            project={project}
            issues={issues}
            objectives={objectives}
            graph={graph}
            scope={scope}
            onOpenIssue={onOpenIssue}
            onOpenObjective={onOpenObjective}
            className="block h-auto w-full"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("graphEnlarge")}
            className="absolute top-2 right-2 bg-card/80 text-muted-foreground backdrop-blur-sm"
            onClick={() => {
              setViewerMounted(true);
              setEnlarged(true);
            }}
          >
            <HugeiconsIcon icon={ArrowExpand01Icon} className="size-4" aria-hidden />
          </Button>
        </div>
        <IssueGraphLegend graph={graph} canToggleClosed={canToggleClosed} showClosed={showClosed} onShowClosedChange={setShowClosed} />
      </StatsCard>
      {viewerMounted && (
        <IssueGraphViewer
          open={enlarged}
          onOpenChange={setEnlarged}
          project={project}
          issues={issues}
          relations={relations}
          objectives={objectives}
          showClosed={showClosed}
          onShowClosedChange={setShowClosed}
          onOpenIssue={onOpenIssue}
          onOpenObjective={onOpenObjective}
        />
      )}
    </StatsSection>
  );
}
