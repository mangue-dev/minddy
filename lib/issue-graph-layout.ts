import { endpointType } from "./relation-validation";
import type { Issue, IssueRelation } from "./types";

// The ticket graph of the project statistics (MIN-878): which tickets are
// linked, by a relation or a parent, laid out by a small force simulation.
// Deterministic — same tickets, same picture — and pure, so it runs in Node
// tests. A library such as d3-force would do more than this needs: the graph
// is drawn once, never dragged, and stays under `MAX_GRAPH_NODES` nodes.

export type GraphEdgeKind = "blocks" | "related" | "parent";

export interface GraphNode {
  id: string;
  x: number;
  y: number;
  /** Number of links touching the ticket. */
  degree: number;
  /** Dot radius: grows with the links, capped by the room around the dot. */
  radius: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  kind: GraphEdgeKind;
}

export interface IssueGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
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

/** Ticket-to-ticket links: issue relations plus parent → child links. */
export function issueGraphEdges(
  issues: Pick<Issue, "id" | "parent_id">[],
  relations: IssueRelation[],
): GraphEdge[] {
  const known = new Set(issues.map((issue) => issue.id));
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  const push = (source: string, target: string, kind: GraphEdgeKind) => {
    if (source === target || !known.has(source) || !known.has(target)) return;
    const key = [source, target].sort().join("\0");
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ source, target, kind });
  };
  for (const issue of issues) {
    if (issue.parent_id) push(issue.parent_id, issue.id, "parent");
  }
  for (const relation of relations) {
    if (endpointType(relation.source_type) !== "issue" || endpointType(relation.target_type) !== "issue") continue;
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

/**
 * The tickets drawn, past `maxNodes`: the most connected ones by weighted
 * links, then only those still linked to another kept ticket. A large
 * project usually forms one big cluster, so leaving out whole groups (the
 * first approach) left almost nothing on screen; keeping the hubs keeps the
 * structure that matters.
 */
function selectNodes(edges: GraphEdge[], maxNodes: number): string[] {
  const score = new Map<string, number>();
  for (const edge of edges) {
    for (const id of [edge.source, edge.target]) {
      score.set(id, (score.get(id) ?? 0) + LINK_WEIGHT[edge.kind]);
    }
  }
  if (score.size <= maxNodes) return [...score.keys()].sort();
  const ranked = [...score]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, maxNodes)
    .map(([id]) => id);
  const ranks = new Set(ranked);
  const stillLinked = new Set(
    edges
      .filter((edge) => ranks.has(edge.source) && ranks.has(edge.target))
      .flatMap((edge) => [edge.source, edge.target]),
  );
  return ranked.filter((id) => stillLinked.has(id)).sort();
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
/** Room between two packed clusters, in link units. */
const CLUSTER_GAP = 1.4;

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

interface Shelf {
  top: number;
  height: number;
  width: number;
  items: { shape: ClusterShape; left: number }[];
}

/** Rows of clusters, tallest first, within `maxWidth` link units; null when one does not fit. */
function packShelves(shapes: ClusterShape[], maxWidth: number): Shelf[] | null {
  const shelves: Shelf[] = [];
  for (const shape of [...shapes].sort((a, b) => b.height - a.height)) {
    if (shape.width > maxWidth) return null;
    const shelf = shelves.find((row) => row.width + CLUSTER_GAP + shape.width <= maxWidth);
    if (shelf) {
      shelf.items.push({ shape, left: shelf.width + CLUSTER_GAP });
      shelf.width += CLUSTER_GAP + shape.width;
    } else {
      const last = shelves.at(-1);
      shelves.push({
        top: last ? last.top + last.height + CLUSTER_GAP : 0,
        height: shape.height,
        width: shape.width,
        items: [{ shape, left: 0 }],
      });
    }
  }
  return shelves;
}

/**
 * Lays out the linked tickets. Only tickets with at least one link appear;
 * past `maxNodes`, the most connected ones are kept (see `selectNodes`).
 *
 * Each cluster is laid out on its own and the clusters are packed in rows at
 * one common scale, so a link has the same length everywhere. Laying the whole
 * graph out at once pushed the small islands to the edges, and fitting that to
 * the frame crushed every cluster into overlapping dots.
 */
export function layoutIssueGraph(
  edges: GraphEdge[],
  { width = 640, height = 360, maxNodes = MAX_GRAPH_NODES }: { width?: number; height?: number; maxNodes?: number } = {},
): IssueGraph {
  const linkedIds = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
  const kept = selectNodes(edges, maxNodes);
  const keptSet = new Set(kept);
  const keptEdges = edges.filter((edge) => keptSet.has(edge.source) && keptSet.has(edge.target));
  const count = kept.length;
  if (count === 0) return { nodes: [], edges: [], width, height, hiddenNodes: linkedIds.size };

  const index = new Map(kept.map((id, i) => [id, i]));
  const degree = new Array<number>(count).fill(0);
  const links = keptEdges.map((edge) => {
    const a = index.get(edge.source)!;
    const b = index.get(edge.target)!;
    degree[a] += 1;
    degree[b] += 1;
    return [a, b] as const;
  });
  const shapes = clusters(count, links).map((members) => layoutCluster(members, links));

  // The largest scale (pixels per link unit) whose packing fits the frame.
  const padding = 24;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const fits = (scale: number) => {
    const shelves = packShelves(shapes, innerWidth / scale);
    if (!shelves) return null;
    const last = shelves.at(-1)!;
    return (last.top + last.height) * scale <= innerHeight ? shelves : null;
  };
  let low = 4;
  let high = 56;
  let shelves = fits(high);
  if (!shelves) {
    for (let step = 0; step < 20; step += 1) {
      const middle = (low + high) / 2;
      if (fits(middle)) low = middle;
      else high = middle;
    }
    shelves = fits(low) ?? packShelves(shapes, Number.POSITIVE_INFINITY)!;
  } else {
    low = high;
  }
  const scale = low;

  // Centre the packing, and each row within it.
  const usedHeight = (shelves.at(-1)!.top + shelves.at(-1)!.height) * scale;
  // A small graph does not float in an empty frame: the frame shrinks to the
  // drawing, down to `MIN_HEIGHT`.
  const frameHeight = Math.round(Math.min(height, Math.max(MIN_HEIGHT, usedHeight + padding * 2)));
  const offsetY = (frameHeight - usedHeight) / 2;
  const x = new Array<number>(count).fill(0);
  const y = new Array<number>(count).fill(0);
  for (const shelf of shelves) {
    const offsetX = (width - shelf.width * scale) / 2;
    for (const { shape, left } of shelf.items) {
      // A short cluster sits in the middle of its row.
      const top = shelf.top + (shelf.height - shape.height) / 2;
      shape.members.forEach((node, i) => {
        x[node] = offsetX + (left + shape.x[i]) * scale;
        y[node] = offsetY + (top + shape.y[i]) * scale;
      });
    }
  }
  // Dots never grow past the room a link leaves them.
  const maxRadius = Math.max(2.5, scale * MIN_GAP * 0.45);
  return {
    nodes: kept.map((id, i) => ({
      id,
      x: Math.round(x[i] * 10) / 10,
      y: Math.round(y[i] * 10) / 10,
      degree: degree[i],
      radius: Math.round(Math.min(4 + Math.min(degree[i], 6), maxRadius) * 10) / 10,
    })),
    edges: keptEdges,
    width,
    height: frameHeight,
    hiddenNodes: linkedIds.size - count,
  };
}
