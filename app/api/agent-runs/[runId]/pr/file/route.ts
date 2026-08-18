import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { canReadAgentRun } from "@/lib/server/agent/run-access";
import { getRun } from "@/lib/server/agent/runs";
import { resolveRepoCloneTarget } from "@/lib/server/agent/repo-access";
import { forgeFor, isForgeApiError } from "@/lib/server/agent/forge";
import {
  authorizeRunPrRequest,
  prFileSourceResponse,
} from "@/lib/server/agent/pr-actions";

/**
 * BASE version of a run diff file — the source whose diff view has
 * need to unfold the hidden context around the hunks (GitHub style).
 *  GET ?path=… → { content } (raw file text at the merge base).
 *
 * Two sources, depending on run status. With a PR, it is a FACADE (MIN-143) of
 * `/api/pull-requests/[prId]/file`. WITHOUT PR, it is the base compare…branch of
 * work — the diff view IN the conversation, before any pull request: it
 * has no PR to address, and therefore remains served here, indexed by the run.
 */

type RouteContext = { params: Promise<{ runId: string }> };

export const maxDuration = 60;

/** Path that addresses the base version: the old name if the file has been renamed. */
function basePathOf(file: { filename: string; previous_filename?: string }): string {
  return file.previous_filename ?? file.filename;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { runId } = await params;
  const path = request.nextUrl.searchParams.get("path");
  if (!path) return NextResponse.json({ error: "Path required" }, { status: 400 });

  const auth = await authorizeRunPrRequest(request, runId);
  if (auth.ok) return prFileSourceResponse(auth.scope, path);
  if (!("noPr" in auth)) return auth.response;

  // ── Run without PR: the diff is the compare base…branch of work ──────────
  const user = await getAuthedUser(request);
  if (!user.ok) return user.response;

  const run = await getRun(runId);
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  if (!(await canReadAgentRun(user.user.id, run))) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  if (!run.branch_name) {
    return NextResponse.json({ error: "This run has no diff" }, { status: 400 });
  }

  try {
    const target = await resolveRepoCloneTarget(run.project_id);
    if (!target) return NextResponse.json({ error: "No repository linked" }, { status: 409 });
    const forge = forgeFor(target.provider);

    const base = run.base_branch ?? target.defaultBranch;
    const head = run.branch_name;
    const compared = await forge.compareBranches({
      token: target.token,
      repoFullName: target.repoFullName,
      base,
      head,
    });

    // The path must be that of a diff file, on the base side. A file
    // added has no base version: its patch IS already the entire file.
    const file = compared.files.find((f) => basePathOf(f) === path);
    if (!file || file.status === "added") {
      return NextResponse.json({ error: "File not found in this diff" }, { status: 404 });
    }

    const ref = await forge.getBranchesMergeBaseSha({
      token: target.token,
      repoFullName: target.repoFullName,
      base,
      head,
    });
    const content = await forge.getFileAtRef({
      token: target.token,
      repoFullName: target.repoFullName,
      path,
      ref,
    });
    if (content === null) {
      return NextResponse.json({ error: "File not found at merge base" }, { status: 404 });
    }
    return NextResponse.json({ content });
  } catch (err) {
    const status = isForgeApiError(err) ? 502 : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
