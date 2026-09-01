import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { canReadAgentRun } from "@/lib/server/agent/run-access";
import { getRun, requestInterrupt, type AgentRun } from "@/lib/server/agent/runs";
import { revokeRunKey } from "@/lib/server/agent/run-key";
import { stopSandboxByName } from "@/lib/server/agent/sandbox";
import { getServiceClient } from "@/lib/supabase-service";
import { agentRunCanResume } from "@/lib/agent-run-resumability";

/**
 * A conversation from the agent (MIN-46): READ it, RENAME it, PIN it,
 * UNPIN, DELETE.
 *
 * These gestures require the same thing — to be able to read this run, that is to say to be
 * member of his project AND, except shared run, be the creator (MIN-332,
 * `canReadAgentRun`) — and return the same 404 when we don't have it: say
 * “forbidden” would already learn that a run has this identifier.
 *
 * Reading only makes client-safe columns (never the checkpoint or the
 * sandbox_id).
 */

type RouteContext = { params: Promise<{ runId: string }> };

function sanitizeRun(run: AgentRun) {
  return {
    id: run.id,
    project_id: run.project_id,
    issue_id: run.issue_id,
    // Which tells the conversation that she is watching a REVIEW (MIN-168): not
    // branch to push, so no “create a pull request” to propose.
    pull_request_id: run.pull_request_id,
    status: run.status,
    resumable: agentRunCanResume(run),
    model: run.model,
    model_forced: run.model_forced,
    reasoning_level: run.reasoning_level,
    key_mode: run.key_mode,
    triggered_by: run.triggered_by,
    // “Original” bubble of the conversation (the note, for a run notebook).
    prompt: run.prompt,
    prompt_mentions: run.prompt_mentions,
    base_branch: run.base_branch,
    branch_name: run.branch_name,
    pr_number: run.pr_number,
    pr_url: run.pr_url,
    pr_state: run.pr_state,
    continuations: run.continuations,
    cost_usd: run.cost_usd,
    outcome: run.outcome,
    error_message: run.error_message,
    created_at: run.created_at,
    updated_at: run.updated_at,
    awaiting_input: run.awaiting_input,
    // The conversation environment (MIN-359), frozen at launch: it is
    // him that the locked chip of the composer and the note of the thread read.
    local_exec: run.local_exec,
    local_worktree: run.local_worktree,
    // Stamped by DB trigger (outside the AgentRun type) — parity with RUN_COLUMNS of
    // /api/issues/[id]/agent for the client to reuse AgentRunSummary as is.
    completed_at: (run as AgentRun & { completed_at?: string | null }).completed_at ?? null,
  };
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { runId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const run = await getRun(runId);
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  if (!(await canReadAgentRun(auth.user.id, run))) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  return NextResponse.json({ run: sanitizeRun(run) });
}

/** A conversation title fits on one line — beyond that, the column truncates it
 * anyway, and the base doesn't have to carry a paragraph. */
const MAX_TITLE = 200;

/**
 * RENAME the conversation. The title is the one that the titrator wrote on
 * launch (`agent_runs.title`): replacing it by hand means writing the same
 * column, and the display cascade (`lib/agent-session-title.ts`) takes it
 * everywhere — the list line, the pane header.
 *
 * An EMPTY title erases its own: the conversation then returns to the title of its
 * ticket, or on “Untitled Conversation”. It's the only way to come back
 * back, and it is better than banning — an unfortunate renaming should not
 * be definitive.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { runId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  let payload: { title?: unknown; pinned?: unknown };
  try {
    payload = (await request.json()) as { title?: unknown; pinned?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const hasTitle = Object.prototype.hasOwnProperty.call(payload ?? {}, "title");
  const hasPinned = Object.prototype.hasOwnProperty.call(payload ?? {}, "pinned");
  if (!hasTitle && !hasPinned) {
    return NextResponse.json({ error: "Title or pinned required" }, { status: 400 });
  }
  if (hasPinned && typeof payload.pinned !== "boolean") {
    return NextResponse.json({ error: "Pinned must be a boolean" }, { status: 400 });
  }

  const run = await getRun(runId);
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  if (!(await canReadAgentRun(auth.user.id, run))) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const conversationId = run.conversation_id ?? run.id;
  let title = run.title;
  if (hasTitle) {
    const raw = typeof payload.title === "string" ? payload.title.trim() : "";
    title = raw.slice(0, MAX_TITLE) || null;
    const { error } = await getServiceClient()
      .from("agent_conversations")
      .update({ title })
      .eq("id", conversationId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (hasPinned) {
    const pins = auth.supabase.from("agent_conversation_pins");
    const result = payload.pinned
      ? await pins.upsert(
          { user_id: auth.user.id, conversation_id: conversationId },
          { onConflict: "user_id,conversation_id" },
        )
      : await pins
          .delete()
          .eq("user_id", auth.user.id)
          .eq("conversation_id", conversationId);
    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ run: sanitizeRun({ ...run, title }) });
}

/**
 * DELETE the conversation in any state — including `running`.
 *
 * It is deliberate, and it is even the case which caused this route to be written: a
 * conversation whose loop is dead remains `running`, does not stop and does not
 * guide not. Refusing to delete it because it “works” would leave
 * The only way out was to delete it by hand from the base - which had to be done.
 *
 * THREE GESTURES, AND THE ORDER COUNTS. We set the interrupt flag, we cut the
 * microVM, we revoke the run key, THEN we delete the line. Delete first
 * would lose the name of the sandbox and the hash of the key: the microVM would run
 * until the end of its session (24 hours billed) and the key would remain valid, without
 * nothing left in the basis to say which ones. The first three are best-effort — one
 * of these households which fails should not prevent the requested deletion.
 *
 * The database does the rest: `agent_run_events` and `agent_run_messages` are in
 * `on delete cascade`, and nothing else references a run.
 */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const { runId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const run = await getRun(runId);
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  if (!(await canReadAgentRun(auth.user.id, run))) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  if (run.status === "queued" || run.status === "running") {
    await requestInterrupt(run.id).catch(() => {});
  }
  if (run.sandbox_id) await stopSandboxByName(run.sandbox_id).catch(() => {});
  if (run.provider_key_id) await revokeRunKey(run.provider_key_id).catch(() => {});

  const { error } = await getServiceClient()
    .from("agent_conversations")
    .delete()
    .eq("id", run.conversation_id ?? run.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
