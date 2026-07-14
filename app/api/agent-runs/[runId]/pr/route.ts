import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import { getRun, setRunPrState } from "@/lib/server/agent/runs";
import { syncIssueStatusFromPr } from "@/lib/server/agent/issue-status-sync";
import { launchAgentRun, type LaunchResult } from "@/lib/server/agent/launch";
import { resolveRepoCloneTarget } from "@/lib/server/agent/repo-access";
import {
  getPullRequest,
  listPullRequestFiles,
  mergePullRequest,
  closePullRequest,
  createPullRequestComment,
  GithubApiError,
} from "@/lib/server/agent/pr";

/**
 * Review in-app de la PR d'un run d'agent (MIN-46 + MIN-66).
 *  GET  → metadata PR + fichiers/patches (diff rendu dans minddy).
 *  POST → { action: 'merge' | 'close' }                    (membre du projet requis)
 *       | { action: 'request_changes', message }           → relance Numo sur la
 *         MÊME branche (donc même PR) avec la consigne (MIN-66).
 * Le token d'installation (Pull requests R/W) est minté à la volée.
 */

type RouteContext = { params: Promise<{ runId: string }> };

const LAUNCH_ERROR_STATUS: Record<string, number> = {
  issueNotFound: 404,
  noRepo: 409,
  unsupportedProvider: 409,
  alreadyRunning: 409,
  quotaExceeded: 402,
};

function launchErrorResponse(result: Extract<LaunchResult, { ok: false }>) {
  const status = LAUNCH_ERROR_STATUS[result.error] ?? 400;
  return NextResponse.json(
    { error: result.error, code: result.error, quota: result.quota },
    { status },
  );
}

export const maxDuration = 60;

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { runId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const run = await getRun(runId);
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  const access = await getProjectAccess(auth.user.id, run.project_id);
  if (!access) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  if (run.pr_number == null) {
    return NextResponse.json({ pr: null, files: [] });
  }

  try {
    const target = await resolveRepoCloneTarget(run.project_id);
    if (!target) return NextResponse.json({ error: "No repository linked" }, { status: 409 });

    const [pr, files] = await Promise.all([
      getPullRequest({ token: target.token, repoFullName: target.repoFullName, number: run.pr_number }),
      listPullRequestFiles({ token: target.token, repoFullName: target.repoFullName, number: run.pr_number }),
    ]);
    return NextResponse.json({ pr, files });
  } catch (err) {
    const status = err instanceof GithubApiError ? 502 : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { runId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  let body: { action?: string; message?: string };
  try {
    body = (await request.json()) as { action?: string; message?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const action = body.action;
  if (action !== "merge" && action !== "close" && action !== "request_changes") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const run = await getRun(runId);
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  const access = await getProjectAccess(auth.user.id, run.project_id);
  if (!access?.isMember) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  if (run.pr_number == null) {
    return NextResponse.json({ error: "This run has no pull request" }, { status: 400 });
  }

  // Demande de changements : on relance Numo sur SA branche → même PR mise à jour.
  // Interdit après merge/close : la branche tête peut être supprimée, une relance
  // forkerait une nouvelle branche + une nouvelle PR (ce qu'on ne veut pas).
  if (action === "request_changes") {
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) return NextResponse.json({ error: "Message required" }, { status: 400 });
    if (run.pr_state !== "open") {
      return NextResponse.json(
        { error: "Pull request is not open", code: "prNotOpen" },
        { status: 409 },
      );
    }
    if (!run.branch_name) {
      return NextResponse.json({ error: "Run has no branch", code: "noBranch" }, { status: 409 });
    }

    try {
      // Le message est visible sur la PR (fil GitHub) puis passé en consigne au run.
      const target = await resolveRepoCloneTarget(run.project_id);
      if (!target) return NextResponse.json({ error: "No repository linked" }, { status: 409 });
      await createPullRequestComment({
        token: target.token,
        repoFullName: target.repoFullName,
        number: run.pr_number,
        body: message,
      });
    } catch (err) {
      const status = err instanceof GithubApiError ? 502 : 500;
      return NextResponse.json({ error: (err as Error).message }, { status });
    }

    const result = await launchAgentRun({
      issueId: run.issue_id,
      userId: auth.user.id,
      triggeredBy: "button",
      prompt: message,
      branchName: run.branch_name,
      baseBranch: run.base_branch,
    });
    if (!result.ok) return launchErrorResponse(result);
    return NextResponse.json({ ok: true, run: { id: result.run.id } });
  }

  try {
    const target = await resolveRepoCloneTarget(run.project_id);
    if (!target) return NextResponse.json({ error: "No repository linked" }, { status: 409 });

    if (action === "merge") {
      await mergePullRequest({ token: target.token, repoFullName: target.repoFullName, number: run.pr_number });
      await setRunPrState(runId, "merged");
      // PR mergée → l'issue passe en done (MIN-46). Acteur = le membre qui merge.
      await syncIssueStatusFromPr({ issueId: run.issue_id, actorId: auth.user.id, prState: "merged" });
      return NextResponse.json({ ok: true, pr_state: "merged" });
    }
    await closePullRequest({ token: target.token, repoFullName: target.repoFullName, number: run.pr_number });
    await setRunPrState(runId, "closed");
    // PR fermée (refusée) → l'issue passe en canceled (MIN-46).
    await syncIssueStatusFromPr({ issueId: run.issue_id, actorId: auth.user.id, prState: "closed" });
    return NextResponse.json({ ok: true, pr_state: "closed" });
  } catch (err) {
    const status = err instanceof GithubApiError ? 502 : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
