import { Ban, OctagonX, Link2, type LucideIcon } from "lucide-react";
import type { IssueRelation, IssueRelationType, ResolvedRelation } from "./types";
import { RELATION_TYPE_VALUES } from "./relation-validation";
import { isClosedStatus, type IssueStatus } from "./issue-constants";

// Issue relations (MIN-25). Two edges are stored — `blocks` (directed) and
// `related` (symmetric) — but three are shown: an incoming `blocks` reads as
// `blocked_by`. Labels are i18n'd — resolve via useTranslations("Relations").

export interface RelationMeta {
  value: IssueRelationType;
  icon: LucideIcon;
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

/**
 * Resolve every relation touching `issueId` from that issue's perspective:
 * an outgoing `blocks` edge reads as `blocks`, an incoming one as `blocked_by`,
 * and a `related` edge (either stored direction) as `related`.
 *
 * When `statusById` is supplied, a blocking relation is flagged `resolved` once
 * its blocker is closed — the blocker is `issueId` itself for `blocks`, and the
 * other issue for `blocked_by`. Resolved relations sort last (after the
 * RELATION_PRIORITY order) so the compact card surfaces an active blockage over
 * a spent one.
 */
export function resolveRelations(
  issueId: string,
  rows: IssueRelation[],
  statusById?: Map<string, IssueStatus>
): ResolvedRelation[] {
  const isClosedId = (id: string): boolean => {
    const status = statusById?.get(id);
    return status !== undefined && isClosedStatus(status);
  };
  const selfClosed = isClosedId(issueId);

  const out: ResolvedRelation[] = [];
  for (const r of rows) {
    if (r.type === "blocks") {
      if (r.source_id === issueId)
        out.push({
          id: r.id,
          relation: "blocks",
          otherId: r.target_id,
          resolved: selfClosed,
        });
      else if (r.target_id === issueId)
        out.push({
          id: r.id,
          relation: "blocked_by",
          otherId: r.source_id,
          resolved: isClosedId(r.source_id),
        });
    } else {
      if (r.source_id === issueId)
        out.push({
          id: r.id,
          relation: "related",
          otherId: r.target_id,
          resolved: false,
        });
      else if (r.target_id === issueId)
        out.push({
          id: r.id,
          relation: "related",
          otherId: r.source_id,
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
 */
export function resolveRelationsByIssue(
  rows: IssueRelation[],
  statusById?: Map<string, IssueStatus>
): Map<string, ResolvedRelation[]> {
  const byIssue = new Map<string, ResolvedRelation[]>();
  const append = (issueId: string, relation: ResolvedRelation) => {
    const list = byIssue.get(issueId);
    if (list) list.push(relation);
    else byIssue.set(issueId, [relation]);
  };
  const isClosedId = (id: string) => {
    const status = statusById?.get(id);
    return status !== undefined && isClosedStatus(status);
  };

  for (const row of rows) {
    if (row.type === "blocks") {
      const resolved = isClosedId(row.source_id);
      append(row.source_id, {
        id: row.id,
        relation: "blocks",
        otherId: row.target_id,
        resolved,
      });
      if (row.target_id !== row.source_id) {
        append(row.target_id, {
          id: row.id,
          relation: "blocked_by",
          otherId: row.source_id,
          resolved,
        });
      }
      continue;
    }

    append(row.source_id, {
      id: row.id,
      relation: "related",
      otherId: row.target_id,
      resolved: false,
    });
    if (row.target_id !== row.source_id) {
      append(row.target_id, {
        id: row.id,
        relation: "related",
        otherId: row.source_id,
        resolved: false,
      });
    }
  }

  for (const relations of byIssue.values()) sortResolvedRelations(relations);
  return byIssue;
}

/**
 * Fold a relation added from `sourceId`'s perspective into its stored form:
 * `blocked_by` becomes an inverted `blocks` edge; a symmetric `related` pair is
 * canonicalized least-id-first (JS `<` on canonical lowercase UUIDs matches
 * Postgres's uuid ordering, mirroring the DB trigger) so a duplicate lookup
 * hits the same row from either direction.
 */
export function normalizeRelation(
  sourceId: string,
  type: IssueRelationType,
  targetId: string
): { source_id: string; target_id: string; type: "blocks" | "related" } {
  if (type === "blocked_by")
    return { source_id: targetId, target_id: sourceId, type: "blocks" };
  if (type === "related") {
    const [a, b] =
      sourceId < targetId ? [sourceId, targetId] : [targetId, sourceId];
    return { source_id: a, target_id: b, type: "related" };
  }
  return { source_id: sourceId, target_id: targetId, type: "blocks" };
}

export { isRelationType, RELATION_TYPE_VALUES } from "./relation-validation";
