import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import { getRun } from "@/lib/server/agent/runs";
import { resolveRepoCloneTarget } from "@/lib/server/agent/repo-access";
import { forgeFor, isForgeApiError } from "@/lib/server/agent/forge";
import {
  authorizeRunPrRequest,
  prFileSourceResponse,
} from "@/lib/server/agent/pr-actions";

/**
 * Version BASE d'un fichier du diff d'un run — la source dont la vue diff a
 * besoin pour déplier le contexte masqué autour des hunks (façon GitHub).
 *  GET ?path=… → { content } (texte brut du fichier au merge base).
 *
 * Deux sources, selon l'état du run. Avec une PR, c'est une FAÇADE (MIN-143) de
 * `/api/pull-requests/[prId]/file`. SANS PR, c'est le compare base…branche de
 * travail — la vue diff DANS la conversation, avant toute pull request : elle
 * n'a aucune PR à adresser, et reste donc servie ici, indexée par le run.
 */

type RouteContext = { params: Promise<{ runId: string }> };

export const maxDuration = 60;

/** Chemin qui adresse la version de base : l'ancien nom si le fichier a été renommé. */
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

  // ── Run sans PR : le diff est le compare base…branche de travail ──────────
  const user = await getAuthedUser(request);
  if (!user.ok) return user.response;

  const run = await getRun(runId);
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  const access = await getProjectAccess(user.user.id, run.project_id);
  if (!access) return NextResponse.json({ error: "Run not found" }, { status: 404 });

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

    // Le chemin doit être celui d'un fichier du diff, côté base. Un fichier
    // ajouté n'a pas de version de base : son patch EST déjà le fichier entier.
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
