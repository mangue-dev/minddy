import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
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
 * Octets d'un fichier du diff d'un run (MIN-66) — ce que la vue diff met dans
 * ses `<img>` pour montrer une image modifiée côte à côte.
 *  GET ?path=…&side=base|head → le fichier, sous le type MIME de son extension.
 *
 * Même partage que la route texte voisine : avec une PR, c'est une FAÇADE de
 * `/api/pull-requests/[prId]/file/raw` ; SANS PR, c'est le compare base…branche
 * de travail — la vue diff DANS la conversation, avant toute pull request.
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
  const side = request.nextUrl.searchParams.get("side");
  if (!path) return NextResponse.json({ error: "Path required" }, { status: 400 });
  if (side !== "base" && side !== "head") {
    return NextResponse.json({ error: "Side must be base or head" }, { status: 400 });
  }

  const auth = await authorizeRunPrRequest(request, runId);
  if (auth.ok) return prFileBytesResponse(auth.scope, path, side);
  if (!("noPr" in auth)) return auth.response;

  // ── Run sans PR : le diff est le compare base…branche de travail ──────────
  const contentType = imageMimeType(path);
  if (!contentType) {
    return NextResponse.json({ error: "Not a previewable image" }, { status: 415 });
  }

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

    // Côté tête, la BRANCHE : une session en cours pousse encore, et c'est son
    // dernier état qu'on veut montrer. Le contenu à cette URL bouge donc — d'où
    // le `moving` passé plus bas, qui coupe le cache navigateur de ce côté-là.
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
