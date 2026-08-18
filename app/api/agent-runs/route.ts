import { NextResponse, type NextRequest } from "next/server";

import { isReasoningLevel } from "@/lib/agent-reasoning";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import { launchAgentRun, type LaunchResult } from "@/lib/server/agent/launch";
import { parseAgentMentions } from "@/lib/agent-mentions";
import { parseResourcesInput } from "@/lib/server/attachments";
import { promptWithAttachments } from "@/lib/server/agent/prompt-attachments";
import type { AttachmentInput } from "@/lib/types";

/**
 * GLOBAL list of code agent (Numo) conversations, all projects
 * accessible together — powers the Agents page. RLS `agent_runs` =
 * can_access_project (and creator alone for notebook runs) → the client cookie
 * is enough, no manual project filter.
 *
 * **ONE RUN = ONE CONVERSATION**, no exceptions. The successive runs of the same
 * ticket were duplicated here and stored behind a selector, in the middle of
 * the conversation header: the column showed ONE line per ticket, and the
 * other exchanges were found by unfolding a menu that nothing announced. They
 * now appear side by side, each under its own title — the one that the
 * titler wrote at launch (`agent_runs.title`), rendered on the screen preceded by
 * the ticket identifier.
 *
 * `working` says THIS run is working (queued/running) — the spinner of the line;
 * `lastCompletedAt` is its end, compared to the TICKET reading cursor
 * (read states remain indexed by ticket: two conversations from the same ticket
 * therefore become read together).
 *
 * POST = launch a run without a ticket: { projectId, prompt, model?, baseBranch? }.
 */

export const runtime = "nodejs";
// The launch kick drains the first chunk into after(): same window as the
// cron route (270 s budget) — same reason as 300 from /api/issues/[id]/agent.
export const maxDuration = 300;

const WORKING_STATUSES = ["queued", "running"];

type AgentRunStatus = "queued" | "running" | "completed" | "failed" | "canceled";

interface RunRow {
  id: string;
  conversation_id: string;
  issue_id: string | null;
  pull_request_id: string | null;
  status: AgentRunStatus;
  model: string | null;
  triggered_by: "button" | "chat" | "mention";
  prompt: string | null;
  title: string | null;
  pr_number: number | null;
  pr_url: string | null;
  pr_state: "draft" | "open" | "merged" | "closed" | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  awaiting_input: boolean;
  conversation: { title: string | null; visibility: "private" | "project" } | null;
  issue: { id: string; number: number; title: string } | null;
  project: {
    id: string;
    key: string;
    name: string;
    icon_url: string | null;
    orb_seed: string | null;
    /** Read to DISCARD sessions from a project to the trash — never returned. */
    deleted_at: string | null;
  } | null;
  /** PR REVIEWED by this run (MIN-168). Null everywhere else. */
  pull_request: { id: string; number: number; title: string | null; url: string | null } | null;
}

/** Heading of the note exception returned as the title of a notebook session. */
const NOTE_EXCERPT_MAX = 200;

function noteExcerpt(prompt: string | null): string | null {
  if (!prompt?.trim()) return null;
  const trimmed = prompt.trim();
  return trimmed.length <= NOTE_EXCERPT_MAX ? trimmed : `${trimmed.slice(0, NOTE_EXCERPT_MAX)}…`;
}

export interface AgentSessionListItem {
  /** Durable identity of the conversation, distinct from its current execution. */
  conversationId: string;
  /** Current execution. Preserves for engine routes during migration. */
  runId: string;
  status: AgentRunStatus;
  model: string | null;
  triggered_by: RunRow["triggered_by"];
  /**
   * The title written at launch by the small model (the title of the PR for a
   * proofreading, which already has one). `null` when it is missing: a run launched before
   * `agent_runs.title`, or whose generation failed — the conversation drops
   * then on the title of the ticket, and a notebook conversation on the exception of its
   * note.
   */
  title: string | null;
  pr_number: number | null;
  pr_url: string | null;
  pr_state: RunRow["pr_state"];
  created_at: string;
  updated_at: string;
  /** Null = conversation carnet (MIN-84) ou de RELECTURE (MIN-168). */
  issue: RunRow["issue"];
  /**
   * The pull request that this conversation RELIT (MIN-168) — not null ⇒ badge
   * “PR Analysis” and PR title, where a ticket conversation shows
   * its identifier. This is NOT the PR that a code run would have opened: this one
   * lives in `pr_number` / `pr_url` / `pr_state`, and the two don't mix.
   */
  pullRequest: { id: string; number: number; title: string | null; url: string | null } | null;
  project: {
    id: string;
    key: string;
    name: string;
    icon_url: string | null;
    orb_seed: string | null;
  } | null;
  /** CE run travaille (queued/running) → « Numo travaille ». */
  working: boolean;
  /** This conversation is pinned by the current user. */
  pinned: boolean;
  /**
   * End of agent of this run, or `null`. Compared to user's `last_read_at`
   * → blue bubble “finished, unread”.
   */
  lastCompletedAt: string | null;
  /**
   * This run waits for a response from the user (round ended on ask_user) →
   * YELLOW point instead of blue, same reading rules.
   */
  awaitingInput: boolean;
}

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.supabase
    .from("agent_runs")
    .select(
      "id, conversation_id, issue_id, pull_request_id, status, model, triggered_by, prompt, title, pr_number, pr_url, pr_state, created_at, updated_at, completed_at, awaiting_input, conversation:agent_conversations(title, visibility), issue:issues(id, number, title), project:projects(id, key, name, icon_url, orb_seed, deleted_at), pull_request:pull_requests(id, number, title, url)",
    )
    // A passage from ROUTINE (MIN-185) is NOT a conversation: it lives in
    // his routine, under “Previous Executions”, and nowhere else. Without
    // this filter, a daily routine would drown this column in a week.
    .is("routine_id", null)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: pinRows, error: pinsError } = await auth.supabase
    .from("agent_conversation_pins")
    .select("conversation_id")
    .eq("user_id", auth.user.id);

  if (pinsError) return NextResponse.json({ error: pinsError.message }, { status: 500 });

  const pinnedConversationIds = new Set(
    (pinRows ?? []).map((row) => row.conversation_id as string),
  );

  // A run whose outcome is in the trash (MIN-133): `issue_id` is entered
  // but the nested resource returns null, the policy `issues_select` having it
  // discarded. Leaving it through would make it read like a NOTEBOOK session — even
  // form (void outcome), fallback title included — for a ticket that does not exist
  // more on screen. Restoring the ticket returns its session as is.
  // Same reasoning for a REREADING session whose PR is no longer
  // readable (deposit untied since): without it, the session no longer has either title or
  // badge and would read like a notebook session, for a PR who is no longer there.
  // Same reasoning, a notch higher, for a PROJECT in the trash: its
  // line remains in base and the `projects_select` policy only looks at access, if
  // although its sessions reappeared in the list — under a header bearing the
  // name of a project that the user no longer sees anywhere else. THE
  // restoring brings them back, like the rest of its contents.
  const rows = ((data ?? []) as unknown as RunRow[]).filter(
    (r) =>
      (r.issue_id === null || r.issue !== null) &&
      (r.pull_request_id === null || r.pull_request !== null) &&
      !r.project?.deleted_at,
  );
  // One run, one conversation — no regrouping. What was once read on
  // the representative of a ticket (the status of its last run, its PR, its end) reads
  // now on each line, for this run and him alone.
  const items: AgentSessionListItem[] = rows.map((r) => ({
    conversationId: r.conversation_id,
    runId: r.id,
    status: r.status,
    model: r.model,
    triggered_by: r.triggered_by,
    // The title of the PR for a reread (she already has one written), otherwise
    // that of the titrator. Failing — run before `agent_runs.title`, or generation
    // failed -, the exception of the note; a ticket conversation falls away
    // on the title of the ticket, which the customer already has on hand.
    title:
      r.pull_request?.title?.trim() ||
      r.conversation?.title?.trim() ||
      r.title?.trim() ||
      (r.issue_id ? null : noteExcerpt(r.prompt)),
    pr_number: r.pr_number,
    pr_url: r.pr_url,
    pr_state: r.pr_state,
    created_at: r.created_at,
    updated_at: r.updated_at,
    issue: r.issue,
    pullRequest: r.pull_request,
    // Without its `deleted_at`, which was only used for the filter above: the answer
    // only wears what the listing paints.
    project: r.project
      ? {
          id: r.project.id,
          key: r.project.key,
          name: r.project.name,
          icon_url: r.project.icon_url,
          orb_seed: r.project.orb_seed,
        }
      : null,
    working: WORKING_STATUSES.includes(r.status),
    pinned: pinnedConversationIds.has(r.conversation_id),
    lastCompletedAt: r.completed_at,
    awaitingInput: r.status === "completed" && r.awaiting_input,
  }));

  // Pins take precedence over ordinary conversations. Inside
  // each group, the order remains that of creation: the list is not reordered
  // not according to PR / webhooks synchronizations.
  const sessions = items.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return a.created_at < b.created_at ? 1 : -1;
  });
  return NextResponse.json({ sessions });
}

// POST notebook terminals: the note is a free text (persisted in `prompt` of the
// run), model and branch of short identifiers.
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
  promptRequired: 400,
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

/**
 * Launch a run WITHOUT A TICKET (MIN-84, called “carnet” — the notebook was the
 * first entry point): anchored to a project (the repository to clone) + a text
 * free as instruction, whatever the subject. Project member required —
 * the run is then personal (RLS: creator alone).
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  let body: {
    projectId?: string;
    prompt?: string;
    model?: string;
    reasoningLevel?: string;
    baseBranch?: string;
    mentions?: unknown;
    attachments?: unknown;
    /** The conversation starts on the user's MACHINE (MIN-359). A
     * request, which `localExecRequested` validates on the server side. */
    localExec?: unknown;
    localWorktree?: unknown;
  };
  try {
    const parsed: unknown = await request.json();
    // Non-object body (null, string…): refused here rather than crashing further down.
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    body = parsed as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
  const prompt =
    typeof body.prompt === "string" ? body.prompt.trim().slice(0, MAX_PROMPT_LENGTH) : "";
  // A uuid is 36 characters long: beyond the margin, forged body.
  if (!projectId || projectId.length > 64) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }
  if (!prompt) {
    return NextResponse.json(
      { error: "promptRequired", code: "promptRequired" },
      { status: 400 },
    );
  }

  const access = await getProjectAccess(auth.user.id, projectId);
  if (!access?.isMember) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const model =
    typeof body.model === "string" && body.model.trim()
      ? body.model.trim().slice(0, MAX_MODEL_LENGTH)
      : undefined;
  const baseBranch =
    typeof body.baseBranch === "string" && body.baseBranch.trim()
      ? body.baseBranch.trim().slice(0, MAX_BRANCH_LENGTH)
      : undefined;
  // Level of reasoning of the composer (MIN-122). An unknown value is
  // IGNORED rather than refused: the launch then falls back on the personal fault,
  // like the route of a ticket.
  const reasoningLevel = isReasoningLevel(body.reasoningLevel)
    ? body.reasoningLevel
    : undefined;
  const resources = parseResourcesInput(body.attachments, `chat/${auth.user.id}/`, 5);
  if (resources === null) {
    return NextResponse.json({ error: "Invalid attachments" }, { status: 400 });
  }
  const attachments = resources.filter((resource): resource is AttachmentInput => resource.kind !== "link");
  const promptWithFiles = await promptWithAttachments(prompt, attachments);

  const result = await launchAgentRun({
    projectId,
    userId: auth.user.id,
    triggeredBy: "button",
    prompt: promptWithFiles,
    model,
    forced: !!model,
    reasoningLevel,
    baseBranch,
    promptMentions: parseAgentMentions(body.mentions),
    localExec: body.localExec === true,
    localWorktree: body.localWorktree === true,
  });
  if (!result.ok) return launchErrorResponse(result);
  return NextResponse.json({ run: result.run });
}
