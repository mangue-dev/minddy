import { issueStore } from "@/lib/server/issue-store";
import { objectiveStore } from "@/lib/server/objective-store";
import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getProjectAccess } from "@/lib/server/project-access";
import { isClosedStatus, STATUSES, type IssueEffort, type IssuePriority, type IssueStatus } from "@/lib/issue-constants";
import type { ObjectiveStatus } from "@/lib/objective-constants";
import { cycleBlockingRelations } from "@/lib/cycle";
import {
  DEFAULT_SMART_TRIAGE_MODE,
  triageIssueComparator,
  type SmartTriageMove,
  type SmartTriageMode,
  type TriageIssue,
} from "@/lib/smart-triage";
import type { IssueRelation } from "@/lib/types";

/** The open statuses a triage may reorder — the board's columns minus the
    closed ones. */
export const TRIAGE_STATUSES: IssueStatus[] = STATUSES.map((s) => s.value).filter(
  (status) => !isClosedStatus(status)
);

/** A lean ticket — the metadata required by the rules. */
interface TriageIssueRow extends TriageIssue {
  status: IssueStatus;
}

export type SmartTriageResult =
  | { ok: false; status: 404; errorKey: "projectNotFound" }
  | {
      ok: true;
      mode: SmartTriageMode;
      moves: SmartTriageMove[];
      /** How many columns actually carried an order to decide (≥ 2 tickets). */
      columns: number;
      scored: false;
      scores: null;
    };

/** Reorder open columns using free rules, regardless of any legacy project mode. */
export async function runSmartTriage({
  projectId,
  actorId,
  statuses,
  persist = true,
}: {
  projectId: string;
  /** The caller whose project access is checked. */
  actorId: string;
  /** Columns to reorder (open ones). Default: every open column. */
  statuses?: unknown;
  /** Write the computed order into the positions. Default: write. */
  persist?: boolean;
}): Promise<SmartTriageResult> {
  const service = getServiceClient();
  const access = await getProjectAccess(actorId, projectId);
  if (!access) return { ok: false, status: 404, errorKey: "projectNotFound" };

  const { data: project } = await service
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!project) return { ok: false, status: 404, errorKey: "projectNotFound" };
  const mode = DEFAULT_SMART_TRIAGE_MODE;

  const requested = Array.isArray(statuses)
    ? (statuses.filter(
        (s): s is IssueStatus =>
          typeof s === "string" && (TRIAGE_STATUSES as string[]).includes(s)
      ) as IssueStatus[])
    : TRIAGE_STATUSES;
  if (requested.length === 0)
    return { ok: true, mode, moves: [], columns: 0, scored: false, scores: null };

  const [issueRows, relationRows, objectiveRows] = await Promise.all([
    issueStore(service).select(
        "id, status, priority, effort, due_date, created_at, position, objective_id"
      )
      .is("deleted_at", null)
      .eq("project_id", projectId)
      .in("status", requested),
    service
      .from("issue_relations")
      .select("id, source_id, source_type, target_id, target_type, type")
      .eq("project_id", projectId),
    objectiveStore(service)
      .select("id, status")
      .is("deleted_at", null)
      .eq("project_id", projectId),
  ]);
  if (issueRows.error) {
    console.error("[smart-triage] issues fetch failed:", issueRows.error.message);
    throw new Error(issueRows.error.message);
  }
  if (objectiveRows.error) throw new Error("Unable to read smart-triage objective context");

  const issues = (issueRows.data ?? []).map(
    (row): TriageIssueRow => ({
      id: row.id as string,
      status: row.status as IssueStatus,
      priority: row.priority as IssuePriority,
      effort: (row.effort ?? null) as IssueEffort | null,
      due_date: (row.due_date ?? null) as string | null,
      created_at: row.created_at as string,
      position: row.position as number,
      objective_id: (row.objective_id ?? null) as string | null,
    })
  );

  const statusById = new Map<string, IssueStatus>(
    issues.map((issue) => [issue.id, issue.status])
  );
  // The other ends of the blocks edges may sit outside the reordered columns
  // (a blocker still in backlog): their open/closed state decides whether the
  // edge is ACTIVE, so their statuses are read too — LIVE rows only, relation
  // rows surviving a trash deletion must not drag live tickets around.
  const storedRelations = (relationRows.data ?? []) as unknown as IssueRelation[];
  const columnIds = new Set(issues.map((issue) => issue.id));
  const outsideIds = new Set<string>();
  for (const r of storedRelations) {
    if (r.type !== "blocks") continue;
    if (!columnIds.has(r.source_id)) outsideIds.add(r.source_id);
    if (!columnIds.has(r.target_id)) outsideIds.add(r.target_id);
  }
  if (outsideIds.size > 0) {
    const { data: statusRows } = await issueStore(service).select("id, status")
      .is("deleted_at", null)
      .in("id", [...outsideIds]);
    for (const row of (statusRows ?? []) as Array<{ id: string; status: IssueStatus }>) {
      statusById.set(row.id, row.status);
    }
  }

  // MIN-513: a "blocks" edge may end on an OBJECTIVE — fold it down onto the
  // objective's open tickets, exactly like the cycle view's reco does, so a
  // ticket blocked through its objective still sinks.
  const issuesByObjective = new Map<string, string[]>();
  for (const issue of issues) {
    if (!issue.objective_id) continue;
    const list = issuesByObjective.get(issue.objective_id);
    if (list) list.push(issue.id);
    else issuesByObjective.set(issue.objective_id, [issue.id]);
  }
  const objectiveStatusById = new Map<string, ObjectiveStatus>(
    ((objectiveRows.data ?? []) as Array<{ id: string; status: ObjectiveStatus }>).map(
      (o) => [o.id, o.status]
    )
  );
  const { relations: foldedRelations, objectiveStatuses } = cycleBlockingRelations(
    storedRelations,
    issuesByObjective,
    objectiveStatusById
  );
  // Objective liveness joins the map: an objective-source edge resolves
  // against the objective's OWN status (a done objective no longer blocks,
  // like a done issue), not against a missing entry read as "open".
  for (const [id, status] of objectiveStatuses) statusById.set(id, status);
  // An edge whose end is unknown here is not a dependency: the end is
  // trashed (never fetched), foreign, or an objective that vanished — the
  // rules would rather ignore it than act on a guessed "open".
  const relations = foldedRelations.filter(
    (r) =>
      r.type !== "blocks" ||
      (statusById.has(r.source_id) && statusById.has(r.target_id))
  );

  const now = Date.now();
  const moves: SmartTriageMove[] = [];
  let columns = 0;

  for (const status of requested) {
    const column = issues
      .filter((issue) => issue.status === status)
      .sort((a, b) => a.position - b.position);
    // One ticket has no order to decide; an empty column neither.
    if (column.length < 2) continue;
    columns++;

    const ctx = {
      issues: column,
      relations,
      statusById,
      now,
    };
    const ordered = [...column].sort(triageIssueComparator(ctx));

    // Rewrite the positions INSIDE the column's current [min, max] range: the
    // order is what changes, not the column's place in the cross-project
    // interleaving of /all.
    const positions = column.map((issue) => issue.position);
    const min = Math.min(...positions);
    const max = Math.max(...positions);
    const count = ordered.length;
    const step = max > min ? (max - min) / (count - 1) : 1;
    for (let i = 0; i < count; i++) {
      const position = max > min ? min + step * i : min + i;
      if (ordered[i].position === position) continue;
      moves.push({ id: ordered[i].id, position });
    }
  }

  // Read-only calls preserve the manual positions; boards apply rules locally.
  if (persist && moves.length > 0) {
    // ONE atomic write: the batch commits together or not at all — a
    // half-reordered board would disagree with the client until the next
    // reconciliation. The RPC returns the rows actually updated; a silent
    // miss (a ticket trashed mid-flight) fails the request rather than
    // letting the visible and persisted orders drift.
    const { data: applied, error } = await service.rpc("apply_smart_triage_moves", {
      p_project_id: projectId,
      p_moves: moves,
    });
    if (error) {
      console.error("[smart-triage] position write failed:", error.message);
      throw new Error(error.message);
    }
    if (applied !== moves.length) {
      const message = `apply_smart_triage_moves wrote ${applied}/${moves.length} positions`;
      console.error("[smart-triage]", message);
      throw new Error(message);
    }
  }

  return {
    ok: true,
    mode,
    moves: persist ? moves : [],
    columns,
    scored: false,
    scores: null,
  };
}
