import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { canReadAgentRun } from "@/lib/server/agent/run-access";
import { getRun } from "@/lib/server/agent/runs";
import { resolveRepoCloneTarget } from "@/lib/server/agent/repo-access";
import { forgeFor, isForgeApiError } from "@/lib/server/agent/forge";
import {
  authorizeRunPrRequest,
  imageBytesResponse,
  prFileBytesResponse,
} from "@/lib/server/agent/pr-actions";
import { imageMimeType } from "@/lib/diff-binary";

/**
 * Bytes of a run diff file (MIN-66) — what the diff view puts in
 * its `<img>` to show an edited image side by side.
 * GET ?path=…&side=base|head → the file, under the MIME type of its extension.
 *
 * Same sharing as the neighboring text route: with a PR, it is a FACADE of
 * `/api/pull-requests/[prId]/file/raw` ; WITHOUT PR, it is the base comparison…branch
 * working — the diff view IN the conversation, before any pull request.
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
  const side = request.nextUrl.searchParams.get("side");
  if (!path) return NextResponse.json({ error: "Path required" }, { status: 400 });
  if (side !== "base" && side !== "head") {
    return NextResponse.json({ error: "Side must be base or head" }, { status: 400 });
  }

  const auth = await authorizeRunPrRequest(request, runId);
  if (auth.ok) return prFileBytesResponse(auth.scope, path, side);
  if (!("noPr" in auth)) return auth.response;

  // ── Run without PR: the diff is the compare base…branch of work ──────────
  const contentType = imageMimeType(path);
  if (!contentType) {
    return NextResponse.json({ error: "Not a previewable image" }, { status: 415 });
  }

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

    const file = compared.files.find((f) => f.filename === path);
    if (!file) {
      return NextResponse.json({ error: "File not found in this diff" }, { status: 404 });
    }
    if (side === "base" && file.status === "added") {
      return NextResponse.json({ error: "File has no base version" }, { status: 404 });
    }
    if (side === "head" && file.status === "removed") {
      return NextResponse.json({ error: "File has no head version" }, { status: 404 });
    }

    // On the head side, the BRANCH: a session in progress is still growing, and it is
    // last state we want to show. The content at this URL therefore moves — hence
    // the `moving` passed below, which cuts the browser cache on that side.
    const ref =
      side === "head"
        ? head
        : await forge.getBranchesMergeBaseSha({
            token: target.token,
            repoFullName: target.repoFullName,
            base,
            head,
          });

    const bytes = await forge.getFileBytesAtRef({
      token: target.token,
      repoFullName: target.repoFullName,
      path: side === "base" ? basePathOf(file) : file.filename,
      ref,
    });
    if (bytes === null) {
      return NextResponse.json({ error: "File not found at this ref" }, { status: 404 });
    }
    return imageBytesResponse(bytes, contentType, side === "head");
  } catch (err) {
    const status = isForgeApiError(err) ? 502 : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
