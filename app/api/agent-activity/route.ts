import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import {
  buildAgentActivity,
  type AgentRunRow,
  type IssuePrRow,
} from "@/lib/server/agent/activity";

/**
 * Agent status by outcome, ALL accessible projects combined (global board
 * “All tickets”, MIN-29/MIN-46). Same contract as the endpoint per project
 * (working / session / PR per issue, see buildAgentActivity) but without a filter
 * project — RLS agent_runs = can_access_project terminates the caller.
 */

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  // All runs except `failed`: `buildAgentActivity` derives ACTIVE runs
  // (“Open agent” card). PR comes from its own table since
  // MIN-163 — a ticket can carry one without any run having opened it.
  // RLS `pull_requests` = an accessible project links this repository.
  const [{ data }, { data: prs }] = await Promise.all([
    auth.supabase
      .from("agent_runs")
      .select("issue_id, status, id, pr_number, pr_state, created_at")
      .neq("status", "failed")
      .order("created_at", { ascending: false }),
    auth.supabase
      .from("pull_requests")
      .select("id, issue_id, number, state, updated_at")
      .not("issue_id", "is", null)
      .order("updated_at", { ascending: false }),
  ]);

  const rows = (data ?? []) as AgentRunRow[];
  return NextResponse.json(buildAgentActivity(rows, (prs ?? []) as IssuePrRow[]));
}
