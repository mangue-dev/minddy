import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getProjectAccess } from "@/lib/server/project-access";
import { issueStore } from "@/lib/server/issue-store";
import { objectiveStore } from "@/lib/server/objective-store";
import { CLOSED_STATUSES } from "@/lib/server/issue-reads";
import {
  FORECAST_PROFILE_DAYS,
  objectiveForecast,
  type ForecastIssue,
} from "@/lib/objective-forecast";
import { objectiveMomentum } from "@/lib/objective-momentum";
import type { ObjectiveStatus } from "@/lib/objective-validation";

const DAY_MS = 86_400_000;
const PAGE = 1000;
/** Plain scheduling columns only: issue content is never read here. */
const COLUMNS = "id, project_id, objective_id, assignee_id, status, effort, completed_at";
const OPEN_STATUSES = "(triage,backlog,todo,in_progress,in_review)";

export interface ObjectiveForecastResponse {
  forecastDate: string | null;
  forecastDays: number | null;
  /** `contributors`: the people doing the work; `objective`: its own pace. */
  basis: "contributors" | "objective" | null;
}

type Row = ForecastIssue & { id: string; project_id: string };

async function readAll(build: (from: number, to: number) => PromiseLike<{
  data: Row[] | null; error: { message: string } | null;
}>): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error("Forecast issue read failed");
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

/**
 * Finish estimate of an objective (MIN-876), or null when the objective does
 * not exist or the user cannot read its project.
 *
 * Contributors' issues in other projects, including projects the viewer does
 * not belong to, are read with the service client because allocation needs
 * them. Only the aggregate date leaves this function: no other project, issue,
 * or per-person figure is returned.
 */
export async function getObjectiveForecast(
  userId: string,
  objectiveId: string,
  { timeZone, now = new Date() }: { timeZone: string; now?: Date },
): Promise<ObjectiveForecastResponse | null> {
  const service = getServiceClient();
  const { data: objective } = await objectiveStore(service)
    .select("id, project_id, status, created_at, target_date")
    .is("deleted_at", null)
    .eq("id", objectiveId)
    .maybeSingle();
  if (!objective) return null;
  if (!await getProjectAccess(userId, objective.project_id as string)) return null;

  const linked = await readAll((from, to) => issueStore(service).select(COLUMNS)
    .eq("objective_id", objectiveId).is("deleted_at", null).order("id").range(from, to));
  const assignees = [...new Set(linked.flatMap((issue) =>
    issue.assignee_id ? [issue.assignee_id] : []))];

  const since = new Date(now.getTime() - FORECAST_PROFILE_DAYS * DAY_MS).toISOString();
  const theirs = assignees.length === 0 ? [] : await readAll((from, to) =>
    issueStore(service).select(COLUMNS)
      .in("assignee_id", assignees).is("deleted_at", null)
      .or(`status.in.${OPEN_STATUSES},completed_at.gte.${since}`)
      .order("id").range(from, to));

  // Work in a trashed project is no longer anyone's allocation.
  const projectIds = [...new Set(theirs.map((issue) => issue.project_id))];
  const live = new Set<string>();
  for (let index = 0; index < projectIds.length; index += PAGE) {
    const { data, error } = await service.from("projects").select("id")
      .in("id", projectIds.slice(index, index + PAGE)).is("deleted_at", null);
    if (error) throw new Error("Forecast project read failed");
    for (const project of data ?? []) live.add(project.id as string);
  }
  const issues = new Map<string, Row>();
  for (const issue of theirs) if (live.has(issue.project_id)) issues.set(issue.id, issue);
  for (const issue of linked) issues.set(issue.id, issue);

  const status = objective.status as ObjectiveStatus;
  const open = linked.some((issue) => !CLOSED_STATUSES.includes(issue.status));
  if (status === "canceled" || !open) {
    return { forecastDate: null, forecastDays: null, basis: null };
  }

  const { finishAt } = objectiveForecast(objectiveId, [...issues.values()], now, timeZone);
  if (finishAt !== null) {
    return {
      forecastDate: new Date(finishAt).toISOString(),
      forecastDays: Math.max(1, Math.ceil((finishAt - now.getTime()) / DAY_MS)),
      basis: "contributors",
    };
  }

  const local = objectiveMomentum({
    id: objectiveId,
    status,
    created_at: objective.created_at as string,
    target_date: (objective.target_date as string | null) ?? null,
  }, linked, now, timeZone);
  return {
    forecastDate: local.forecastDate,
    forecastDays: local.forecastDays,
    basis: local.forecastDate ? "objective" : null,
  };
}
