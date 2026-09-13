import { NextResponse, type NextRequest } from "next/server";
import { getLocale } from "next-intl/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { pickIssuePullRequests, type IssuePrRow } from "@/lib/server/agent/activity";
import type { AgentLaunchIntent } from "@/lib/server/agent/launch";
import { parseAgentMentions } from "@/lib/agent-mentions";
import {
  canReadConversationRecord,
  isSharedRun,
  type ConversationAccessRecord,
  type RunAnchors,
} from "@/lib/server/agent/run-access";
import { parseResourcesInput } from "@/lib/server/attachments";
import type { AttachmentInput } from "@/lib/types";
import { agentRunCanResume } from "@/lib/agent-run-resumability";
import {
  buildAgentLaunchMessage,
  isAgentLaunchMode,
} from "@/lib/server/agent/launch-message";
import {
  numoIntentErrorResponse,
  startNumoIntent,
} from "@/lib/server/numo/start-intent";

/** The `RUN_COLUMNS` columns this file needs to slice. */
type RunRow = RunAnchors & {
  created_by: string | null;
  conversation: Pick<ConversationAccessRecord, "owner_id" | "visibility"> | null;
} & Record<string, unknown>;

/**
 * Code Agent Runs from an issue (MIN-46).
 * GET → lists the runs of the issue VISIBLE BY THE CALLER + his pull request.
 * POST → compatibility adapter that creates a common Numo conversation for
 * the issue intent. Repository work can only start later through Numo's
 * internal delegation tool.
 */

type RouteContext = { params: Promise<{ id: string }> };

// The launch kick drains the first chunk in after(): you need the same
// window as the cron route (270s budget) otherwise the function is killed in full
// round and the run remains stuck in 'running'.
export const runtime = "nodejs";
export const maxDuration = 300;

// `created_by`, `chain_id`, `routine_id`, and `parent_numo_turn_id` are read only
// to decide visibility. The service-key query needs them before it can return a
// safe public response.
const RUN_COLUMNS =
  "id, conversation_id, parent_numo_turn_id, status, model, model_forced, reasoning_level, key_mode, triggered_by, prompt, prompt_mentions, pull_request_id, created_by, chain_id, routine_id, base_branch, branch_name, pr_number, pr_url, pr_state, continuations, cost_usd, outcome, error_message, created_at, updated_at, completed_at, awaiting_input, local_exec, local_worktree, conversation:agent_conversations(owner_id, visibility)";

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  // RLS: the caller must be able to see the issue.
  const { data: issue } = await auth.supabase.from("issues").select("id").eq("id", id).maybeSingle();
  if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });

  const service = getServiceClient();
  // The PR of the ticket travels with the runs: the side panel reads it here, not
  // more about `agent_runs` (MIN-163). A ticket can carry a PR without any
  // run has opened it — human PR attached by convention, or attached to
  // the hand from the PR header — and the panel then shut it up.
  const [{ data }, { data: prs }] = await Promise.all([
    service
      .from("agent_runs")
      .select(RUN_COLUMNS)
      .eq("issue_id", id)
      .order("created_at", { ascending: false }),
    service
      .from("pull_requests")
      .select("id, issue_id, number, state, updated_at")
      .eq("issue_id", id)
      .order("updated_at", { ascending: false }),
  ]);
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
  const { data: checkpointRows } =
    failedIds.length > 0
      ? await service
          .from("agent_runs")
          .select("id")
          .in("id", failedIds)
          .not("checkpoint", "is", null)
      : { data: [] };
  const failedWithCheckpoint = new Set(
    ((checkpointRows ?? []) as Array<{ id: string }>).map((run) => run.id),
  );
  const runs = visibleRuns.map(
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

// Length terminals (MIN-118): the setpoint is persisted as is in
// agent_runs; model and branch are short identifiers. Beyond that we truncate.
const MAX_PROMPT_LENGTH = 20_000;
const MAX_BRANCH_LENGTH = 255;

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const { data: issue } = await auth.supabase
    .from("issues")
    .select("id, project_id, number, title, plan, effort")
    .eq("id", id)
    .maybeSingle();
  if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  const { data: project } = await auth.supabase
    .from("projects")
    .select("id, key")
    .eq("id", issue.project_id)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: "Issue not found" }, { status: 404 });

  type LaunchBody = {
    prompt?: string;
    baseBranch?: string;
    intent?: AgentLaunchIntent;
    mentions?: unknown;
    attachments?: unknown;
    /** Legacy desktop-local fields are parsed only so stale clients receive
     * the explicit retirement response instead of silently running elsewhere. */
    localExec?: unknown;
    localWorktree?: unknown;
    /** Explicit acknowledgement shown only by the trusted local UI. */
    localIssueContextConfirmed?: unknown;
  };
  let body: LaunchBody = {};
  try {
    // `null` is valid JSON: assigning it would do a 500 on `body.model`
    // two lines below. Same guard as POST /api/agent-runs (MIN-118).
    const parsed: unknown = await request.json();
    if (parsed && typeof parsed === "object") body = parsed as LaunchBody;
  } catch {
    // empty body accepted
  }
  if ("model" in body || "reasoningLevel" in body || "forced" in body) {
    return NextResponse.json(
      {
        error: "workerConfigurationManagedInSettings",
        code: "workerConfigurationManagedInSettings",
      },
      { status: 400 },
    );
  }
  if (
    body.localExec === true ||
    body.localWorktree === true ||
    body.localIssueContextConfirmed === true
  ) {
    return NextResponse.json(
      { error: "localExecutionRetired", code: "localExecutionRetired" },
      { status: 410 },
    );
  }
  const prompt =
    typeof body.prompt === "string" && body.prompt.trim()
      ? body.prompt.trim().slice(0, MAX_PROMPT_LENGTH)
      : undefined;
  const baseBranch =
    typeof body.baseBranch === "string" && body.baseBranch.trim()
      ? body.baseBranch.trim().slice(0, MAX_BRANCH_LENGTH)
      : undefined;
  const resources = parseResourcesInput(body.attachments, `chat/${auth.user.id}/`, 5);
  if (resources === null) {
    return NextResponse.json({ error: "Invalid attachments" }, { status: 400 });
  }
  const attachments = resources.filter((resource): resource is AttachmentInput => resource.kind !== "link");
  const requestedIntent =
    body.intent === "plan" || body.intent === "verify" || body.intent === "custom"
      ? body.intent
      : "implement";
  const message = isAgentLaunchMode(requestedIntent)
    ? await buildAgentLaunchMessage({
        mode: requestedIntent,
        issue,
        projectKey: project.key,
        locale: await getLocale(),
        extra: [prompt, baseBranch ? `Requested base branch: ${baseBranch}` : null]
          .filter(Boolean)
          .join("\n\n"),
      })
    : prompt;
  if (!message) {
    return NextResponse.json(
      { error: "promptRequired", code: "promptRequired" },
      { status: 400 },
    );
  }
  try {
    const started = await startNumoIntent({
      supabase: auth.supabase,
      userId: auth.user.id,
      userMetadata: auth.user.user_metadata,
      projectId: project.id,
      prompt: message,
      locale: await getLocale(),
      source: "issue",
      action: requestedIntent,
      context: {
        projectId: project.id,
        issueId: issue.id,
        issueIdentifier: `${project.key}-${issue.number}`,
        issueTitle: issue.title,
      },
      mentions: parseAgentMentions(body.mentions),
      attachments,
    });
    return NextResponse.json({
      conversation: { id: started.conversationId },
      turn: { id: started.turnId },
      detail_href: started.detailHref,
    }, { status: 202 });
  } catch (error) {
    return numoIntentErrorResponse(error);
  }
}
