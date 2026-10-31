"use client";

import { useId, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useIssuePanelActions } from "@/lib/issue-panel-context";
import { issueIdentifier, isClosedStatus } from "@/lib/issue-constants";
import { issueGraphEdges, layoutIssueGraph, type GraphEdgeKind } from "@/lib/issue-graph-layout";
import type { Issue, IssueRelation, Project } from "@/lib/types";
import { StatusIndicator } from "@/components/issue-indicators";
import { Switch } from "@/components/ui/switch";
import { StatsCard, StatsSection } from "@/components/stats/stats-chrome";
import { STATUS_TINT } from "@/components/stats/status-tint";

const WIDTH = 720;
const HEIGHT = 380;
/** A crowded graph gets more room rather than smaller gaps. */
const TALL_HEIGHT = 540;
const TALL_FROM_NODES = 60;

/**
 * Line style per link kind; the legend repeats it so color is never alone.
 * Directed links carry an arrowhead: parent to sub-issue, blocker to blocked.
 */
const EDGE_STYLE: Record<GraphEdgeKind, { className: string; dash?: string; arrow?: string }> = {
  parent: { className: "stroke-muted-foreground/60", arrow: "fill-muted-foreground/70" },
  blocks: { className: "stroke-[#D62115]/70", arrow: "fill-[#D62115]/70" },
  related: { className: "stroke-muted-foreground/45", dash: "4 3" },
};
const DIRECTED = ["parent", "blocks"] as const;

/**
 * The project's tickets as a graph (MIN-878): a dot per ticket that has a
 * relation or a parent, a line per link, open tickets only unless closed ones
 * are asked for. Selecting a dot opens the ticket in the side panel, without
 * leaving the page. Nothing renders without any link.
 */
export function IssueGraphCard({
  project,
  issues,
  relations,
}: {
  project: Project;
  issues: Issue[];
  relations: IssueRelation[];
}) {
  const t = useTranslations("ProjectStats");
  const tRelations = useTranslations("Relations");
  // A quick look, not a trip to the board: the shell's issue panel opens
  // above the settings.
  const { openIssue } = useIssuePanelActions();
  const markerId = useId();
  const [hovered, setHovered] = useState<string | null>(null);

  const [showClosed, setShowClosed] = useState(false);

  const allEdges = useMemo(() => issueGraphEdges(issues, relations), [issues, relations]);
  // Finished work is history: open tickets carry the links that still
  // matter, and leaving the rest out keeps a large project readable.
  const openEdges = useMemo(
    () => issueGraphEdges(issues.filter((issue) => !isClosedStatus(issue.status)), relations),
    [issues, relations],
  );
  // A project whose links all touch closed tickets shows them rather than nothing.
  const withClosed = showClosed || openEdges.length === 0;
  const canToggleClosed = openEdges.length > 0 && allEdges.length > openEdges.length;
  const graph = useMemo(() => {
    const edges = withClosed ? allEdges : openEdges;
    const linked = new Set(edges.flatMap((edge) => [edge.source, edge.target])).size;
    return layoutIssueGraph(edges, { width: WIDTH, height: linked >= TALL_FROM_NODES ? TALL_HEIGHT : HEIGHT });
  }, [withClosed, allEdges, openEdges]);
  const byId = useMemo(() => new Map(issues.map((issue) => [issue.id, issue])), [issues]);
  if (graph.nodes.length === 0) return null;

  const position = new Map(graph.nodes.map((node) => [node.id, node]));
  const neighbors = new Set<string>();
  if (hovered) {
    for (const edge of graph.edges) {
      if (edge.source === hovered) neighbors.add(edge.target);
      if (edge.target === hovered) neighbors.add(edge.source);
    }
  }
  const hoveredIssue = hovered ? byId.get(hovered) : undefined;
  const label = (issue: Issue) => `${issueIdentifier(project.key, issue.number)} ${issue.title}`;

  return (
    <StatsSection title={t("graphTitle")} description={t("graphDescription")}>
      <StatsCard className="overflow-hidden p-0">
        <div className="relative">
          <svg
            viewBox={`0 0 ${graph.width} ${graph.height}`}
            className="block h-auto w-full"
            role="group"
            aria-label={t("graphTitle")}
          >
            <defs>
              {DIRECTED.map((kind) => (
                <marker key={kind} id={`${markerId}-${kind}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0 0 8 4 0 8z" className={EDGE_STYLE[kind].arrow} />
                </marker>
              ))}
            </defs>
            {graph.edges.map((edge) => {
              const from = position.get(edge.source)!;
              const to = position.get(edge.target)!;
              const style = EDGE_STYLE[edge.kind];
              const faded = hovered && edge.source !== hovered && edge.target !== hovered;
              // Stop an arrow at the edge of the target's dot.
              const directed = !!style.arrow;
              const length = Math.max(Math.hypot(to.x - from.x, to.y - from.y), 1);
              const endX = directed ? to.x - ((to.x - from.x) / length) * (to.radius + 2) : to.x;
              const endY = directed ? to.y - ((to.y - from.y) / length) * (to.radius + 2) : to.y;
              return (
                <line
                  key={`${edge.source}-${edge.target}`}
                  x1={from.x}
                  y1={from.y}
                  x2={endX}
                  y2={endY}
                  strokeWidth={1.25}
                  strokeDasharray={style.dash}
                  markerEnd={directed ? `url(#${markerId}-${edge.kind})` : undefined}
                  className={cn(style.className, "transition-opacity", faded && "opacity-20")}
                />
              );
            })}
            {graph.nodes.map((node) => {
              const issue = byId.get(node.id);
              if (!issue) return null;
              const faded = hovered && node.id !== hovered && !neighbors.has(node.id);
              const open = () => openIssue(project.id, issue.id);
              return (
                <circle
                  key={node.id}
                  cx={node.x}
                  cy={node.y}
                  r={node.radius}
                  role="link"
                  tabIndex={0}
                  aria-label={label(issue)}
                  onClick={open}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      open();
                    }
                  }}
                  onPointerEnter={() => setHovered(node.id)}
                  onPointerLeave={() => setHovered(null)}
                  onFocus={() => setHovered(node.id)}
                  onBlur={() => setHovered(null)}
                  className={cn(
                    STATUS_TINT[issue.status].fill,
                    "cursor-pointer stroke-card stroke-2 outline-none transition-opacity focus-visible:stroke-ring",
                    isClosedStatus(issue.status) && "opacity-50",
                    faded && "opacity-15",
                  )}
                />
              );
            })}
          </svg>
          {hoveredIssue && (
            <div className="pointer-events-none absolute top-3 left-3 flex max-w-[calc(100%-1.5rem)] items-center gap-1.5 rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-sm">
              <StatusIndicator status={hoveredIssue.status} className="size-3.5" />
              <span className="shrink-0 font-mono text-muted-foreground">
                {issueIdentifier(project.key, hoveredIssue.number)}
              </span>
              <span className="truncate">{hoveredIssue.title}</span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-5 py-3 text-xs text-muted-foreground">
          {(["parent", "blocks", "related"] as const).map((kind) => (
            <span key={kind} className="flex items-center gap-1.5">
              <svg viewBox="0 0 22 8" className="h-2 w-[22px]" aria-hidden>
                <line x1="0" y1="4" x2={EDGE_STYLE[kind].arrow ? 16 : 22} y2="4" strokeWidth={1.5} strokeDasharray={EDGE_STYLE[kind].dash} className={EDGE_STYLE[kind].className} />
                {EDGE_STYLE[kind].arrow && <path d="M15 1 21 4 15 7z" className={EDGE_STYLE[kind].arrow} />}
              </svg>
              {kind === "parent" ? t("graphParent") : tRelations(kind)}
            </span>
          ))}
          {graph.hiddenNodes > 0 && <span>{t("graphHidden", { count: graph.hiddenNodes })}</span>}
          {canToggleClosed && (
            <label className="ml-auto flex cursor-pointer items-center gap-2 text-foreground">
              <Switch checked={showClosed} onCheckedChange={setShowClosed} />
              {t("graphShowClosed")}
            </label>
          )}
        </div>
      </StatsCard>
    </StatsSection>
  );
}
