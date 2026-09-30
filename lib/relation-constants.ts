import type { AppIcon } from "@/components/icon";
import type {
  IssueRelation,
  IssueRelationType,
  Issue,
  Objective,
  RelationEndpointType,
  ResolvedRelation,
} from "./types";
import { CancelCircleIcon as Ban, Link02Icon as Link2, OctagonXIcon as OctagonX } from "@hugeicons/core-free-icons";
import type { ObjectiveStatus } from "./objective-constants";
import {
  endpointType,
  RELATION_TYPE_VALUES,
} from "./relation-validation";
import { isClosedStatus, type IssueStatus } from "./issue-constants";

// Issue relations (MIN-25). Two edges are stored — `blocks` (directed) and
// `related` (symmetric) — but three are shown: an incoming `blocks` reads as
// `blocked_by`. Labels are i18n'd — resolve via useTranslations("Relations").

export interface RelationMeta {
  value: IssueRelationType;
  icon: AppIcon;
  /** Tailwind text-color class for the icon (see the `!` note below). */
  color: string;
}

// blocked_by = you're stuck (red, most urgent); blocks = you gate others
// (amber); related = a soft link (muted).
//
// `!` because the tint carries the meaning and must survive a hovered menu row:
// both menus that offer these relations repaint their rows' icons — the card's
// right-click menu with `focus:**:text-accent-foreground` (DropdownMenuItem),
// the side panel's picker with `data-selected:*:[svg]:text-foreground`
// (CommandItem), and the latter outranks a plain utility class on the svg.
// Same intent as PriorityIndicator's fill-* dodge in issue-indicators.tsx.
export const RELATION_META: Record<IssueRelationType, RelationMeta> = {
  blocked_by: { value: "blocked_by", icon: Ban, color: "text-red-500!" },
  blocks: { value: "blocks", icon: OctagonX, color: "text-amber-500!" },
  related: { value: "related", icon: Link2, color: "text-muted-foreground!" },
};

/** Priority order (most urgent first): which relation the compact card chip
    surfaces when an issue has several, and the section grouping order. */
export const RELATION_PRIORITY: IssueRelationType[] = [
  "blocked_by",
  "blocks",
  "related",
];

const RELATION_PRIORITY_RANK = new Map(
  RELATION_PRIORITY.map((relation, index) => [relation, index])
);

function sortResolvedRelations(relations: ResolvedRelation[]) {
  return relations.sort((a, b) => {
    if (a.resolved !== b.resolved) return a.resolved ? 1 : -1;
    return (
      (RELATION_PRIORITY_RANK.get(a.relation) ?? 0) -
      (RELATION_PRIORITY_RANK.get(b.relation) ?? 0)
    );
  });
}

/** The three relation types a user can pick when adding, in menu order.
    Same list as RELATION_TYPE_VALUES (lib/relation-validation.ts), typed mutable
    for the menus that map over it. */
export const RELATION_TYPES: IssueRelationType[] = [...RELATION_TYPE_VALUES];

/** Objective statuses that close an objective, mapped through the issue status
 *  each objective state borrows for its indicator (done→done, canceled→canceled).
 *  Used by isClosedId so a blocking relation can also be resolved by a closed
 *  OBJECTIVE blocker (MIN-513). */
function isClosedObjectiveStatus(status: ObjectiveStatus): boolean {
  return status === "done" || status === "canceled";
}

/** One relation endpoint, as callers pass it: an id plus (optionally) what it
 *  is — a bare id reads as an issue (pre-migration rows' implicit kind). */
export interface RelationEndpoint {
  id: string;
  type?: RelationEndpointType | null;
}

/**
 * Resolve every relation touching `entityId` from that entity's perspective:
 * an outgoing `blocks` edge reads as `blocks`, an incoming one as `blocked_by`,
 * and a `related` edge (either stored direction) as `related`. Works for an
 * objective id too (MIN-513): the id comparison is kind-agnostic, and the
 * other end's kind is surfaced in `otherType`.
 *
 * When `statusById` is supplied, a blocking relation is flagged `resolved` once
 * its blocker is closed — the blocker is `entityId` itself for `blocks`, and
 * the other end for `blocked_by`. An objective blocker counts as closed through
 * `objectiveStatusById` (done/canceled). Resolved relations sort last (after
 * the RELATION_PRIORITY order) so the compact card surfaces an active blockage
 * over a spent one.
 */
export function resolveRelations(
  entityId: string,
  rows: IssueRelation[],
  statusById?: Map<string, IssueStatus>,
  objectiveStatusById?: Map<string, ObjectiveStatus>
): ResolvedRelation[] {
  const isClosedId = (id: string): boolean => {
    const status = statusById?.get(id);
    if (status !== undefined) return isClosedStatus(status);
    const objectiveStatus = objectiveStatusById?.get(id);
    return objectiveStatus !== undefined && isClosedObjectiveStatus(objectiveStatus);
  };
  const selfClosed = isClosedId(entityId);

  const out: ResolvedRelation[] = [];
  for (const r of rows) {
    if (r.type === "blocks") {
      if (r.source_id === entityId)
        out.push({
          id: r.id,
          relation: "blocks",
          otherId: r.target_id,
          otherType: endpointType(r.target_type),
          resolved: selfClosed,
        });
      else if (r.target_id === entityId)
        out.push({
          id: r.id,
          relation: "blocked_by",
          otherId: r.source_id,
          otherType: endpointType(r.source_type),
          resolved: isClosedId(r.source_id),
        });
    } else {
      if (r.source_id === entityId)
        out.push({
          id: r.id,
          relation: "related",
          otherId: r.target_id,
          otherType: endpointType(r.target_type),
          resolved: false,
        });
      else if (r.target_id === entityId)
        out.push({
          id: r.id,
          relation: "related",
          otherId: r.source_id,
          otherType: endpointType(r.source_type),
          resolved: false,
        });
    }
  }
  return sortResolvedRelations(out);
}

/**
 * Resolve all relation endpoints in one pass for list views such as a board.
 * Calling `resolveRelations` once per card would scan the complete relation
 * collection for every card, turning each realtime update into O(cards × rows).
 * Objective-ended relations surface on the ISSUE end only (an objective has no
 * card); the pairing of two objectives produces no entry.
 */
export function resolveRelationsByIssue(
  rows: IssueRelation[],
  statusById?: Map<string, IssueStatus>,
  objectiveStatusById?: Map<string, ObjectiveStatus>
): Map<string, ResolvedRelation[]> {
  const byIssue = new Map<string, ResolvedRelation[]>();
  const append = (issueId: string, relation: ResolvedRelation) => {
    const list = byIssue.get(issueId);
    if (list) list.push(relation);
    else byIssue.set(issueId, [relation]);
  };
  const isClosedId = (id: string) => {
    const status = statusById?.get(id);
    if (status !== undefined) return isClosedStatus(status);
    const objectiveStatus = objectiveStatusById?.get(id);
    return (
      objectiveStatus !== undefined && isClosedObjectiveStatus(objectiveStatus)
    );
  };

  for (const row of rows) {
    const sourceIsIssue = endpointType(row.source_type) === "issue";
    const targetIsIssue = endpointType(row.target_type) === "issue";
    if (!sourceIsIssue && !targetIsIssue) continue;

    if (row.type === "blocks") {
      const resolved = isClosedId(row.source_id);
      if (sourceIsIssue) {
        append(row.source_id, {
          id: row.id,
          relation: "blocks",
          otherId: row.target_id,
          otherType: endpointType(row.target_type),
          resolved,
        });
      }
      if (row.target_id !== row.source_id && targetIsIssue) {
        append(row.target_id, {
          id: row.id,
          relation: "blocked_by",
          otherId: row.source_id,
          otherType: endpointType(row.source_type),
          resolved,
        });
      }
      continue;
    }

    if (sourceIsIssue) {
      append(row.source_id, {
        id: row.id,
        relation: "related",
        otherId: row.target_id,
        otherType: endpointType(row.target_type),
        resolved: false,
      });
    }
    if (row.target_id !== row.source_id && targetIsIssue) {
      append(row.target_id, {
        id: row.id,
        relation: "related",
        otherId: row.source_id,
        otherType: endpointType(row.source_type),
        resolved: false,
      });
    }
  }

  for (const relations of byIssue.values()) sortResolvedRelations(relations);
  return byIssue;
}

/** A hydrated dependency, optionally inherited from objective membership. */
export interface DisplayRelation extends ResolvedRelation {
  otherNumber?: number;
  otherName?: string;
  inheritedObjectiveId?: string;
  inheritedObjectiveName?: string;
}

/** Resolve board and panel dependencies against the complete visible project data.
 * Inherited rows point to the actual blocker; they never represent a new DB edge.
 */
export function resolveDisplayRelationsByIssue(
  rows: IssueRelation[],
  issueById: Map<string, Issue>,
  objectiveById: Map<string, Objective>,
): Map<string, DisplayRelation[]> {
  const statuses = new Map(Array.from(issueById.values(), (i) => [i.id, i.status] as const));
  const objectiveStatuses = new Map(Array.from(objectiveById.values(), (o) => [o.id, o.status] as const));
  const direct = resolveRelationsByIssue(rows, statuses, objectiveStatuses);
  const result = new Map<string, DisplayRelation[]>();
  const hydrate = (r: ResolvedRelation): DisplayRelation | null => {
    const other = r.otherType === "objective" ? objectiveById.get(r.otherId) : issueById.get(r.otherId);
    if (!other) return null;
    return "number" in other
      ? { ...r, otherNumber: other.number, otherName: other.title }
      : { ...r, otherName: other.name };
  };
  const members = new Map<string, Issue[]>();
  for (const issue of issueById.values()) {
    const hydrated = (direct.get(issue.id) ?? []).map(hydrate).filter((r): r is DisplayRelation => r !== null);
    if (hydrated.length) result.set(issue.id, hydrated);
    if (!issue.objective_id || isClosedStatus(issue.status)) continue;
    const objective = objectiveById.get(issue.objective_id);
    if (!objective || isClosedObjectiveStatus(objective.status)) continue;
    const list = members.get(objective.id);
    if (list) list.push(issue);
    else members.set(objective.id, [issue]);
  }
  for (const row of rows) {
    if (row.type !== "blocks" || endpointType(row.target_type) !== "objective") continue;
    const objective = objectiveById.get(row.target_id);
    if (!objective) continue;
    const blocker = hydrate({ id: row.id, relation: "blocked_by", otherId: row.source_id,
      otherType: endpointType(row.source_type), resolved: false });
    if (!blocker) continue;
    const closed = blocker.otherType === "objective"
      ? isClosedObjectiveStatus(objectiveById.get(blocker.otherId)!.status)
      : isClosedStatus(issueById.get(blocker.otherId)!.status);
    if (closed) continue;
    for (const issue of members.get(objective.id) ?? []) {
      if (issue.id === blocker.otherId) continue;
      const list = result.get(issue.id) ?? [];
      if (list.some((r) => r.relation === "blocked_by" && r.otherId === blocker.otherId)) continue;
      list.push({ ...blocker, inheritedObjectiveId: objective.id, inheritedObjectiveName: objective.name });
      result.set(issue.id, list);
    }
  }
  for (const list of result.values()) sortResolvedRelations(list);
  return result;
}

/**
 * Fold a relation added from `source`'s perspective into its stored form:
 * `blocked_by` becomes an inverted `blocks` edge; a symmetric `related` pair is
 * canonicalized least-id-first (JS `<` on canonical lowercase UUIDs matches
 * Postgres's uuid ordering, mirroring the DB trigger) so a duplicate lookup
 * hits the same row from either direction. Kinds travel with their ids when
 * the canonical form swaps the pair (MIN-513).
 */
export function normalizeRelation(
  source: string | RelationEndpoint,
  type: IssueRelationType,
  target: string | RelationEndpoint
): {
  source_id: string;
  source_type: RelationEndpointType;
  target_id: string;
  target_type: RelationEndpointType;
  type: "blocks" | "related";
} {
  const sourceId = typeof source === "string" ? source : source.id;
  const sourceKind = endpointType(typeof source === "string" ? null : source.type);
  const targetId = typeof target === "string" ? target : target.id;
  const targetKind = endpointType(typeof target === "string" ? null : target.type);

  if (type === "blocked_by")
    return {
      source_id: targetId,
      source_type: targetKind,
      target_id: sourceId,
      target_type: sourceKind,
      type: "blocks",
    };
  if (type === "related" && sourceId > targetId)
    return {
      source_id: targetId,
      source_type: targetKind,
      target_id: sourceId,
      target_type: sourceKind,
      type: "related",
    };
  return {
    source_id: sourceId,
    source_type: sourceKind,
    target_id: targetId,
    target_type: targetKind,
    type: type === "related" ? "related" : "blocks",
  };
}

export { isRelationType, RELATION_TYPE_VALUES, endpointType } from "./relation-validation";
