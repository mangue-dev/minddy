import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import { getRun, syncPrState } from "@/lib/server/agent/runs";
import { syncIssueStatusFromPr } from "@/lib/server/agent/issue-status-sync";
import { getServiceClient } from "@/lib/supabase-service";
import { insertEvents } from "@/lib/server/issue-events";
import { launchAgentRun, type LaunchResult } from "@/lib/server/agent/launch";
import { resolveRepoCloneTarget } from "@/lib/server/agent/repo-access";
import { forgeFor, isForgeApiError } from "@/lib/server/agent/forge";

/**
 * Review in-app de la PR/MR d'un run d'agent (MIN-46 + MIN-66 + MIN-68 + MIN-69).
 *  GET  → metadata PR + fichiers/patches (diff rendu dans minddy) + provider.
 *  POST → { action: 'merge' | 'close' }                    (membre du projet requis)
 *       | { action: 'request_changes', message, model? }   → poste la review sur la
 *         PR puis lance une NOUVELLE run froide qui hérite de cette PR (MIN-68).
 * Les opérations passent par le client du provider (`forgeFor`) : GitHub (token
 * d'installation) ou GitLab (access token OAuth), minté à la volée.
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

/**
 * Trace une action de review PR dans le journal d'activité de l'issue liée :
 * accepter (merge), refuser (close) ou demander des changements. Acteur = le
 * membre qui agit (jamais Numo). Les simples commentaires GitHub passent par
 * une autre route (/comments) et ne produisent volontairement aucune activité.
 * Best-effort : insertEvents avale ses erreurs, la synchro ne casse pas le flux.
 */
async function recordPrActionEvent(
  issueId: string,
  actorId: string,
  type: "pr_accepted" | "pr_rejected" | "pr_changes_requested",
  prNumber: number,
): Promise<void> {
  await insertEvents(getServiceClient(), [
    { issue_id: issueId, actor_id: actorId, type, to_value: String(prNumber) },
  ]);
}

// `request_changes` lance une run froide et kicke le drain dans after() : il lui
// faut la fenêtre complète du drain (270 s de budget), sinon le premier chunk est
// tué en plein round — même raison que le 300 de /api/issues/[id]/agent.
export const maxDuration = 300;

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
    const forge = forgeFor(target.provider);

    const [pr, files] = await Promise.all([
      forge.getPullRequest({ token: target.token, repoFullName: target.repoFullName, number: run.pr_number }),
      forge.listPullRequestFiles({ token: target.token, repoFullName: target.repoFullName, number: run.pr_number }),
    ]);
    return NextResponse.json({ pr, files, provider: target.provider });
  } catch (err) {
    const status = isForgeApiError(err) ? 502 : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { runId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  let body: { action?: string; message?: string; model?: string };
  try {
    body = (await request.json()) as { action?: string; message?: string; model?: string };
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

  // Demande de changements : NOUVELLE run froide (MIN-68), avec son propre modèle.
  // Elle hérite de la branche et de la PR (`launchAgentRun` → inheritableWorkForIssue)
  // → même PR mise à jour, et rouverte si elle avait été refusée. Interdit après un
  // merge : le travail est livré, une relance forkerait une nouvelle PR — ce que ce
  // bouton ne promet pas.
  if (action === "request_changes") {
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) return NextResponse.json({ error: "Message required" }, { status: 400 });
    // Run CARNET (MIN-84) : pas de lignée à relancer à froid — la demande de
    // changements se fait en PARLANT à la session (sa conversation /steer, qui
    // re-vérifie le quota). Refus explicite plutôt qu'une relance impossible.
    if (!run.issue_id) {
      return NextResponse.json(
        { error: "notebookRun", code: "notebookRun" },
        { status: 409 },
      );
    }
    if (run.pr_state === "merged") {
      return NextResponse.json(
        { error: "Pull request is merged", code: "prMerged" },
        { status: 409 },
      );
    }
    if (!run.branch_name) {
      return NextResponse.json({ error: "Run has no branch", code: "noBranch" }, { status: 409 });
    }

    // Lancement D'ABORD : ses gardes (run déjà actif, quota, dépôt) peuvent refuser,
    // et poster le commentaire GitHub avant eux laisserait une review orpheline sur
    // la PR — dupliquée à chaque retry de l'utilisateur.
    const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : undefined;
    const result = await launchAgentRun({
      issueId: run.issue_id,
      userId: auth.user.id,
      triggeredBy: "button",
      prompt: message,
      model,
      forced: !!model,
    });
    if (!result.ok) return launchErrorResponse(result);

    // Le message est visible sur la PR (fil GitHub) en plus d'être la consigne du
    // run. Best-effort : la run est lancée et PORTE déjà le message (prompt) — un
    // échec GitHub ici ne doit pas faire croire que la demande n'est pas partie.
    try {
      const target = await resolveRepoCloneTarget(run.project_id);
      if (target) {
        await forgeFor(target.provider).createPullRequestComment({
          token: target.token,
          repoFullName: target.repoFullName,
          number: run.pr_number,
          body: message,
        });
      }
    } catch (err) {
      console.error("[agent-pr] request_changes PR comment failed:", (err as Error).message);
    }

    // Trace « a demandé des changements sur la PR » dans l'activité de l'issue.
    await recordPrActionEvent(run.issue_id, auth.user.id, "pr_changes_requested", run.pr_number);
    return NextResponse.json({ ok: true, run: { id: result.run.id } });
  }

  try {
    const target = await resolveRepoCloneTarget(run.project_id);
    if (!target) return NextResponse.json({ error: "No repository linked" }, { status: 409 });
    const forge = forgeFor(target.provider);

    if (action === "merge") {
      await forge.mergePullRequest({ token: target.token, repoFullName: target.repoFullName, number: run.pr_number });
      // Stampe TOUS les runs qui portent cette PR (une issue en enchaîne plusieurs
      // sur la même PR) : n'en marquer qu'un laisserait les frères sur un pr_state
      // périmé — le garde `prMerged` du steer serait contournable jusqu'à l'écho
      // du webhook (qui peut ne jamais arriver en dev).
      await syncPrState({ repoFullName: target.repoFullName, prNumber: run.pr_number, prState: "merged", provider: target.provider });
      // PR mergée → l'issue passe en done (MIN-46). Acteur = le membre qui merge.
      // Run carnet : pas d'issue — rien à synchroniser ni à tracer.
      if (run.issue_id) {
        await syncIssueStatusFromPr({ issueId: run.issue_id, actorId: auth.user.id, prState: "merged" });
        // Trace « a accepté la PR » dans l'activité de l'issue.
        await recordPrActionEvent(run.issue_id, auth.user.id, "pr_accepted", run.pr_number);
      }
      return NextResponse.json({ ok: true, pr_state: "merged" });
    }
    await forge.closePullRequest({ token: target.token, repoFullName: target.repoFullName, number: run.pr_number });
    // Comme pour merge : tous les runs de la PR, pas seulement celui-ci.
    await syncPrState({ repoFullName: target.repoFullName, prNumber: run.pr_number, prState: "closed", provider: target.provider });
    // PR refusée → l'issue retourne « à faire » (todo, jamais annulée) — MIN-46.
    if (run.issue_id) {
      await syncIssueStatusFromPr({ issueId: run.issue_id, actorId: auth.user.id, prState: "closed" });
      // Trace « a refusé la PR » dans l'activité de l'issue.
      await recordPrActionEvent(run.issue_id, auth.user.id, "pr_rejected", run.pr_number);
    }
    return NextResponse.json({ ok: true, pr_state: "closed" });
  } catch (err) {
    const status = isForgeApiError(err) ? 502 : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
