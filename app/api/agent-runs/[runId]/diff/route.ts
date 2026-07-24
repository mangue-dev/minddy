import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import { getRun } from "@/lib/server/agent/runs";
import { resolveRepoCloneTarget } from "@/lib/server/agent/repo-access";
import { forgeFor, isForgeApiError } from "@/lib/server/agent/forge";

/**
 * Diff VIVANT d'un run d'agent — la vue diff DANS la conversation, sans attendre
 * la PR.
 *  GET → { files, provider, url } : les fichiers/patches de la PR quand elle
 *  existe, sinon le compare base...branche de travail. C'est le travail POUSSÉ :
 *  l'agent pousse à chaque fin de tour, le diff se rafraîchit à cette cadence
 *  (le live du tour en cours reste la barre de fichiers, reconstruite des
 *  tool-calls). Branche jamais poussée → { files: [] } : rien à montrer, pas une
 *  erreur.
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

  // Ni PR ni branche stampée (run à peine lancée) : diff vide, pas une erreur.
  const head = run.branch_name;
  if (run.pr_number == null && !head) {
    return NextResponse.json({ files: [], url: null });
  }

  try {
    const target = await resolveRepoCloneTarget(run.project_id);
    if (!target) return NextResponse.json({ error: "No repository linked" }, { status: 409 });
    const forge = forgeFor(target.provider);

    // Une PR existe → son diff fait foi (même source que la page Pull requests).
    if (run.pr_number != null) {
      const files = await forge.listPullRequestFiles({
        token: target.token,
        repoFullName: target.repoFullName,
        number: run.pr_number,
      });
      return NextResponse.json({ files, provider: target.provider, url: run.pr_url });
    }

    // `head` est forcément là (garde plus haut) — TS ne le déduit pas du combiné.
    if (!head) return NextResponse.json({ files: [], url: null });
    const { files, url } = await forge.compareBranches({
      token: target.token,
      repoFullName: target.repoFullName,
      base: run.base_branch ?? target.defaultBranch,
      head,
    });
    return NextResponse.json({ files, provider: target.provider, url });
  } catch (err) {
    // Branche pas encore poussée (ou supprimée depuis) : diff vide, pas une erreur.
    if (isForgeApiError(err) && err.status === 404) {
      return NextResponse.json({ files: [], url: null });
    }
    const status = isForgeApiError(err) ? 502 : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
