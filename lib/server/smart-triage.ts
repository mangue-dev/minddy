import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getProjectAccess } from "@/lib/server/project-access";
import { ensureUsageBudget } from "@/lib/server/usage";
import { buildSmartTriageSpec } from "@/lib/server/decisions/prepare";
import { runDecision } from "@/lib/server/decisions/runner";
import { isClosedStatus, STATUSES, type IssueEffort, type IssuePriority, type IssueStatus } from "@/lib/issue-constants";
import type { ObjectiveStatus } from "@/lib/objective-constants";
import { cycleBlockingRelations } from "@/lib/cycle";
import {
  jevTriageOrder,
  MAX_TRIAGE_TICKETS_PER_DECISION,
  parseSmartTriageMode,
  triageAgeDays,
  triageIssueComparator,
  type SmartTriageMove,
  type SmartTriageMode,
  type TriageIssue,
} from "@/lib/smart-triage";
import type { IssueRelation } from "@/lib/types";

/**
 * Smart Triage orchestration (MIN-566) — the server half of the board's
 * "Smart triage" button. ONE call reorders ONE project's open columns:
 *
 *   rules mode → the static rules (`triageIssueComparator`), pure and free;
 *   jev mode   → ONE decision per column (`buildSmartTriageSpec` through the
 *                runner, billed to the ACTOR in Automations), score-ordered,
 *                with the rules order as the degradation when both engines
 *                fail — a decision never blocks the user.
 *
 * Everything here is a gesture, never a background pass: the button triggers
 * it, the positions are rewritten, and the manual drag order stays editable.
 * Mode `off` is a loud no-op — no fetch beyond the project row, no write.
 *
 * Closed columns are never reordered: triaging a graveyard is churn, not
 * signal. Only backlog / todo / in_progress / in_review move.
 */

/** How a column's status reads to the scoring engines — the same meaning the
    board's column headers carry, in the engines' English. */
const COLUMN_MEANINGS: Record<IssueStatus, string> = {
  triage: "arrival zone, candidates to be sorted",
  backlog: "later, not scheduled yet",
  todo: "next work, in order",
  in_progress: "work in flight",
  in_review: "waiting for review",
  done: "finished",
  canceled: "abandoned",
  duplicate: "closed as a duplicate",
};

/** The open statuses a triage may reorder — the board's columns minus the
    closed ones. */
export const TRIAGE_STATUSES: IssueStatus[] = STATUSES.map((s) => s.value).filter(
  (status) => !isClosedStatus(status)
);

/** A lean ticket — the fields the rules and the scoring read. */
interface TriageIssueRow extends TriageIssue {
  title: string;
  status: IssueStatus;
  category_ids: string[];
}

export type SmartTriageResult =
  | { ok: false; status: 404; errorKey: "projectNotFound" }
  | {
      ok: true;
      mode: SmartTriageMode;
      moves: SmartTriageMove[];
      /** How many columns actually carried an order to decide (≥ 2 tickets). */
      columns: number;
      /** Whether at least one column was ranked by a decision engine (jev
          mode) rather than by the rules. Feedback + metrics only. */
      scored: boolean;
    };

/**
 * Reorder the open columns of one project, according to its
 * `smart_triage_mode`. Throws a `PlanLimitError` in jev mode when the ACTOR's
 * budget is dry (the route maps it) — arming Jev then triaging with an empty
 * budget must say so, not silently fall back to the rules.
 */
export async function runSmartTriage({
  projectId,
  actorId,
  statuses,
}: {
  projectId: string;
  /** Who clicked — the payer of the Jev pass in jev mode. */
  actorId: string;
  /** Columns to reorder (open ones). Default: every open column. */
  statuses?: unknown;
}): Promise<SmartTriageResult> {
  const service = getServiceClient();
  const access = await getProjectAccess(actorId, projectId);
  if (!access) return { ok: false, status: 404, errorKey: "projectNotFound" };

  const { data: project } = await service
    .from("projects")
    .select("id, name, smart_triage_mode")
    .eq("id", projectId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!project) return { ok: false, status: 404, errorKey: "projectNotFound" };
  const mode = parseSmartTriageMode(project.smart_triage_mode) ?? "off";
  // Off means off: not "degrade to rules". The project decided.
  if (mode === "off") return { ok: true, mode, moves: [], columns: 0, scored: false };

  const requested = Array.isArray(statuses)
    ? (statuses.filter(
        (s): s is IssueStatus =>
          typeof s === "string" && (TRIAGE_STATUSES as string[]).includes(s)
      ) as IssueStatus[])
    : TRIAGE_STATUSES;
  if (requested.length === 0) return { ok: true, mode, moves: [], columns: 0, scored: false };

  if (mode === "jev") await ensureUsageBudget(actorId, "automations");

  const [issueRows, relationRows, objectiveRows, categoryRows] = await Promise.all([
    service
      .from("issues")
      .select(
        "id, title, status, priority, effort, due_date, created_at, position, objective_id, issue_categories(category_id)"
      )
      .is("deleted_at", null)
      .eq("project_id", projectId)
      .in("status", requested),
    service
      .from("issue_relations")
      .select("id, source_id, source_type, target_id, target_type, type")
      .eq("project_id", projectId),
    service
      .from("objectives")
      .select("id, name, status")
      .is("deleted_at", null)
      .eq("project_id", projectId),
    service
      .from("categories")
      .select("id, name")
      .is("deleted_at", null)
      .eq("project_id", projectId),
  ]);
  if (issueRows.error) {
    console.error("[smart-triage] issues fetch failed:", issueRows.error.message);
    throw new Error(issueRows.error.message);
  }

  const issues = (issueRows.data ?? []).map(
    (row): TriageIssueRow => ({
      id: row.id as string,
      title: row.title as string,
      status: row.status as IssueStatus,
      priority: row.priority as IssuePriority,
      effort: (row.effort ?? null) as IssueEffort | null,
      due_date: (row.due_date ?? null) as string | null,
      created_at: row.created_at as string,
      position: row.position as number,
      objective_id: (row.objective_id ?? null) as string | null,
      category_ids: ((row.issue_categories ?? []) as Array<{ category_id: string }>).map(
        (c) => c.category_id
      ),
    })
  );

  const statusById = new Map<string, IssueStatus>(
    issues.map((issue) => [issue.id, issue.status])
  );
  // The other ends of the blocks edges may sit outside the reordered columns
  // (a blocker still in backlog): their open/closed state decides whether the
  // edge is ACTIVE, so their statuses are read too.
  const storedRelations = (relationRows.data ?? []) as unknown as IssueRelation[];
  const columnIds = new Set(issues.map((issue) => issue.id));
  const outsideIds = new Set<string>();
  for (const r of storedRelations) {
    if (r.type !== "blocks") continue;
    if (!columnIds.has(r.source_id)) outsideIds.add(r.source_id);
    if (!columnIds.has(r.target_id)) outsideIds.add(r.target_id);
  }
  if (outsideIds.size > 0) {
    const { data: statusRows } = await service
      .from("issues")
      .select("id, status")
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
  const { relations } = cycleBlockingRelations(
    storedRelations,
    issuesByObjective,
    objectiveStatusById
  );

  const objectiveNameById = new Map<string, string>(
    ((objectiveRows.data ?? []) as Array<{ id: string; name: string }>).map(
      (o) => [o.id, o.name]
    )
  );
  const categoryNameById = new Map<string, string>(
    ((categoryRows.data ?? []) as Array<{ id: string; name: string }>).map(
      (c) => [c.id, c.name]
    )
  );

  const now = Date.now();
  const moves: SmartTriageMove[] = [];
  let columns = 0;
  let scored = false;

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
    const rulesOrder = [...column].sort(triageIssueComparator(ctx));

    let ordered: TriageIssueRow[];
    if (mode === "jev") {
      const decision = await scoreColumn({
        projectId,
        projectName: project.name as string,
        status,
        tickets: rulesOrder,
        relations,
        statusById,
        objectiveNameById,
        categoryNameById,
        actorId,
        now,
      });
      if (decision) {
        scored = true;
        // The cap head is score-ordered; past the cap the rules order stands.
        // `jevTriageOrder` copies its input, so the head rows keep their
        // `category_ids`/`title` for the writes below.
        const orderedHead = jevTriageOrder(decision.head, decision.scores);
        ordered = [...orderedHead, ...rulesOrder.slice(decision.head.length)] as TriageIssueRow[];
      } else {
        // Both engines failed: the rules order IS the degradation. The column
        // still gets reordered — the user asked for a triage, not an error.
        ordered = rulesOrder;
      }
    } else {
      ordered = rulesOrder;
    }

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

  if (moves.length > 0) {
    const writes = await Promise.all(
      moves.map((move) =>
        service.from("issues").update({ position: move.position }).eq("id", move.id)
      )
    );
    const failure = writes.find(({ error }) => error);
    if (failure?.error) {
      console.error("[smart-triage] position write failed:", failure.error.message);
      throw new Error(failure.error.message);
    }
  }

  return { ok: true, mode, moves, columns, scored };
}

/** The per-ticket open-blocks counts the state paints, from the folded edges. */
function blockCounts(
  issueId: string,
  relations: IssueRelation[],
  statusById: Map<string, IssueStatus>
): { blocksOpen: number; blockedByOpen: number } {
  let blocksOpen = 0;
  let blockedByOpen = 0;
  for (const r of relations) {
    if (r.type !== "blocks") continue;
    const sourceOpen = (() => {
      const s = statusById.get(r.source_id);
      return s === undefined ? true : !isClosedStatus(s);
    })();
    const targetOpen = (() => {
      const s = statusById.get(r.target_id);
      return s === undefined ? true : !isClosedStatus(s);
    })();
    if (sourceOpen && r.target_id === issueId) blockedByOpen++;
    if (targetOpen && r.source_id === issueId) blocksOpen++;
  }
  return { blocksOpen, blockedByOpen };
}

/**
 * One scoring decision for one column. Returns the capped head (in rules
 * order — the input order) and the per-ticket scores whichever engine
 * produced; `null` when both engines failed (the caller keeps the rules
 * order). The head comes back in rules order: `jevTriageOrder` re-sorts it by
 * score, so the caller's slice semantics hold either way.
 */
async function scoreColumn(input: {
  projectId: string;
  projectName: string;
  status: IssueStatus;
  tickets: TriageIssueRow[];
  relations: IssueRelation[];
  statusById: Map<string, IssueStatus>;
  objectiveNameById: Map<string, string>;
  categoryNameById: Map<string, string>;
  actorId: string;
  now: number;
}): Promise<{ head: TriageIssueRow[]; scores: Map<string, number | null> } | null> {
  const head = input.tickets.slice(0, MAX_TRIAGE_TICKETS_PER_DECISION);
  // Empty state is refused by the spec validation — and there is nothing to
  // score with fewer than two tickets, which the caller never sends.
  if (head.length < 2) return null;
  const spec = buildSmartTriageSpec({
    projectName: input.projectName,
    column: { status: input.status, meaning: COLUMN_MEANINGS[input.status] },
    tickets: head.map((issue) => ({
      id: issue.id,
      title: issue.title,
      priority: issue.priority,
      effort: issue.effort,
      due: issue.due_date,
      ageDays: triageAgeDays(issue.created_at, input.now),
      objective: issue.objective_id
        ? input.objectiveNameById.get(issue.objective_id) ?? null
        : null,
      categories: issue.category_ids
        .map((id) => input.categoryNameById.get(id))
        .filter((name): name is string => Boolean(name))
        .join(", "),
      ...blockCounts(issue.id, input.relations, input.statusById),
    })),
  });
  const outcome = await runDecision(spec, {
    billTo: { userId: input.actorId },
    projectId: input.projectId,
  });
  if (!outcome) return null;
  const scores = new Map<string, number | null>();
  for (const ticket of head) {
    const answer = outcome.answers[ticket.id];
    scores.set(
      ticket.id,
      typeof answer?.value === "number" ? answer.value : null
    );
  }
  return { head, scores };
}
