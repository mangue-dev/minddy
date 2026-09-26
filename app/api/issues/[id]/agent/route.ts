import { issueStore } from "@/lib/server/issue-store";
import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { pickIssuePullRequests, type IssuePrRow } from "@/lib/server/agent/activity";
import {
  canReadConversationRecord,
  isSharedRun,
  type ConversationAccessRecord,
  type RunAnchors,
} from "@/lib/server/agent/run-access";
import { agentRunCanResume } from "@/lib/agent-run-resumability";
import { decodeAgentLaunch, legacyAgentLaunchSchema } from "@/lib/server/agent/run-launch-content";
import { decodeAgentBaseBranch } from "@/lib/server/agent/run-base-branch-content";

/** The `RUN_COLUMNS` columns this file needs to slice. */
type RunRow = RunAnchors & {
  id: string;
  project_id: string;
  base_branch: string | null;
  created_by: string | null;
  conversation: Pick<ConversationAccessRecord, "owner_id" | "visibility"> | null;
} & Record<string, unknown>;

/**
 * Code Agent Runs from an issue (MIN-46).
 * GET → lists the runs of the issue VISIBLE BY THE CALLER + his pull request.
 * POST is a tombstone: new work enters through Numo, while GET keeps historical
 * worker records accessible.
 */

type RouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

// `created_by`, `chain_id`, `routine_id`, and `parent_numo_turn_id` are read only
// to decide visibility. The service-key query needs them before it can return a
// safe public response.
const RUN_COLUMNS =
  "id, project_id, conversation_id, parent_numo_turn_id, status, model, model_forced, reasoning_level, key_mode, triggered_by, prompt, prompt_mentions, pull_request_id, created_by, chain_id, routine_id, base_branch, branch_name, pr_number, pr_url, pr_state, continuations, cost_usd, outcome, error_message, created_at, updated_at, completed_at, awaiting_input, local_exec, local_worktree, conversation:agent_conversations(owner_id, visibility)";

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  // RLS: the caller must be able to see the issue.
  const { data: issue } = await issueStore(auth.supabase).select("id").eq("id", id).maybeSingle();
  if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });

  const service = getServiceClient();
  // The PR of the ticket travels with the runs: the side panel reads it here, not
  // more about `agent_runs` (MIN-163). A ticket can carry a PR without any
  // run has opened it — human PR attached by convention, or attached to
  // the hand from the PR header — and the panel then shut it up.
  const readRuns = (columns: string) => service
      .from("agent_runs")
      .select(columns)
      .eq("issue_id", id)
      .order("created_at", { ascending: false });
  const [initialRuns, { data: prs }] = await Promise.all([
    readRuns(`${RUN_COLUMNS}, encrypted_launch_content, launch_encryption_version`),
    service
      .from("pull_requests")
      .select("id, issue_id, number, state, updated_at")
      .eq("issue_id", id)
      .order("updated_at", { ascending: false }),
  ]);
  const runsResult = legacyAgentLaunchSchema(initialRuns.error)
    ? await readRuns(RUN_COLUMNS) : initialRuns;
  if (runsResult.error) return NextResponse.json({ error: "Unable to read agent runs" }, { status: 500 });
  const data = runsResult.data;
  const pullRequest =
    pickIssuePullRequests((prs ?? []) as IssuePrRow[])[id] ?? null;
  // The issue is public, but its conversations are not (MIN-332): the panel
  // shows only the caller's runs plus shared project-triggered runs. This
  // service-key read applies the same rule as `agent_runs_select`, and omits
  // Numo-owned workers because their parent conversation is their sole surface.
  const visibleRuns = ((data ?? []) as unknown as RunRow[]).filter((run) =>
    run.parent_numo_turn_id == null && (run.conversation
      ? canReadConversationRecord(auth.user.id, run.conversation)
      : isSharedRun(run) || run.created_by === auth.user.id),
  );
  // Checkpoints can reach several megabytes and must never enter a list payload.
  // Fetch only the ids of failed rows that retained one; other statuses are
  // resumable without consulting checkpoint state.
  const failedIds = visibleRuns
    .filter((run) => run.status === "failed")
    .map((run) => String(run.id));
  const checkpointLookup =
    failedIds.length > 0
      ? await service
          .from("agent_runs")
          .select("id")
          .in("id", failedIds)
          .or("checkpoint.not.is.null,checkpoint_ciphertext.not.is.null")
      : { data: [], error: null };
  const { data: checkpointRows } = checkpointLookup.error?.code === "42703" &&
      process.env.MINDDY_AGENT_CHECKPOINT_ENCRYPTION_ENABLED !== "true"
    ? await service.from("agent_runs").select("id").in("id", failedIds)
        .not("checkpoint", "is", null)
    : checkpointLookup;
  const failedWithCheckpoint = new Set(
    ((checkpointRows ?? []) as Array<{ id: string }>).map((run) => run.id),
  );
  const decodedRuns = await Promise.all(visibleRuns.map(async (run) =>
    decodeAgentBaseBranch(await decodeAgentLaunch(
      run as RunRow & Parameters<typeof decodeAgentLaunch>[0], auth.user.id), auth.user.id)));
  const runs = decodedRuns.map(
    ({
      created_by: _c,
      chain_id: _ch,
      routine_id: _r,
      parent_numo_turn_id: _parent,
      conversation: _v,
      checkpoint: _checkpoint,
      ...rest
    }) => ({
      ...rest,
      resumable: agentRunCanResume({
        status: String(rest.status),
        checkpoint: failedWithCheckpoint.has(String(rest.id)) ? true : null,
        local_exec: rest.local_exec === true,
      }),
    }),
  );
  return NextResponse.json({ runs, pullRequest });
}

/** Retired launch endpoint kept as an explicit tombstone for stale clients. */
export async function POST() {
  return NextResponse.json(
    { error: "numoRequired", code: "numoRequired" },
    { status: 410 },
  );
}
