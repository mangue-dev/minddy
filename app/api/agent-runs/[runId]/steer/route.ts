import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { canReadAgentRun } from "@/lib/server/agent/run-access";
import {
  activeRunForRoutine,
  getRun,
  insertRunMessage,
  stampRun,
  bumpRunActivity,
  type AgentRunStatus,
} from "@/lib/server/agent/runs";
import { kickAgentDrain } from "@/lib/server/agent/launch";
import { checkAgentQuota } from "@/lib/server/agent/quota";
import { syncIssueStatusOnAgentStart } from "@/lib/server/agent/issue-status-sync";
import { getServiceClient } from "@/lib/supabase-service";
import { parseAgentMentions } from "@/lib/agent-mentions";
import { parseResourcesInput } from "@/lib/server/attachments";
import { promptWithAttachments } from "@/lib/server/agent/prompt-attachments";
import type { AttachmentInput } from "@/lib/types";

/**
 * WARM restart of an agent run (MIN-46 + MIN-68): the user sends a
 * message FROM the run conversation — this is the NORMAL gesture of the model
 * conversational (the session lives as long as it is spoken to). It is the only path that
 * takes an existing run in its context (checkpoint + sandbox) — the points
 * LAUNCH input (sidebar, map, “request changes”) create a
 * run COLD. The message joins the `agent_run_messages` queue; the loop drains it
 * at the border of round and injects it as `user` message. Case :
 * • running / queued → hot orientation (drained in the next round);
 * • completed / canceled → new round: quota re-checked on the CALLER and on
 * the owner (each return is a CHARGED turn —
 * without this check, an existing session would bypass the
 * monthly ceiling forever), then
 * run re-`queued`, budget reset, drain kicked.
 * Only the LAST run of the outcome can be repeated — the previous ones are a
 * history (see `supersededRun` refusal below).
 * Reserved for those who can read the run (MIN-332) — we do not speak in conversation
 * from another. A single event writer = the claimer.
 */

// The restart kick drains the first chunk in after(): it needs the same
// window than the cron route (270 s budget), otherwise the function is killed in full
// round and the run remains stuck in 'running' — and two successive kills exhaust
// MAX_CRASH_ATTEMPTS, which clears the checkpoint (dead conversation). Same reason
// that the maxDuration = 300 of /api/issues/[id]/agent.
export const runtime = "nodejs";
export const maxDuration = 300;

type RouteContext = { params: Promise<{ runId: string }> };

/** Resumable = everything except `failed` (repo/template bootstrap error). */
const RESUMABLE: AgentRunStatus[] = ["queued", "running", "completed", "canceled"];
/** Idle/completed statuses that require a restart (re-queue + kick). */
const RESUME_FROM: AgentRunStatus[] = ["completed", "canceled"];
const MAX_LEN = 4000;

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { runId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  let payload: { message?: string; mentions?: unknown; attachments?: unknown };
  try {
    payload = (await request.json()) as { message?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  // `?.`: a JSON body `null` is valid on the parser side but has no fields.
  const message = (typeof payload?.message === "string" ? payload.message : "").trim().slice(0, MAX_LEN);
  if (!message) return NextResponse.json({ error: "Message required" }, { status: 400 });

  const resources = parseResourcesInput(payload?.attachments, `chat/${auth.user.id}/`, 5);
  if (resources === null) {
    return NextResponse.json({ error: "Invalid attachments" }, { status: 400 });
  }
  const attachments = resources.filter((resource): resource is AttachmentInput => resource.kind !== "link");
  const messageWithFiles = await promptWithAttachments(message, attachments);

  const run = await getRun(runId);
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  if (!(await canReadAgentRun(auth.user.id, run))) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  if (!RESUMABLE.includes(run.status)) {
    return NextResponse.json({ error: "Run is not resumable" }, { status: 409 });
  }

  /**
   * THE “AGENTS” RIGHT IS VERIFIED ON THE CALLER (MIN-344), and with each message
   * — not just on covers.
   *
   * Talking to an agent means making him work: a message extends the tour by
   * course as he reopens one finished. Verified on the sole OWNER of the
   * run, the right circumvented itself by addressing the conversation of another —
   * and `canReadAgentRun` opens the three “project” runs to the whole team
   * (routine, chain, PR replay). A member whose plan does not include
   * agents there was therefore an agent, paid by the next account.
   *
   * Here we only look at the caller's PLAN, not his budget: the tour spends
   * the owner's key, and it is his ceiling which decides what happens next
   * (checked on the recovery path, below).
   */
  const callerQuota = await checkAgentQuota(auth.user.id);
  if (callerQuota.reason === "agents_not_in_plan") {
    return NextResponse.json(
      { error: "quotaExceeded", code: "quotaExceeded", quota: callerQuota },
      { status: 402 },
    );
  }

  // His PR is MERGED → this run is DELIVERED, we don't wake him up (MIN-68). Its
  // branch is already in the database: putting the agent back to work there would push
  // new commits on delivered work. To continue: new run (which
  // will start from a new branch — the ticket context no longer determines the branch
  // of a merged lineage).
  if (run.pr_state === "merged") {
    return NextResponse.json({ error: "prMerged", code: "prMerged" }, { status: 409 });
  }

  let resumed = false;
  if (RESUME_FROM.includes(run.status)) {
    // The conversation has its workspace: another exchange quoting the same
    // ticket never supplants it. Only routines keep a lock between
    // their planned occurrences.
    if (run.routine_id) {
      // A passage from ROUTINE (MIN-185) is repeated like a conversation
      // notebook — except that a routine is only entitled to ONE active passage at
      // time (`idx_agent_runs_active_routine`). Without this guard, respond to
      // an old passage while the working day's deadline would
      // report a uniqueness violation to 500, where the refusal is known.
      const active = await activeRunForRoutine(run.routine_id);
      if (active && active.id !== runId) {
        return NextResponse.json(
          { error: "alreadyRunning", code: "alreadyRunning" },
          { status: 409 },
        );
      }
    }

    /**
     * A restart starts an invoiced TOUR — same control as at launch (BYOK
     * = unlimited tokens; platform key = monthly ceiling). Two budgets
     * look, and one was missing (MIN-344):
     *
     * • that of the APPELLANT, who triggers the expenditure (his “agents” right is
     * already fallen higher; here is its ceiling);
     * • that of the OWNER, whose key performs the trick — the ledger imputes to
     * `created_by` of the run, deliberately (see `billToFor` in
     * control-plane.ts: the microVM does not choose who pays).
     *
     * Imputation does not move: it follows the key that executes. There
     * moving to the caller would require changing the key during the call.
     * conversation, while the rest of the tour continues on the checkpoint and the
     * owner's sandbox.
     */
    const ownerId = run.created_by ?? auth.user.id;
    const ownerQuota =
      ownerId === auth.user.id ? null : await checkAgentQuota(ownerId);
    const quota = !callerQuota.allowed ? callerQuota : (ownerQuota ?? callerQuota);
    if (!quota.allowed) {
      return NextResponse.json(
        { error: "quotaExceeded", code: "quotaExceeded", quota },
        { status: 402 },
      );
    }

    // Query BEFORE saving the message: if the guard does not match (race
    // lost), we decide with full knowledge of the facts instead of accepting a message
    // that no one would drain. New round on the same branch/PR.
    const stamped = await stampRun(
      runId,
      { status: "queued", not_before: new Date().toISOString() },
      { guard: RESUME_FROM },
    );
    if (!stamped) {
      // Race: the run is no longer at rest. If it was HE who (re)became active
      // (quick double-send, another tab which just woke it up), the message
      // is legitimate — he joins the turn that starts, as for a run that
      // work. We only refuse if it was ANOTHER run that took the outcome.
      const now = await getRun(runId);
      if (!now || !["queued", "running"].includes(now.status)) {
        return NextResponse.json(
          { error: "alreadyRunning", code: "alreadyRunning" },
          { status: 409 },
        );
      }
    } else {
      resumed = true;

      // The agent returns to work → the ticket returns to “in progress”, UNLESS a
      // PR in review (open/draft) already governs its status — same rule as in
      // launching a cold run (launch.ts). A PR refused (closed → issue
      // `todo`) returns to class; `merged` is already refused above.
      // Run notebook: no tickets to synchronize.
      if (run.issue_id && run.pr_state !== "open" && run.pr_state !== "draft") {
        await syncIssueStatusOnAgentStart({ issueId: run.issue_id, actorId: auth.user.id });
      }
    }
  }

  await insertRunMessage(runId, auth.user.id, messageWithFiles, parseAgentMentions(payload?.mentions));
  // A message restarts the idle timer (prevents imminent reaping).
  await bumpRunActivity(runId);

  // Run end-of-turn: the message was accepted for a run that WAS WORKING,
  // but the executor was able to quiesce between its last `hasPendingRunMessages`
  // and its final stamp — the message would then remain orphaned (no one drains a
  // run at rest). We re-read: if the run has just landed, we re-queue it ourselves-
  // same (the guard avoids double waking if another client has already done so).
  if (!resumed) {
    const now = await getRun(runId);
    if (now && RESUME_FROM.includes(now.status)) {
      const stamped = await stampRun(
        runId,
        { status: "queued", not_before: new Date().toISOString() },
        { guard: RESUME_FROM },
      );
      if (stamped) resumed = true;
    }
  }

  if (resumed) kickAgentDrain(getServiceClient());

  return NextResponse.json({ ok: true, status: run.status });
}
