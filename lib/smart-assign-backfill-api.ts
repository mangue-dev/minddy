"use client";

import { fetchClientRead } from "./client-read";
import { apiErrorCode, HttpResponseError } from "./backend-availability";

/** What the owner's settings show about the backlog (MIN-903): how many open
 * issues Smart Assign could assign, and whether it is assigning them now. */
export interface SmartAssignBackfill {
  count: number;
  running: boolean;
  /** A member has no assignment rule yet: the backfill cannot start. */
  rulesMissing: boolean;
}

export const smartAssignBackfillKey = (projectId: string) =>
  ["smart-assign-backfill", projectId] as const;

async function parse(response: Response): Promise<SmartAssignBackfill> {
  const data = (await response.json().catch(() => null)) as
    | { count?: number; running?: boolean; rules_missing?: boolean; error?: string }
    | null;
  if (!response.ok) {
    throw new HttpResponseError(
      data?.error || "Request failed",
      response.status,
      apiErrorCode(data)
    );
  }
  return {
    count: Number(data?.count ?? 0),
    running: data?.running === true,
    rulesMissing: data?.rules_missing === true,
  };
}

const path = (projectId: string) => `/api/projects/${projectId}/smart-assign/backfill`;

export async function fetchSmartAssignBackfillApi(
  projectId: string,
  signal?: AbortSignal
): Promise<SmartAssignBackfill> {
  return parse(await fetchClientRead(path(projectId), { signal }));
}

export async function startSmartAssignBackfillApi(
  projectId: string
): Promise<SmartAssignBackfill> {
  return parse(await fetch(path(projectId), { method: "POST" }));
}
