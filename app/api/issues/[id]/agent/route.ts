import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { isReasoningLevel } from "@/lib/agent-reasoning";
import { pickIssuePullRequests, type IssuePrRow } from "@/lib/server/agent/activity";
import {
  launchAgentRun,
  type AgentLaunchIntent,
  type LaunchResult,
} from "@/lib/server/agent/launch";
import { parseAgentMentions } from "@/lib/agent-mentions";
import {
  canReadConversationRecord,
  isSharedRun,
  type ConversationAccessRecord,
  type RunAnchors,
} from "@/lib/server/agent/run-access";
import { parseResourcesInput } from "@/lib/server/attachments";
import { promptWithAttachments } from "@/lib/server/agent/prompt-attachments";
import type { AttachmentInput } from "@/lib/types";

/** The `RUN_COLUMNS` columns this file needs to slice. */
type RunRow = RunAnchors & {
  created_by: string | null;
  conversation: Pick<ConversationAccessRecord, "owner_id" | "visibility"> | null;
} & Record<string, unknown>;

/**
 * Code Agent Runs from an issue (MIN-46).
 * GET → lists the runs of the issue VISIBLE BY THE CALLER + his pull request.
 * POST → launches a run { prompt?, model? } (“Launch an agent” button).
 * Access to the issue is verified via the client cookie (RLS); `launchAgentRun`
 * then does the pre-checks (linked deposit, quota/BYOK, run already active).
 */

type RouteContext = { params: Promise<{ id: string }> };

// The launch kick drains the first chunk in after(): you need the same
// window as the cron route (270s budget) otherwise the function is killed in full
// round and the run remains stuck in 'running'.
export const runtime = "nodejs";
export const maxDuration = 300;

// `created_by`, `chain_id` and `routine_id` are not there to be displayed:
// these are the three columns on which the visibility rule (MIN-332) depends, and
// this reading is done using a service key — without them, we would not be able to sort.
const RUN_COLUMNS =
  "id, conversation_id, status, model, model_forced, reasoning_level, key_mode, triggered_by, prompt, prompt_mentions, pull_request_id, created_by, chain_id, routine_id, base_branch, branch_name, pr_number, pr_url, pr_state, continuations, cost_usd, outcome, error_message, created_at, updated_at, completed_at, awaiting_input, local_exec, local_worktree, conversation:agent_conversations(owner_id, visibility)";

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
  // The ticket is public, its conversations are not (MIN-332): the panel
  // only shows MY runs, plus those that the project triggered (automation,
  // routine) or which relate to RA. Sorting is here because reading is
  // in service key — the `agent_runs_select` policy, which it bypasses, says the
  // same thing. The three visibility columns appear immediately in the payload.
  const runs = ((data ?? []) as unknown as RunRow[])
    .filter(
      (run) =>
        run.conversation
          ? canReadConversationRecord(auth.user.id, run.conversation)
          : isSharedRun(run) || run.created_by === auth.user.id,
    )
    .map(({ created_by: _c, chain_id: _ch, routine_id: _r, conversation: _v, ...rest }) => rest);
  return NextResponse.json({ runs, pullRequest });
}

// Length terminals (MIN-118): the setpoint is persisted as is in
// agent_runs; model and branch are short identifiers. Beyond that we truncate.
const MAX_PROMPT_LENGTH = 20_000;
const MAX_MODEL_LENGTH = 200;
const MAX_BRANCH_LENGTH = 255;

const LAUNCH_ERROR_STATUS: Record<string, number> = {
  issueNotFound: 404,
  noRepo: 409,
  unsupportedProvider: 409,
  alreadyRunning: 409,
  quotaExceeded: 402,
  managedServiceUnavailable: 503,
  executionBackendUnavailable: 503,
  noModelForProvider: 400,
  localEndpointRequiresLocalRun: 409,
  modelAbovePlan: 403,
};

function launchErrorResponse(result: Extract<LaunchResult, { ok: false }>) {
  const status = LAUNCH_ERROR_STATUS[result.error] ?? 400;
  return NextResponse.json(
    {
      error: result.error,
      code: result.error,
      run: result.run,
      quota: result.quota,
      modelLimit: result.modelLimit,
    },
    { status },
  );
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const { data: issue } = await auth.supabase.from("issues").select("id").eq("id", id).maybeSingle();
  if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });

  type LaunchBody = {
    prompt?: string;
    model?: string;
    baseBranch?: string;
    reasoningLevel?: string;
    intent?: AgentLaunchIntent;
    mentions?: unknown;
    attachments?: unknown;
    /** The conversation starts on the user's MACHINE (MIN-359). A
     * request, which `localExecRequested` validates on the server side. */
    localExec?: unknown;
    localWorktree?: unknown;
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
  const model =
    typeof body.model === "string" && body.model.trim()
      ? body.model.trim().slice(0, MAX_MODEL_LENGTH)
      : undefined;
  const prompt =
    typeof body.prompt === "string" && body.prompt.trim()
      ? body.prompt.trim().slice(0, MAX_PROMPT_LENGTH)
      : undefined;
  const baseBranch =
    typeof body.baseBranch === "string" && body.baseBranch.trim()
      ? body.baseBranch.trim().slice(0, MAX_BRANCH_LENGTH)
      : undefined;
  // Unknown level ignored: the launch then falls back to the personal default.
  const reasoningLevel = isReasoningLevel(body.reasoningLevel) ? body.reasoningLevel : undefined;
  const resources = parseResourcesInput(body.attachments, `chat/${auth.user.id}/`, 5);
  if (resources === null) {
    return NextResponse.json({ error: "Invalid attachments" }, { status: 400 });
  }
  const attachments = resources.filter((resource): resource is AttachmentInput => resource.kind !== "link");
  const promptWithFiles = prompt
    ? await promptWithAttachments(prompt, attachments)
    : undefined;

  const result = await launchAgentRun({
    issueId: id,
    userId: auth.user.id,
    triggeredBy: "button",
    prompt: promptWithFiles,
    model,
    forced: !!model,
    baseBranch,
    reasoningLevel,
    // Framing (“Generate a plan” / “Check the plan”), control
    // (“Check implementation”) and free instruction (“Custom”): the
    // launch does not move the ticket. Everything else is worth “implementing”.
    intent:
      body.intent === "plan" || body.intent === "verify" || body.intent === "custom"
        ? body.intent
        : "implement",
    promptMentions: parseAgentMentions(body.mentions),
    localExec: body.localExec === true,
    localWorktree: body.localWorktree === true,
  });
  if (!result.ok) return launchErrorResponse(result);
  return NextResponse.json({ run: result.run });
}
