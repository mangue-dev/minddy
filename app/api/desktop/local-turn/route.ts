import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getAuthedUser } from "@/lib/server/api-auth";
import { admitLocalRun, issueLocalExecToken } from "@/lib/server/agent/local-exec";
import { rowMayRunLocally } from "@/lib/server/agent/local-exec-scope";
import { canReadAgentRun } from "@/lib/server/agent/run-access";
import {
  appendEvent,
  claimRun,
  declineQueuedLocalRun,
  findQueuedLocalRunForMachine,
  getRun,
} from "@/lib/server/agent/runs";
import { executeAgentRun } from "@/lib/server/agent/execute";
import { kickAgentDrain } from "@/lib/server/agent/launch";
import { getServiceClient } from "@/lib/supabase-service";
import type { VmJob } from "@/lib/server/agent/vm/protocol";

type LocalProjectCatalogRow = {
  id: string;
  name: string;
  key: string;
  repoFullName: string | null;
};

/**
 * The server knows the accessible projects, the machine knows the paths.
 * This pathless half is joined in the launcher before the local job
 * is written; the agent can then find a project cited by name and has no
 * no more asking where he is on the post.
 */
async function localProjectCatalog(
  supabase: SupabaseClient,
): Promise<LocalProjectCatalogRow[]> {
  try {
    const [{ data: projects, error: projectsError }, { data: links, error: linksError }] =
      await Promise.all([
        supabase
          .from("projects")
          .select("id, name, key")
          .is("deleted_at", null)
          .order("created_at", { ascending: true }),
        supabase.from("project_git_links").select("project_id, repo_full_name"),
      ]);
    if (projectsError || linksError) {
      console.error(
        "[desktop-local-turn] project catalogue failed:",
        projectsError?.message ?? linksError?.message,
      );
      return [];
    }
    const repoByProject = new Map(
      (links ?? []).flatMap((link) =>
        typeof link.project_id === "string" && typeof link.repo_full_name === "string"
          ? [[link.project_id, link.repo_full_name] as const]
          : [],
      ),
    );
    return (projects ?? []).flatMap((project) =>
      typeof project.id === "string" && typeof project.name === "string" && typeof project.key === "string"
        ? [{
            id: project.id,
            name: project.name,
            key: project.key,
            repoFullName: repoByProject.get(project.id) ?? null,
          }]
        : [],
    );
  } catch (error) {
    console.error(
      "[desktop-local-turn] project catalogue failed:",
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}

/**
 * `POST /api/desktop/local-turn` — **THE LOCAL TOWER TRIGGER (MIN-293).**
 *
 * ## What it is, and what it is not
 *
 * From MIN-371, two calls arrive here: the clone requests the next run of
 * its attached projects, or the old development trigger designates an id.
 * In both cases this route prepares the turn that the user has marked
 * local and gives his machine what it needs to play it.
 *
 * The sweater is also presence: a machine that no longer demands is no longer there.
 * No page subscription or heartbeat is necessary, and the browser that
 * The conversation may be on another device.
 *
 * ## The five doors, in this order
 *
 * 1. **a session**, then a selection limited to the announced attached projects
 * by the clone and to runs created by this same user;
 * 2. **the right to read this run** — the selection goes through the RLS and the guard is
 * repeated before any claim;
 * 3. **the nature of the run** — `rowMayRunLocally`: an anchor run `pr`, of
 * webhook, routine, channel or public feedback board **does not leave
 * never on a machine**, because its context is attacker text
 * potential and that locally a prompt injection is a shell on the workstation
 *    of someone ([local-exec-scope.ts](../../../../lib/server/agent/local-exec-scope.ts));
 * 4. **admission** — `admitLocalRun`: an interactive BYOK passes directly;
 * a platform key requires the provider mint;
 * 5. **the claim** — `queued → running`, atomic, only one machine wins.
 *
 * ## Why is the lease set up LAST
 *
 * To issue is to revoke: `issueLocalExecToken` increments `local_exec_gen`
 * before signing, so any token previously issued for this run dies at this
 * second. Mounting it before preparation would mean killing a round in progress
 * only to discover that you can't make a new one.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Preparing for a round makes a forge call and reads the opencode log.
 * The same order of magnitude as a launch, without microVM waking up. */
export const maxDuration = 120;

const DEVICE_ID = /^[0-9a-f]{32}$/;
const PROJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_CLAIM_PROJECTS = 50;

type LocalTurnRequest = {
  runId?: unknown;
  deviceId?: unknown;
  projectIds?: unknown;
};

/** The pull only accepts a short list of unique UUIDs, never paths. */
function claimProjects(body: LocalTurnRequest | null): string[] | null {
  if (!DEVICE_ID.test(typeof body?.deviceId === "string" ? body.deviceId : "")) return null;
  if (!Array.isArray(body?.projectIds) || body.projectIds.length > MAX_CLAIM_PROJECTS) return null;
  if (body.projectIds.some((id) => typeof id !== "string" || !PROJECT_ID.test(id))) return null;
  return [...new Set(body.projectIds as string[])];
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const timings: Record<string, number> = {};
  const mark = (name: string) => {
    timings[name] = Date.now() - startedAt;
  };
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as LocalTurnRequest | null;
  const runId = typeof body?.runId === "string" ? body.runId.trim() : "";
  const claimProjectIds = runId ? null : claimProjects(body);
  if (!runId && !claimProjectIds) {
    return NextResponse.json({ error: "runId or valid machine claim required" }, { status: 400 });
  }

  const run = runId
    ? await getRun(runId)
    : await findQueuedLocalRunForMachine({
        userId: auth.user.id,
        projectIds: claimProjectIds!,
        client: auth.supabase,
      });
  if (!run && !runId) {
    return NextResponse.json({ status: "idle" }, { headers: { "cache-control": "no-store" } });
  }
  // An unreadable run and a non-existent run render the SAME thing: an identifier
  // of run should not be used to learn that it exists.
  if (!run || !(await canReadAgentRun(auth.user.id, run))) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  const selectedRunId = run.id;
  mark("run-and-access");

  if (!run.local_exec) {
    return NextResponse.json({ error: "this run does not execute locally" }, { status: 409 });
  }
  const scope = rowMayRunLocally(run);
  if (!scope.ok) {
    // Shouldn't happen — `createRun` already applies the rule — but it does
    // second curtain at the place that counts: without allocation, no machine
    // can run this turn.
    console.error(`[desktop-local-turn] ${selectedRunId} : contexte tiers (${scope.reason})`);
    return NextResponse.json({ error: `third-party context: ${scope.reason}` }, { status: 409 });
  }
  /**
   * ADMISSION reads FROZEN ON RUN mode. `launchAgentRun` solved it before
   * `createRun` and the following chunks must precisely keep this choice:
   * redo here all the resolution of the provider added a round trip before
   * the claim without producing a fresher truth.
   */
  const admission = admitLocalRun({ keyMode: run.key_mode });
  if (!admission.ok) {
    /**
     * No capped key to lower on the machine: the run remains
     * perfectly executable in a microVM, where the firewall carries the key.
     * The transition keeps `queued + local_exec` to never convert under
     * the feet of another shell which would have won the claim in the meantime.
     */
    const cloudRun = await declineQueuedLocalRun(run.id);
    if (!cloudRun) {
      return NextResponse.json({ error: "run is not queued" }, { status: 409 });
    }
    await appendEvent(run.id, "status", {
      status: "queued",
      phase: "local_exec_declined",
      reason: admission.reason,
    });
    kickAgentDrain(getServiceClient());
    return NextResponse.json(
      { status: "idle", declinedRunId: run.id, reason: admission.reason },
      { headers: { "cache-control": "no-store" } },
    );
  }

  /**
   * THE CLAIM. `queued → running`, atomic in base: two machines which
   * would claim the same run to be decided here, no further.
   *
   * A run that is already `running` is not claimable, and this is the correct default — a turn
   * is perhaps already running somewhere, and superimposing a second one on it would
   * enter the same checkpoint by two harnesses.
   */
  const claimed = await claimRun(run.id);
  if (!claimed) {
    return NextResponse.json({ error: "run is not queued" }, { status: 409 });
  }
  mark("claimed");
  // No catalog on `idle` sweaters: these would be two basic readings
  // every two seconds to return nothing. Once the claim is won, the
  // RLS applies the perimeter of the interface and the reading covers the
  // preparation of the tour.
  const projectsPromise = localProjectCatalog(auth.supabase);

  // An object and not a `let`: `tsc` does not follow an assignment made from an
  // callback, and would reduce the variable to `null` right after.
  const prepared: {
    job: Omit<VmJob, "layout" | "bootstrapMs"> | null;
    repoFullName: string | null;
  } = { job: null, repoFullName: null };
  const outcome = await executeAgentRun(claimed, {
    // No useful deadline: the function no longer runs a loop since
    // MIN-225, and the local branch does not wake up any microVMs.
    deadlineMs: 120_000,
    onLocalAssignment: (job, meta) => {
      prepared.job = job;
      prepared.repoFullName = meta.repoFullName;
    },
  });
  mark("prepared");

  if (!prepared.job) {
    // `executeAgentRun` has already put the run to rest and reported the failure to the thread: we
    // don't double it with a made-up message here.
    return NextResponse.json({ error: `turn not prepared (${outcome})` }, { status: 409 });
  }

  // This identity must exist before issuing the lease: issue a token
  // increments its generation and revokes the previous one. Let's not do this
  // irreversible writing for an incomplete assignment.
  if (!prepared.repoFullName) {
    return NextResponse.json({ error: "prepared turn has no repository identity" }, { status: 409 });
  }

  const lease = await issueLocalExecToken(run.id);
  if (!lease.ok) {
    console.error(`[desktop-local-turn] ${selectedRunId} : bail refusé (${lease.error})`);
    return NextResponse.json({ error: `lease refused: ${lease.error}` }, { status: 503 });
  }
  mark("leased");
  const projects = await projectsPromise;

  /**
   * The `owner/repo` of the project leaves with the assignment: it is against him that the
   * machine revalidates the attached file, **at the time of the turn**. The attachment could
   * been done a month ago, and a chosen path proves nothing.
   */
  // `executeAgentRun` has just resolved this same target to build the job.
  // Having her rehit the forge here created a second token just for rereading
  // the `owner/repo`. The callback now makes this data non-secret with the job.
  return NextResponse.json(
    {
      runId: run.id,
      projectId: run.project_id,
      repoFullName: prepared.repoFullName,
      localWorktree: run.local_worktree === true,
      projects,
      diagnostics: { ...timings, total: Date.now() - startedAt },
      // The lease travels IN the job (`controlToken`), and not next to it: a local job
      // is, by definition, a job that carries a token (`isLocalJob`). One second
      // truth about the same fact would eventually diverge.
      job: { ...prepared.job, controlToken: lease.token },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
