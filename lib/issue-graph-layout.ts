import { endpointType } from "./relation-validation";
import type { Issue, IssueRelation } from "./types";

// The ticket graph of the project statistics (MIN-878): which tickets are
// linked, by a relation or a parent, grouped by the objective they belong
// to, laid out by a small force simulation. Deterministic — same tickets,
// same picture — and pure, so it runs in Node tests. A library such as
// d3-force would do more than this needs: the graph is drawn once, never
// dragged, and stays under `MAX_GRAPH_NODES` tickets.

export type GraphEdgeKind = "blocks" | "related" | "parent";

export interface GraphNode {
  id: string;
  /** A ticket, or the anchor of an objective's group. */
  kind: "issue" | "objective";
  /** The objective whose group holds the node (an anchor holds its own id). */
  group: string | null;
  x: number;
  y: number;
  /** Number of links touching the node. */
  degree: number;
  /** Dot radius: grows with the links, capped by the room around the dot. */
  radius: number;
}

export interface GraphGroup {
  objectiveId: string;
  /** Linked tickets of the objective left out to keep the drawing readable. */
  hiddenMembers: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  kind: GraphEdgeKind;
}

export interface IssueGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  groups: GraphGroup[];
  width: number;
  height: number;
  /** Linked tickets left out to keep the drawing readable. */
  hiddenNodes: number;
}

/** The drawing stays legible, and the O(n²) repulsion cheap, below this. */
export const MAX_GRAPH_NODES = 120;
const ITERATIONS = 250;
/** The shortest frame a graph is drawn in, in pixels. */
const MIN_HEIGHT = 160;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * The graph's links: issue relations and parent → child links, plus the
 * relations that reach an objective in `objectives` (issue ↔ objective and
 * objective ↔ objective). Belonging to an objective is not a link: the
 * layout groups members with `groupOf`.
 */
export function issueGraphEdges(
  issues: Pick<Issue, "id" | "parent_id">[],
  relations: IssueRelation[],
  objectives: { id: string }[] = [],
): GraphEdge[] {
  const known = new Set(issues.map((issue) => issue.id));
  const knownObjectives = new Set(objectives.map((objective) => objective.id));
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  const push = (source: string, target: string, kind: GraphEdgeKind) => {
    if (source === target) return;
    const key = [source, target].sort().join("\0");
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ source, target, kind });
  };
  for (const issue of issues) {
    if (issue.parent_id && known.has(issue.parent_id)) push(issue.parent_id, issue.id, "parent");
  }
  const present = (id: string, type: unknown) =>
    endpointType(type) === "issue" ? known.has(id) : knownObjectives.has(id);
  for (const relation of relations) {
    if (!present(relation.source_id, relation.source_type) || !present(relation.target_id, relation.target_type)) continue;
    push(relation.source_id, relation.target_id, relation.type);
  }
  return edges;
}

/**
 * What a ticket weighs when the graph must leave some out: a blocking link
 * says the most about the work, a parent link groups it, a "related" link —
 * the kind Smart Fill adds generously — the least.
 */
const LINK_WEIGHT: Record<GraphEdgeKind, number> = { blocks: 3, parent: 2, related: 1 };

/** The fewest tickets an objective keeps when the graph must leave some out. */
const GROUP_FLOOR = 3;

/**
 * The tickets drawn, past `maxNodes`: each objective first keeps its
 * `GROUP_FLOOR` most connected tickets, so a large objective cannot crowd the
 * others out, then the remaining room goes to the most connected tickets
 * overall, by weighted links. A large project usually forms one big cluster,
 * so leaving out whole groups (the first approach) left almost nothing on
 * screen; keeping the hubs keeps the structure that matters.
 */
function selectIssues(
  candidates: string[],
  score: Map<string, number>,
  groupOf: (id: string) => string | null,
  maxNodes: number,
): Set<string> {
  if (candidates.length <= maxNodes) return new Set(candidates);
  const ranked = [...candidates].sort((a, b) => (score.get(b) ?? 0) - (score.get(a) ?? 0) || a.localeCompare(b));
  const kept = new Set<string>();
  const perGroup = new Map<string, number>();
  for (const id of ranked) {
    const group = groupOf(id);
    if (!group || kept.size >= maxNodes) continue;
    const taken = perGroup.get(group) ?? 0;
    if (taken >= GROUP_FLOOR) continue;
    perGroup.set(group, taken + 1);
    kept.add(id);
  }
  for (const id of ranked) {
    if (kept.size >= maxNodes) break;
    kept.add(id);
  }
  return kept;
}

/** Connected groups of node indices, largest first. */
function clusters(count: number, links: (readonly [number, number])[]): number[][] {
  const neighbors = Array.from({ length: count }, () => [] as number[]);
  for (const [a, b] of links) {
    neighbors[a].push(b);
    neighbors[b].push(a);
  }
  const seen = new Array<boolean>(count).fill(false);
  const groups: number[][] = [];
  for (let start = 0; start < count; start += 1) {
    if (seen[start]) continue;
    const group: number[] = [];
    const stack = [start];
    seen[start] = true;
    while (stack.length) {
      const current = stack.pop()!;
      group.push(current);
      for (const next of neighbors[current]) {
        if (!seen[next]) {
          seen[next] = true;
          stack.push(next);
        }
      }
    }
    groups.push(group.sort((a, b) => a - b));
  }
  return groups.sort((a, b) => b.length - a.length || a[0] - b[0]);
}

interface ClusterShape {
  members: number[];
  /** Positions in link units (an ideal link is 1 long), origin at the top left. */
  x: number[];
  y: number[];
  width: number;
  height: number;
}

/** Closest two dots may sit, in link units. */
const MIN_GAP = 0.8;
/** The largest scale, in pixels per link unit. */
const MAX_SCALE = 56;

/**
 * Fruchterman–Reingold on one cluster, in link units: repulsion between every
 * pair, attraction along links, a pull to the centre that keeps the cluster
 * round, then a few passes pushing overlapping dots apart.
 */
function layoutCluster(members: number[], links: (readonly [number, number])[]): ClusterShape {
  const count = members.length;
  const local = new Map(members.map((node, i) => [node, i]));
  const own = links
    .filter(([a]) => local.has(a))
    .map(([a, b]) => [local.get(a)!, local.get(b)!] as const);
  // Seeded on a sunflower spiral: spread out, and identical on every run.
  const x = members.map((_, i) => Math.cos(i * GOLDEN_ANGLE) * Math.sqrt(i + 0.5) * 0.6);
  const y = members.map((_, i) => Math.sin(i * GOLDEN_ANGLE) * Math.sqrt(i + 0.5) * 0.6);

  let temperature = Math.sqrt(count);
  for (let step = 0; count > 1 && step < ITERATIONS; step += 1) {
    const dx = new Array<number>(count).fill(0);
    const dy = new Array<number>(count).fill(0);
    for (let i = 0; i < count; i += 1) {
      for (let j = i + 1; j < count; j += 1) {
        let ox = x[i] - x[j];
        let oy = y[i] - y[j];
        let distance = Math.hypot(ox, oy);
        if (distance < 0.01) {
          ox = 0.01 * (i - j);
          oy = 0.01;
          distance = Math.hypot(ox, oy);
        }
        const force = 1 / distance;
        dx[i] += (ox / distance) * force;
        dy[i] += (oy / distance) * force;
        dx[j] -= (ox / distance) * force;
        dy[j] -= (oy / distance) * force;
      }
    }
    for (const [a, b] of own) {
      const ox = x[a] - x[b];
      const oy = y[a] - y[b];
      const distance = Math.max(Math.hypot(ox, oy), 0.01);
      const force = distance * distance;
      dx[a] -= (ox / distance) * force;
      dy[a] -= (oy / distance) * force;
      dx[b] += (ox / distance) * force;
      dy[b] += (oy / distance) * force;
    }
    for (let i = 0; i < count; i += 1) {
      dx[i] -= x[i] * 0.1;
      dy[i] -= y[i] * 0.1;
      const length = Math.max(Math.hypot(dx[i], dy[i]), 0.01);
      const move = Math.min(length, temperature);
      x[i] += (dx[i] / length) * move;
      y[i] += (dy[i] / length) * move;
    }
    temperature = Math.max(temperature * 0.98, 0.01);
  }
  for (let pass = 0; pass < 30; pass += 1) {
    for (let i = 0; i < count; i += 1) {
      for (let j = i + 1; j < count; j += 1) {
        const ox = x[i] - x[j];
        const oy = y[i] - y[j];
        const distance = Math.hypot(ox, oy);
        if (distance >= MIN_GAP) continue;
        const push = (MIN_GAP - distance) / 2;
        const ux = distance > 0 ? ox / distance : 1;
        const uy = distance > 0 ? oy / distance : 0;
        x[i] += ux * push;
        y[i] += uy * push;
        x[j] -= ux * push;
        y[j] -= uy * push;
      }
    }
  }
  const minX = Math.min(...x);
  const minY = Math.min(...y);
  return {
    members,
    x: x.map((value) => value - minX),
    y: y.map((value) => value - minY),
    width: Math.max(...x) - minX,
    height: Math.max(...y) - minY,
  };
}

/** Room around an objective's dots for its bubble, in pixels. */
const BUBBLE_ROOM = 16;
/** Room above an objective's bubble for its name, in pixels. */
const LABEL_HEIGHT = 16;
/** Width of a label character (11 px text), in pixels, rounded up. */
const LABEL_CHARACTER_WIDTH = 6.6;
/** Room around a cluster outside any objective, in pixels. */
const LOOSE_ROOM = 6;
/** Room between two boxes, in pixels. */
const BOX_GAP = 12;

/**
 * A link that leaves its group: between tickets of two groups (two
 * objectives, or an objective and the tickets outside any), or from a ticket
 * of one objective to another objective. Drawing it would cross the whole
 * graph, so it shows only when one of its ends is hovered; between two
 * objectives a summary line stands for it. Links between objectives, and a
 * relation from a ticket outside any objective to an objective, stay drawn:
 * nothing else would tell them.
 */
export function isSummarized(
  edge: GraphEdge,
  groupOf: Map<string, string>,
  objectiveIds: Set<string>,
): boolean {
  const sourceIsObjective = objectiveIds.has(edge.source);
  const targetIsObjective = objectiveIds.has(edge.target);
  if (sourceIsObjective && targetIsObjective) return false;
  if (sourceIsObjective || targetIsObjective) {
    const objective = sourceIsObjective ? edge.source : edge.target;
    const issueGroup = groupOf.get(sourceIsObjective ? edge.target : edge.source) ?? null;
    return issueGroup !== null && issueGroup !== objective;
  }
  return (groupOf.get(edge.source) ?? null) !== (groupOf.get(edge.target) ?? null);
}

/**
 * Lays out the linked tickets and the objectives they belong to. Only tickets
 * with at least one link appear; past `maxNodes`, the most connected ones are
 * kept (see `selectIssues`). An objective appears when it holds a shown
 * ticket or takes part in a link.
 *
 * Two levels: each objective's group (its anchor and its tickets) and each
 * cluster of tickets without an objective is laid out on its own, then the
 * groups are placed together at one common scale, so a link has the same
 * length everywhere and a group never overlaps another.
 */
export function layoutIssueGraph(
  edges: GraphEdge[],
  {
    width = 640,
    height = 360,
    maxNodes = MAX_GRAPH_NODES,
    groupOf = new Map<string, string>(),
    objectiveIds = new Set<string>(),
    labelLength = () => 0,
  }: {
    width?: number;
    height?: number;
    maxNodes?: number;
    /** Ticket id → the objective it belongs to, for objectives that are drawn. */
    groupOf?: Map<string, string>;
    /** The objectives that may appear, as anchors. */
    objectiveIds?: Set<string>;
    /** Characters in an objective's label, so its bubble leaves the label room. */
    labelLength?: (objectiveId: string) => number;
  } = {},
): IssueGraph {
  const isObjective = (id: string) => objectiveIds.has(id);
  const candidates = [...new Set(edges.flatMap((edge) => [edge.source, edge.target]))]
    .filter((id) => !isObjective(id))
    .sort();
  const score = new Map<string, number>();
  for (const edge of edges) {
    for (const id of [edge.source, edge.target]) {
      if (!isObjective(id)) score.set(id, (score.get(id) ?? 0) + LINK_WEIGHT[edge.kind]);
    }
  }
  const objectiveOf = (id: string) => (isObjective(id) ? id : groupOf.get(id) ?? null);
  const keptIssues = selectIssues(candidates, score, (id) => groupOf.get(id) ?? null, maxNodes);
  const drawn = (id: string) => (isObjective(id) ? true : keptIssues.has(id));
  let keptEdges = edges.filter((edge) => drawn(edge.source) && drawn(edge.target));
  // Anchors: objectives holding a shown ticket or taking part in a shown link.
  const anchors = new Set<string>();
  for (const id of keptIssues) {
    const group = groupOf.get(id);
    if (group) anchors.add(group);
  }
  for (const edge of keptEdges) {
    if (isObjective(edge.source)) anchors.add(edge.source);
    if (isObjective(edge.target)) anchors.add(edge.target);
  }
  // A link between tickets of two different groups is only drawn on hover
  // (see `isSummarized`): a ticket outside any objective needs another link
  // to appear, or it would stand alone without a line.
  const linked = new Set(keptEdges
    .filter((edge) => !isSummarized(edge, groupOf, objectiveIds))
    .flatMap((edge) => [edge.source, edge.target]));
  const kept = [
    ...[...anchors].sort(),
    ...[...keptIssues].filter((id) => groupOf.get(id) || linked.has(id)).sort(),
  ];
  const keptSet = new Set(kept);
  keptEdges = keptEdges.filter((edge) => keptSet.has(edge.source) && keptSet.has(edge.target));
  const count = kept.length;
  const groups: GraphGroup[] = [...anchors].sort().map((objectiveId) => ({
    objectiveId,
    hiddenMembers: candidates.filter((id) => groupOf.get(id) === objectiveId && !keptIssues.has(id)).length,
  }));
  if (count === 0) {
    return { nodes: [], edges: [], groups: [], width, height, hiddenNodes: candidates.length };
  }

  const index = new Map(kept.map((id, i) => [id, i]));
  const degree = new Array<number>(count).fill(0);
  const links = keptEdges.map((edge) => {
    const a = index.get(edge.source)!;
    const b = index.get(edge.target)!;
    degree[a] += 1;
    degree[b] += 1;
    return [a, b] as const;
  });
  const groupIndex = (node: number) => objectiveOf(kept[node]);

  // Level one: a shape per objective group, a shape per cluster outside them.
  const objectiveShapes: { shape: ClusterShape; labelLength: number }[] = [];
  for (const objectiveId of [...anchors].sort()) {
    const members = kept.map((_, i) => i).filter((i) => groupIndex(i) === objectiveId);
    const anchor = index.get(objectiveId)!;
    // Inside a group, every ticket also leans on its objective's anchor.
    const own = [
      ...links.filter(([a, b]) => groupIndex(a) === objectiveId && groupIndex(b) === objectiveId),
      ...members.filter((i) => i !== anchor).map((i) => [anchor, i] as const),
    ];
    objectiveShapes.push({ shape: layoutCluster(members, own), labelLength: labelLength(objectiveId) });
  }
  // The largest objectives first, the clusters outside any objective after.
  objectiveShapes.sort((a, b) => b.shape.members.length - a.shape.members.length || a.shape.members[0] - b.shape.members[0]);
  const loose = new Set(kept.map((_, i) => i).filter((i) => groupIndex(i) === null));
  const looseLinks = links.filter(([a, b]) => loose.has(a) && loose.has(b));
  const looseShapes = clusters(count, looseLinks)
    .filter((group) => loose.has(group[0]))
    .map((cluster) => layoutCluster(cluster, looseLinks))
    .sort((a, b) => b.height - a.height || a.members[0] - b.members[0]);

  // Level two: rows of boxes, in pixels. A box is its shape at the scale
  // being tried, plus, for an objective, the bubble around the dots and its
  // name above, so neither ever reaches a neighbour.
  const padding = 24;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const boxes = (scale: number) => [
    ...objectiveShapes.map(({ shape, labelLength: characters }) => {
      const dotsWidth = shape.width * scale + BUBBLE_ROOM * 2;
      return {
        shape,
        width: Math.max(dotsWidth, characters * LABEL_CHARACTER_WIDTH),
        height: shape.height * scale + BUBBLE_ROOM * 2 + LABEL_HEIGHT,
        top: BUBBLE_ROOM + LABEL_HEIGHT,
        newRow: false,
      };
    }),
    ...looseShapes.map((shape, i) => ({
      shape,
      width: shape.width * scale + LOOSE_ROOM * 2,
      height: shape.height * scale + LOOSE_ROOM * 2,
      top: LOOSE_ROOM,
      // The tickets outside any objective start their own rows.
      newRow: i === 0 && objectiveShapes.length > 0,
    })),
  ];
  type Box = ReturnType<typeof boxes>[number];
  const rows = (scale: number) => {
    const result: { boxes: Box[]; width: number; height: number }[] = [];
    for (const box of boxes(scale)) {
      if (box.width > innerWidth) return null;
      const row = result.at(-1);
      if (row && !box.newRow && row.width + BOX_GAP + box.width <= innerWidth) {
        row.boxes.push(box);
        row.width += BOX_GAP + box.width;
        row.height = Math.max(row.height, box.height);
      } else {
        result.push({ boxes: [box], width: box.width, height: box.height });
      }
    }
    return result;
  };
  const totalHeight = (layout: NonNullable<ReturnType<typeof rows>>) =>
    layout.reduce((sum, row) => sum + row.height, 0) + BOX_GAP * (layout.length - 1);
  const fits = (scale: number) => {
    const layout = rows(scale);
    return layout && totalHeight(layout) <= innerHeight ? layout : null;
  };
  let low = 4;
  let high = MAX_SCALE;
  if (!fits(high)) {
    for (let step = 0; step < 24; step += 1) {
      const middle = (low + high) / 2;
      if (fits(middle)) low = middle;
      else high = middle;
    }
  } else {
    low = high;
  }
  const scale = low;
  const layout = fits(scale) ?? rows(scale) ?? [];
  // A small graph does not float in an empty frame: the frame shrinks to the
  // drawing, down to `MIN_HEIGHT`.
  const usedHeight = totalHeight(layout);
  const frameHeight = Math.round(Math.min(height, Math.max(MIN_HEIGHT, usedHeight + padding * 2)));
  const x = new Array<number>(count).fill(0);
  const y = new Array<number>(count).fill(0);
  let rowTop = (frameHeight - usedHeight) / 2;
  for (const row of layout) {
    let left = (width - row.width) / 2;
    for (const box of row.boxes) {
      const boxTop = rowTop + (row.height - box.height) / 2;
      const originX = left + (box.width - box.shape.width * scale) / 2;
      box.shape.members.forEach((node, i) => {
        x[node] = originX + box.shape.x[i] * scale;
        y[node] = boxTop + box.top + box.shape.y[i] * scale;
      });
      left += box.width + BOX_GAP;
    }
    rowTop += row.height + BOX_GAP;
  }
  // Dots never grow past the room a link leaves them.
  const maxRadius = Math.max(2.5, scale * MIN_GAP * 0.45);
  return {
    nodes: kept.map((id, i) => ({
      id,
      kind: isObjective(id) ? "objective" as const : "issue" as const,
      group: groupIndex(i),
      x: Math.round(x[i] * 10) / 10,
      y: Math.round(y[i] * 10) / 10,
      degree: degree[i],
      radius: Math.round(Math.min(isObjective(id) ? 7 : 4 + Math.min(degree[i], 6), maxRadius) * 10) / 10,
    })),
    edges: keptEdges,
    groups,
    width,
    height: frameHeight,
    hiddenNodes: candidates.length - keptIssues.size,
  };
}

/**
 * The convex hull of a group's dots (Andrew's monotone chain), the outline of
 * an objective's bubble; one or two points come back as they are.
 */
export function convexHull(points: { x: number; y: number }[]): { x: number; y: number }[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length < 3) return sorted;
  const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (list: { x: number; y: number }[]) => {
    const chain: { x: number; y: number }[] = [];
    for (const point of list) {
      while (chain.length >= 2 && cross(chain[chain.length - 2], chain[chain.length - 1], point) <= 0) chain.pop();
      chain.push(point);
    }
    return chain;
  };
  const lower = half(sorted);
  const upper = half([...sorted].reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
