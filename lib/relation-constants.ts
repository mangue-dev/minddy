import { Ban, OctagonX, Link2, type LucideIcon } from "lucide-react";
import type { IssueRelation, IssueRelationType, ResolvedRelation } from "./types";
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

/** The three relation types a user can pick when adding, in menu order. */
export const RELATION_TYPES: IssueRelationType[] = [
  "blocks",
  "blocked_by",
  "related",
];

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
  return out.sort((a, b) => {
    if (a.resolved !== b.resolved) return a.resolved ? 1 : -1;
    return (
      RELATION_PRIORITY.indexOf(a.relation) -
      RELATION_PRIORITY.indexOf(b.relation)
    );
  });
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

export const isRelationType = (v: unknown): v is IssueRelationType =>
  v === "blocks" || v === "blocked_by" || v === "related";
