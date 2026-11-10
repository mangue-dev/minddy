"use client";

import { memo, useId, useMemo, useState, type Ref } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { issueIdentifier, isClosedStatus } from "@/lib/issue-constants";
import {
  convexHull,
  issueGraphEdges,
  layoutIssueGraph,
  isSummarized,
  type GraphEdge,
  type GraphEdgeKind,
  type GraphNode,
  type IssueGraph,
} from "@/lib/issue-graph-layout";
import type { Issue, IssueRelation, Objective, Project } from "@/lib/types";
import { MentionHover } from "@/components/mention-hover";
import { objectiveColor } from "@/components/objective-icon";
import { Switch } from "@/components/ui/switch";
import { STATUS_TINT } from "@/components/stats/status-tint";

/** How far past a dot the pointer still takes it. */
const HIT_SLOP = 5;
/** How far an objective's bubble reaches past its dots, in pixels. */
const BUBBLE_PADDING = 14;
/** Width of a label character (11 px text), in pixels, rounded up. */
const LABEL_CHARACTER_WIDTH = 6.6;
/** Characters an objective's label takes past its name, for the count of hidden tickets. */
const LABEL_SUFFIX = 4;

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

const isClosedObjective = (objective: Objective) => objective.status === "done" || objective.status === "canceled";

/** The room a drawing is laid out in, from the number of linked tickets. */
export type GraphFrame = (linked: number) => { width: number; height: number; maxNodes?: number };

/** What `isSummarized` needs to tell a link that leaves its group. */
interface GraphScope {
  edges: GraphEdge[];
  groupOf: Map<string, string>;
  objectiveIds: Set<string>;
}

/**
 * The graph of a project's tickets, laid out in `frame`: open tickets only
 * unless closed ones are asked for. Finished work is history: open tickets,
 * and the objectives still under way or still holding open tickets, carry
 * the links that matter. A project whose links all touch closed work shows
 * it rather than nothing.
 */
export function useIssueGraph({
  issues,
  relations,
  objectives,
  showClosed,
  frame,
}: {
  issues: Issue[];
  relations: IssueRelation[];
  objectives: Objective[];
  showClosed: boolean;
  /** A stable function: the layout runs again when it changes. */
  frame: GraphFrame;
}) {
  const objectiveNames = useMemo(() => new Map(objectives.map((objective) => [objective.id, objective.name])), [objectives]);
  const scopes = useMemo(() => {
    const build = (withClosed: boolean): GraphScope => {
      const shown = withClosed ? issues : issues.filter((issue) => !isClosedStatus(issue.status));
      const holding = new Set(shown.map((issue) => issue.objective_id).filter(Boolean));
      const shownObjectives = objectives.filter((objective) =>
        withClosed || !isClosedObjective(objective) || holding.has(objective.id));
      const objectiveIds = new Set(shownObjectives.map((objective) => objective.id));
      const groupOf = new Map(shown
        .filter((issue) => issue.objective_id && objectiveIds.has(issue.objective_id))
        .map((issue) => [issue.id, issue.objective_id!] as const));
      return { edges: issueGraphEdges(shown, relations, shownObjectives), groupOf, objectiveIds };
    };
    return { open: build(false), all: build(true) };
  }, [issues, relations, objectives]);
  const withClosed = showClosed || scopes.open.edges.length === 0;
  const canToggleClosed = scopes.open.edges.length > 0 && scopes.all.edges.length > scopes.open.edges.length;
  const scope = withClosed ? scopes.all : scopes.open;
  const labelLength = useMemo(
    () => (id: string) => (objectiveNames.get(id)?.length ?? 0) + LABEL_SUFFIX,
    [objectiveNames],
  );
  const graph = useMemo(() => {
    const { edges, groupOf, objectiveIds } = scope;
    const linked = new Set(edges.flatMap((edge) => [edge.source, edge.target])).size;
    return layoutIssueGraph(edges, { ...frame(linked), groupOf, objectiveIds, labelLength });
  }, [scope, frame, labelLength]);
  return { graph, scope, canToggleClosed, labelLength };
}

/**
 * The rectangle the drawing takes in its frame: dots, bubbles and the names
 * above them. The enlarged view frames this rather than the whole layout
 * frame, so a small graph does not sit lost in a large one.
 */
export function graphBounds(
  graph: IssueGraph,
  labelLength: (objectiveId: string) => number,
  minimum = { width: 480, height: 300 },
): { x: number; y: number; width: number; height: number } {
  if (graph.nodes.length === 0) return { x: 0, y: 0, width: graph.width, height: graph.height };
  const margin = BUBBLE_PADDING + 10;
  let left = Infinity;
  let right = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  for (const node of graph.nodes) {
    left = Math.min(left, node.x - node.radius - margin);
    right = Math.max(right, node.x + node.radius + margin);
    top = Math.min(top, node.y - node.radius - margin);
    bottom = Math.max(bottom, node.y + node.radius + margin);
  }
  for (const group of graph.groups) {
    const members = graph.nodes.filter((node) => node.group === group.objectiveId);
    if (members.length === 0) continue;
    const centre = (Math.min(...members.map((node) => node.x)) + Math.max(...members.map((node) => node.x))) / 2;
    const half = (labelLength(group.objectiveId) * LABEL_CHARACTER_WIDTH) / 2 + 8;
    left = Math.min(left, centre - half);
    right = Math.max(right, centre + half);
    // The name's baseline sits above the bubble; its ascent needs room too.
    top = Math.min(top, Math.min(...members.map((node) => node.y)) - BUBBLE_PADDING - 6 - 18);
  }
  const width = Math.max(right - left, minimum.width);
  const height = Math.max(bottom - top, minimum.height);
  return {
    x: Math.round(left - (width - (right - left)) / 2),
    y: Math.round(top - (height - (bottom - top)) / 2),
    width: Math.round(width),
    height: Math.round(height),
  };
}

/**
 * One summary line between two objectives for the links between their
 * tickets, thicker the more there are.
 */
function groupLinksOf(graph: IssueGraph) {
  const position = new Map(graph.nodes.map((node) => [node.id, node]));
  const counts = new Map<string, { from: GraphNode; to: GraphNode; count: number }>();
  for (const edge of graph.edges) {
    const a = position.get(edge.source)!;
    const b = position.get(edge.target)!;
    // Every link leaving one objective for another, objective to objective
    // aside (those are drawn as they are).
    if (a.kind === "objective" && b.kind === "objective") continue;
    if (!a.group || !b.group || a.group === b.group) continue;
    const [first, second] = [a.group, b.group].sort();
    const key = `${first}:${second}`;
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { from: position.get(first)!, to: position.get(second)!, count: 1 });
  }
  return [...counts].map(([key, entry]) => ({ key, ...entry })).filter((entry) => entry.from && entry.to);
}

/**
 * The drawing of the issue graph (MIN-878): a dot per ticket that has a
 * relation or a parent, a line per link. Tickets are gathered in a bubble per
 * objective, around a square anchor that takes the objective's own relations.
 * Hovering a dot shows the ticket's board card, an anchor the objective's
 * card (MIN-879), and names the hovered ticket and its neighbours. Selecting
 * a dot or an anchor calls back; where it leads is the caller's.
 *
 * The statistics card and the enlarged view (MIN-897) share it. The enlarged
 * view frames it with `viewBox` and moves `contentRef` to zoom and pan.
 */
export const IssueGraphCanvas = memo(function IssueGraphCanvas({
  project,
  issues,
  objectives,
  graph,
  scope,
  onOpenIssue,
  onOpenObjective,
  viewBox,
  className,
  svgRef,
  contentRef,
}: {
  project: Project;
  issues: Issue[];
  objectives: Objective[];
  graph: IssueGraph;
  scope: { groupOf: Map<string, string>; objectiveIds: Set<string> };
  onOpenIssue: (issue: Issue) => void;
  onOpenObjective: (objective: Objective) => void;
  /** The part of the frame shown; the whole frame by default. */
  viewBox?: { x: number; y: number; width: number; height: number };
  className?: string;
  svgRef?: Ref<SVGSVGElement>;
  /** The group holding the whole drawing, for a zoom transform. */
  contentRef?: Ref<SVGGElement>;
}) {
  const t = useTranslations("ProjectStats");
  const markerId = useId();
  const [hovered, setHovered] = useState<string | null>(null);
  const byId = useMemo(() => new Map(issues.map((issue) => [issue.id, issue])), [issues]);
  const objectiveById = useMemo(() => new Map(objectives.map((objective) => [objective.id, objective])), [objectives]);
  const position = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph]);
  const groupLinks = useMemo(() => groupLinksOf(graph), [graph]);

  const neighbors = new Set<string>();
  if (hovered) {
    for (const edge of graph.edges) {
      if (edge.source === hovered) neighbors.add(edge.target);
      if (edge.target === hovered) neighbors.add(edge.source);
    }
  }
  const label = (issue: Issue) => `${issueIdentifier(project.key, issue.number)} ${issue.title}`;
  const hover = (node: GraphNode) => ({
    onPointerEnter: () => setHovered(node.id),
    onPointerLeave: () => setHovered(null),
    onFocus: () => setHovered(node.id),
    onBlur: () => setHovered(null),
  });
  const activate = (open: () => void) => ({
    onClick: open,
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    },
  });
  const frame = viewBox ?? { x: 0, y: 0, width: graph.width, height: graph.height };

  return (
    <svg
      ref={svgRef}
      viewBox={`${frame.x} ${frame.y} ${frame.width} ${frame.height}`}
      className={className}
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
      <g ref={contentRef}>
        {graph.groups.map((group) => {
          const objective = objectiveById.get(group.objectiveId);
          const members = graph.nodes.filter((node) => node.group === group.objectiveId);
          if (!objective || members.length === 0) return null;
          const hull = convexHull(members);
          const color = objectiveColor(objective.color);
          // The name sits centred above the bubble, in the room the layout
          // keeps for it.
          const top = Math.min(...members.map((node) => node.y)) - BUBBLE_PADDING - 6;
          const centre = (Math.min(...members.map((node) => node.x)) + Math.max(...members.map((node) => node.x))) / 2;
          const faded = hovered && !members.some((node) => node.id === hovered || neighbors.has(node.id));
          // A thick round-joined outline around the hull draws a padded,
          // rounded bubble, even for one or two dots.
          const outline = hull.length === 1
            ? `M${hull[0].x} ${hull[0].y}l0.01 0`
            : `M${hull.map((point) => `${point.x} ${point.y}`).join("L")}Z`;
          return (
            <g key={group.objectiveId} className={cn("transition-opacity", faded && "opacity-30")} aria-hidden>
              <path
                d={outline}
                style={{ fill: color, stroke: color }}
                fillOpacity={0.08}
                strokeOpacity={0.08}
                strokeWidth={BUBBLE_PADDING * 2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <text x={centre} y={top} textAnchor="middle" className="fill-muted-foreground text-[11px] font-medium">
                {objective.name}
                {group.hiddenMembers > 0 ? ` +${group.hiddenMembers}` : ""}
              </text>
            </g>
          );
        })}
        {groupLinks.map(({ key, from, to, count }) => (
          <line
            key={key}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            strokeWidth={1 + Math.min(count, 8) * 0.6}
            strokeLinecap="round"
            className={cn("stroke-muted-foreground/25 transition-opacity", hovered && "opacity-30")}
          >
            <title>{t("graphGroupLinksCount", { count })}</title>
          </line>
        ))}
        {graph.edges.map((edge) => {
          const from = position.get(edge.source)!;
          const to = position.get(edge.target)!;
          const style = EDGE_STYLE[edge.kind];
          const touched = hovered && (edge.source === hovered || edge.target === hovered);
          // A link between tickets of two groups would cross the whole
          // drawing: it shows only when one of its ends is hovered (between
          // two objectives, a summary line stands for it).
          if (isSummarized(edge, scope.groupOf, scope.objectiveIds) && !touched) return null;
          // A relation from a ticket outside any objective to one crosses
          // the drawing too: it stays, in the background until hovered.
          const reaching = (from.kind === "objective") !== (to.kind === "objective") && !(from.group && to.group);
          const faded = hovered ? !touched : reaching;
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
              className={cn(style.className, "transition-opacity", faded && (hovered ? "opacity-20" : "opacity-35"))}
            />
          );
        })}
        {graph.nodes.map((node) => {
          const faded = hovered && node.id !== hovered && !neighbors.has(node.id);
          // The dot is small: a wider transparent disc takes the pointer,
          // and its hover card (MIN-879) anchors on the whole group.
          const hit = <circle cx={node.x} cy={node.y} r={node.radius + HIT_SLOP} className="fill-transparent" />;
          if (node.kind === "objective") {
            const objective = objectiveById.get(node.id);
            if (!objective) return null;
            const size = node.radius * 2;
            return (
              <MentionHover key={node.id} type="objective" id={objective.id} project={project.id} side="top" align="center"
                onOpen={() => onOpenObjective(objective)}>
                <g
                  role="link"
                  tabIndex={0}
                  aria-label={objective.name}
                  {...activate(() => onOpenObjective(objective))}
                  {...hover(node)}
                  className="group cursor-default outline-none"
                >
                  {hit}
                  <rect
                    x={node.x - node.radius}
                    y={node.y - node.radius}
                    width={size}
                    height={size}
                    rx={size * 0.28}
                    style={{ fill: objectiveColor(objective.color) }}
                    className={cn(
                      "stroke-card stroke-2 transition-opacity group-focus-visible:stroke-ring",
                      isClosedObjective(objective) && "opacity-50",
                      faded && "opacity-15",
                    )}
                  />
                </g>
              </MentionHover>
            );
          }
          const issue = byId.get(node.id);
          if (!issue) return null;
          return (
            <MentionHover key={node.id} type="issue" id={issue.id} project={project.id} side="top" align="center"
              onOpen={() => onOpenIssue(issue)}>
              <g
                role="link"
                tabIndex={0}
                aria-label={label(issue)}
                {...activate(() => onOpenIssue(issue))}
                {...hover(node)}
                className="group cursor-default outline-none"
              >
                {hit}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={hovered === node.id ? node.radius + 1.5 : node.radius}
                  className={cn(
                    STATUS_TINT[issue.status].fill,
                    "stroke-card stroke-2 transition-opacity group-focus-visible:stroke-ring",
                    isClosedStatus(issue.status) && "opacity-50",
                    faded && "opacity-15",
                  )}
                />
              </g>
            </MentionHover>
          );
        })}
        {/* The hovered ticket and its neighbours name themselves: who is
            linked to what reads without hovering each dot in turn. */}
        {hovered && graph.nodes
          .filter((node) => node.kind !== "objective" && (node.id === hovered || neighbors.has(node.id)))
          .map((node) => {
            const issue = byId.get(node.id);
            if (!issue) return null;
            return (
              <text
                key={`label-${node.id}`}
                x={node.x + node.radius + 4}
                y={node.y + 3.5}
                aria-hidden
                className={cn(
                  "pointer-events-none fill-muted-foreground font-mono text-[10px] [paint-order:stroke] stroke-card stroke-[3px]",
                  node.id === hovered && "fill-foreground font-medium",
                )}
              >
                {issueIdentifier(project.key, issue.number)}
              </text>
            );
          })}
      </g>
    </svg>
  );
});

/** What the lines and squares stand for, and the switch that adds closed work. */
export function IssueGraphLegend({
  graph,
  canToggleClosed,
  showClosed,
  onShowClosedChange,
  className,
}: {
  graph: IssueGraph;
  canToggleClosed: boolean;
  showClosed: boolean;
  onShowClosedChange: (showClosed: boolean) => void;
  className?: string;
}) {
  const t = useTranslations("ProjectStats");
  const tRelations = useTranslations("Relations");
  const hasGroupLinks = useMemo(() => groupLinksOf(graph).length > 0, [graph]);
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-5 py-3 text-xs text-muted-foreground", className)}>
      {graph.groups.length > 0 && (
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px] bg-muted-foreground/60" aria-hidden />
          {t("graphObjective")}
        </span>
      )}
      {hasGroupLinks && (
        <span className="flex items-center gap-1.5">
          <svg viewBox="0 0 22 8" className="h-2 w-[22px]" aria-hidden>
            <line x1="1" y1="4" x2="21" y2="4" strokeWidth={3} strokeLinecap="round" className="stroke-muted-foreground/25" />
          </svg>
          {t("graphGroupLinks")}
        </span>
      )}
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
        <label className="ml-auto flex items-center gap-2 text-foreground">
          <Switch checked={showClosed} onCheckedChange={onShowClosedChange} />
          {t("graphShowClosed")}
        </label>
      )}
    </div>
  );
}
