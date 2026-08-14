import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { canReadAgentRun } from "@/lib/server/agent/run-access";
import { getRun } from "@/lib/server/agent/runs";
import { resolveRepoCloneTarget } from "@/lib/server/agent/repo-access";
import { forgeFor, isForgeApiError } from "@/lib/server/agent/forge";
import { getAgentSandboxByName, sandboxHost } from "@/lib/server/agent/sandbox";
import { readWorkingDiff, resolveBaseRef } from "@/lib/server/agent/working-diff";

/**
 * Diff VIVANT d'un run d'agent — la vue diff DANS la conversation, sans attendre
 * la PR. GET → `{ files, provider, url, live }`.
 *
 * DEUX SOURCES, et laquelle répond dépend de ce que le run est en train de faire :
 *
 *  • **le tour tourne** → la SANDBOX. `git diff origin/<base>` dans la microVM du
 *    run couvre les commits des tours passés ET l'arbre de travail : c'est le seul
 *    endroit qui sache ce que l'agent vient d'écrire. Sans elle, cliquer un
 *    fichier que le fil venait d'annoncer ouvrait l'état d'AVANT — ou rien du tout
 *    au premier tour, la branche n'existant pas encore côté forge (MIN-266).
 *  • **au repos** (ou sandbox injoignable, ou session de RELECTURE, qui n'écrit
 *    pas dans le dépôt) → la FORGE : les fichiers/patches de la PR quand elle
 *    existe, sinon le compare `base...branche`. C'est le travail poussé, et au
 *    repos il n'y a rien d'autre à montrer.
 *
 * Le repli n'est jamais une erreur : une sandbox endormie, expirée ou en train de
 * committer rend simplement une liste vide, et la forge reprend la main.
 * `live: true` dit laquelle a répondu — l'interface l'annonce, un diff qui inclut
 * du travail non poussé ne se lit pas comme un diff de PR.
 *
 * `?stat=1` sert l'EN-TÊTE de la conversation : les mêmes fichiers SANS leurs
 * patches. Il se redemande toutes les quelques secondes pendant le tour, et deux
 * passes `git diff` courtes ne sont pas le même objet que plusieurs mégaoctets de
 * texte.
 */

type RouteContext = { params: Promise<{ runId: string }> };

export const maxDuration = 60;

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { runId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const run = await getRun(runId);
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  if (!(await canReadAgentRun(auth.user.id, run))) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const patches = request.nextUrl.searchParams.get("stat") !== "1";

  // Le tour tourne et la microVM écrit : c'est elle qui sait. Une session de
  // relecture est exclue — elle ne touche pas au dépôt, et son diff EST celui de
  // la pull request qu'elle lit.
  const working = run.status === "queued" || run.status === "running";
  if (working && run.sandbox_id && run.pull_request_id == null) {
    const live = await readLiveDiff(run.sandbox_id, run.base_branch, patches);
    if (live && live.files.length > 0) {
      return NextResponse.json({ ...live, url: run.pr_url ?? null, live: true });
    }
  }

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
      const { files, truncated } = await forge.listPullRequestFiles({
        token: target.token,
        repoFullName: target.repoFullName,
        number: run.pr_number,
      });
      return NextResponse.json({
        files,
        truncated,
        provider: target.provider,
        url: run.pr_url,
      });
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

/**
 * Le diff lu dans la microVM, ou `null` si elle n'a rien à dire. Aucune erreur
 * ne remonte : ce chemin est un BONUS sur celui de la forge, et une microVM
 * injoignable doit faire un repli silencieux, pas une vue diff en panne.
 *
 * La base du diff se résout DANS le clone (`resolveBaseRef`) plutôt que via la
 * forge : `?stat=1` revient toutes les quelques secondes pendant le tour, et
 * minter un token d'installation à chaque passage pour n'apprendre qu'un nom de
 * branche par défaut serait payer cher un fait que git a sous la main.
 */
async function readLiveDiff(
  sandboxId: string,
  baseBranch: string | null,
  patches: boolean,
): Promise<{ files: unknown[]; truncated: boolean } | null> {
  try {
    const sandbox = await getAgentSandboxByName(sandboxId);
    if (!sandbox) return null;
    const host = sandboxHost(sandbox);
    const baseRef = await resolveBaseRef(host, baseBranch);
    if (!baseRef) return null;
    return await readWorkingDiff(host, baseRef, { patches });
  } catch {
    return null;
  }
}
