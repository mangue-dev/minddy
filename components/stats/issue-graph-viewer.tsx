"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { select } from "d3-selection";
import { zoom, zoomIdentity, type ZoomBehavior } from "d3-zoom";
import { HugeiconsIcon } from "@hugeicons/react";
import { MinusSignIcon, PlusSignIcon } from "@hugeicons/core-free-icons";
import type { Issue, IssueRelation, Objective, Project } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { PreviewViewer } from "@/components/image-viewer";
import {
  graphBounds,
  IssueGraphCanvas,
  IssueGraphLegend,
  useIssueGraph,
  type GraphFrame,
} from "@/components/stats/issue-graph-canvas";

/**
 * The room the enlarged graph is laid out in, in square pixels: its shape
 * follows the window, so the groups wrap into more rows on a narrow screen.
 */
const FRAME_AREA = 1600 * 1000;
/**
 * Tickets drawn in the enlarged view, five times the card's: with zoom, a
 * large project reads whole instead of through its most connected tickets.
 */
const VIEWER_MAX_NODES = 600;
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.5;

type Bounds = { x: number; y: number; width: number; height: number };

/**
 * Zoom and pan of an SVG drawing, through d3-zoom: wheel and pinch zoom on
 * the pointer, a drag pans, a double click zooms in. The transform is written
 * on the content group directly, so a gesture never renders the graph again;
 * only the scale is published, for the controls.
 */
function useGraphZoom(bounds: Bounds) {
  // The reader mounts its content a render after it opens, and drops it when
  // it closes: the element is state, so the behavior follows it.
  const [element, setElement] = useState<SVGSVGElement | null>(null);
  const content = useRef<SVGGElement>(null);
  const behavior = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const scale = useRef(1);
  const listeners = useRef(new Set<() => void>());
  const { x, y, width, height } = bounds;

  useEffect(() => {
    if (!element) return;
    // In the drawing's own units: the pointer is read through the viewBox.
    const extent: [[number, number], [number, number]] = [[x, y], [x + width, y + height]];
    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .extent(extent)
      .translateExtent(extent)
      .scaleExtent([1, MAX_ZOOM])
      .on("zoom", (event: { transform: { k: number; toString(): string } }) => {
        content.current?.setAttribute("transform", event.transform.toString());
        if (event.transform.k === scale.current) return;
        scale.current = event.transform.k;
        for (const listener of listeners.current) listener();
      });
    const selection = select(element);
    selection.call(zoomBehavior);
    // A new drawing starts whole.
    zoomBehavior.transform(selection, zoomIdentity);
    behavior.current = zoomBehavior;
    return () => {
      selection.on(".zoom", null);
      behavior.current = null;
    };
  }, [element, x, y, width, height]);

  const scaleBy = useCallback((factor: number) => {
    if (element) behavior.current?.scaleBy(select(element), factor);
  }, [element]);
  const reset = useCallback(() => {
    if (element) behavior.current?.transform(select(element), zoomIdentity);
  }, [element]);
  const subscribe = useCallback((listener: () => void) => {
    listeners.current.add(listener);
    return () => { listeners.current.delete(listener); };
  }, []);
  const getScale = useCallback(() => scale.current, []);
  return { svg: setElement, content, scaleBy, reset, subscribe, getScale };
}

function ZoomControls({ zoom: { scaleBy, reset, subscribe, getScale } }: { zoom: ReturnType<typeof useGraphZoom> }) {
  const t = useTranslations("ProjectStats");
  const scale = useSyncExternalStore(subscribe, getScale, () => 1);
  return (
    <div className="ml-auto flex shrink-0 items-center gap-0.5">
      <Button type="button" variant="ghost" size="icon-sm" aria-label={t("graphZoomOut")} disabled={scale <= 1} onClick={() => scaleBy(1 / ZOOM_STEP)}>
        <HugeiconsIcon icon={MinusSignIcon} className="size-4" aria-hidden />
      </Button>
      <Button type="button" variant="ghost" size="sm" className="min-w-14 tabular-nums" tooltip={t("graphZoomReset")} aria-label={t("graphZoomReset")} disabled={scale === 1} onClick={reset}>
        <span aria-hidden>{Math.round(scale * 100)}%</span>
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" aria-label={t("graphZoomIn")} disabled={scale >= MAX_ZOOM} onClick={() => scaleBy(ZOOM_STEP)}>
        <HugeiconsIcon icon={PlusSignIcon} className="size-4" aria-hidden />
      </Button>
    </div>
  );
}

/**
 * The issue graph in the full-screen reader (MIN-897): the same drawing as
 * the statistics card, laid out in a larger frame with more tickets, zoomed
 * and panned to read a large project.
 *
 * The reader is a native dialog in the top layer, above the issue side
 * panel: selecting a ticket or an objective closes it first.
 */
export function IssueGraphViewer({
  open,
  onOpenChange,
  project,
  issues,
  relations,
  objectives,
  showClosed,
  onShowClosedChange,
  onOpenIssue,
  onOpenObjective,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
  issues: Issue[];
  relations: IssueRelation[];
  objectives: Objective[];
  showClosed: boolean;
  onShowClosedChange: (showClosed: boolean) => void;
  onOpenIssue: (issue: Issue) => void;
  onOpenObjective: (objective: Objective) => void;
}) {
  const t = useTranslations("ProjectStats");
  // The frame takes the window's proportions when the viewer first opens, so
  // the drawing fills a wide screen and a phone held upright alike.
  const [aspect] = useState(() => Math.min(Math.max((window.innerHeight - 220) / Math.max(window.innerWidth, 1), 0.5), 1.6));
  const frame = useCallback<GraphFrame>(
    () => {
      const width = Math.round(Math.sqrt(FRAME_AREA / aspect));
      return { width, height: Math.round(width * aspect), maxNodes: VIEWER_MAX_NODES };
    },
    [aspect],
  );
  const { graph, scope, canToggleClosed, labelLength } = useIssueGraph({ issues, relations, objectives, showClosed, frame });
  const bounds = useMemo(() => graphBounds(graph, labelLength), [graph, labelLength]);
  const graphZoom = useGraphZoom(bounds);
  const openIssue = useCallback((issue: Issue) => {
    onOpenChange(false);
    onOpenIssue(issue);
  }, [onOpenChange, onOpenIssue]);
  const openObjective = useCallback((objective: Objective) => {
    onOpenChange(false);
    onOpenObjective(objective);
  }, [onOpenChange, onOpenObjective]);

  return (
    <PreviewViewer label={t("graphTitle")} open={open} onOpenChange={onOpenChange}>
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-lg">
        <div className="flex shrink-0 items-center gap-3 border-b border-border py-2 pr-2 pl-5">
          <h2 className="truncate text-sm font-medium">{t("graphTitle")}</h2>
          <ZoomControls zoom={graphZoom} />
        </div>
        <div className="relative min-h-0 flex-1">
          <IssueGraphCanvas
            project={project}
            issues={issues}
            objectives={objectives}
            graph={graph}
            scope={scope}
            onOpenIssue={openIssue}
            onOpenObjective={openObjective}
            viewBox={bounds}
            svgRef={graphZoom.svg}
            contentRef={graphZoom.content}
            className="absolute inset-0 size-full cursor-grab touch-none select-none active:cursor-grabbing"
          />
        </div>
        <IssueGraphLegend graph={graph} canToggleClosed={canToggleClosed} showClosed={showClosed} onShowClosedChange={onShowClosedChange} />
      </div>
    </PreviewViewer>
  );
}
