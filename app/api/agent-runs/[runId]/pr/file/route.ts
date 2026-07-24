import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import { getRun } from "@/lib/server/agent/runs";
import { resolveRepoCloneTarget } from "@/lib/server/agent/repo-access";
import { forgeFor, isForgeApiError } from "@/lib/server/agent/forge";

/**
 * Version BASE d'un fichier du diff d'un run — la source dont la vue diff a
 * besoin pour déplier le contexte masqué autour des hunks (façon GitHub).
 *  GET ?path=… → { content } (texte brut du fichier au merge base).
 *
 * Deux sources, selon l'état du run : les fichiers de sa PR quand elle existe,
 * sinon le compare base...branche de travail (vue diff DANS la conversation,
 * avant toute PR). Appelée à la demande, au premier dépliage d'un fichier :
 * ouvrir un diff n'en déclenche aucune. Le chemin demandé est validé contre les
 * fichiers de CE diff — sinon la route donnerait à lire n'importe quel fichier
 * du dépôt.
 */

type RouteContext = { params: Promise<{ runId: string }> };

export const maxDuration = 60;

/** Chemin qui adresse la version de base : l'ancien nom si le fichier a été renommé. */
function basePathOf(file: { filename: string; previous_filename?: string }): string {
  return file.previous_filename ?? file.filename;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { runId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const path = request.nextUrl.searchParams.get("path");
  if (!path) return NextResponse.json({ error: "Path required" }, { status: 400 });

  const run = await getRun(runId);
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  const access = await getProjectAccess(auth.user.id, run.project_id);
  if (!access) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  const prNumber = run.pr_number;
  if (prNumber == null && !run.branch_name) {
    return NextResponse.json({ error: "This run has no diff" }, { status: 400 });
  }

  try {
    const target = await resolveRepoCloneTarget(run.project_id);
    if (!target) return NextResponse.json({ error: "No repository linked" }, { status: 409 });
    const forge = forgeFor(target.provider);

    // Fichiers du diff + résolveur du ref de base — différé APRÈS la validation
    // du chemin : pas d'appel merge base pour un chemin qui n'est pas du diff.
    let files: Awaited<ReturnType<typeof forge.listPullRequestFiles>>;
    let resolveRef: () => Promise<string>;
    if (prNumber != null) {
      const [pr, prFiles] = await Promise.all([
        forge.getPullRequest({ token: target.token, repoFullName: target.repoFullName, number: prNumber }),
        forge.listPullRequestFiles({ token: target.token, repoFullName: target.repoFullName, number: prNumber }),
      ]);
      const base = pr.base;
      const head = pr.headSha ?? pr.head;
      if (!base || !head) {
        return NextResponse.json({ error: "Pull request has no base or head" }, { status: 409 });
      }
      files = prFiles;
      resolveRef = () =>
        forge.getMergeBaseSha({
          token: target.token,
          repoFullName: target.repoFullName,
          number: prNumber,
          base,
          head,
        });
    } else {
      // Sans PR : le diff est le compare base...branche de travail (vue diff de
      // la conversation) — même validation, merge base de BRANCHES pour le ref.
      const base = run.base_branch ?? target.defaultBranch;
      const head = run.branch_name;
      if (!head) return NextResponse.json({ error: "This run has no diff" }, { status: 400 });
      const compared = await forge.compareBranches({
        token: target.token,
        repoFullName: target.repoFullName,
        base,
        head,
      });
      files = compared.files;
      resolveRef = () =>
        forge.getBranchesMergeBaseSha({
          token: target.token,
          repoFullName: target.repoFullName,
          base,
          head,
        });
    }

    // Le chemin doit être celui d'un fichier du diff, côté base. Un fichier
    // ajouté n'a pas de version de base : son patch EST déjà le fichier entier.
    const file = files.find((f) => basePathOf(f) === path);
    if (!file || file.status === "added") {
      return NextResponse.json({ error: "File not found in this diff" }, { status: 404 });
    }

    const ref = await resolveRef();
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
