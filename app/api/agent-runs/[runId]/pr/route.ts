import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import { getRun, setRunPrState } from "@/lib/server/agent/runs";
import { resolveRepoCloneTarget } from "@/lib/server/agent/repo-access";
import {
  getPullRequest,
  listPullRequestFiles,
  mergePullRequest,
  closePullRequest,
  GithubApiError,
} from "@/lib/server/agent/pr";

/**
 * Review in-app de la PR d'un run d'agent (MIN-46).
 *  GET  → metadata PR + fichiers/patches (diff rendu dans minddy).
 *  POST → { action: 'merge' | 'close' } (membre du projet requis).
 * Le token d'installation (Pull requests R/W) est minté à la volée.
 */

type RouteContext = { params: Promise<{ runId: string }> };

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

  let body: { action?: string };
  try {
    body = (await request.json()) as { action?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const action = body.action;
  if (action !== "merge" && action !== "close") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const run = await getRun(runId);
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  const access = await getProjectAccess(auth.user.id, run.project_id);
  if (!access?.isMember) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  if (run.pr_number == null) {
    return NextResponse.json({ error: "This run has no pull request" }, { status: 400 });
  }

  try {
    const target = await resolveRepoCloneTarget(run.project_id);
    if (!target) return NextResponse.json({ error: "No repository linked" }, { status: 409 });

    if (action === "merge") {
      await mergePullRequest({ token: target.token, repoFullName: target.repoFullName, number: run.pr_number });
      await setRunPrState(runId, "merged");
      return NextResponse.json({ ok: true, pr_state: "merged" });
    }
    await closePullRequest({ token: target.token, repoFullName: target.repoFullName, number: run.pr_number });
    await setRunPrState(runId, "closed");
    return NextResponse.json({ ok: true, pr_state: "closed" });
  } catch (err) {
    const status = err instanceof GithubApiError ? 502 : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
