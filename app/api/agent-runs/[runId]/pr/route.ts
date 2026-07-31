import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getProjectAccess } from "@/lib/server/project-access";
import { getRun, syncPrState } from "@/lib/server/agent/runs";
import { syncIssueStatusFromPr } from "@/lib/server/agent/issue-status-sync";
import { getServiceClient } from "@/lib/supabase-service";
import { insertEvents } from "@/lib/server/issue-events";
import { launchAgentRun, type LaunchResult } from "@/lib/server/agent/launch";
import { resolveRepoCloneTarget } from "@/lib/server/agent/repo-access";
import { forgeFor, isForgeApiError, type MergeMethod } from "@/lib/server/agent/forge";
import type { ReviewVerdict } from "@/lib/server/agent/pr";

/**
 * Review in-app de la PR/MR d'un run d'agent (MIN-46 + MIN-66 + MIN-68 + MIN-69
 * + MIN-138).
 *  GET  → metadata PR + fichiers/patches + checks CI + approbations + méthodes
 *         de merge offertes par la forge.
 *  POST → { action: 'merge', method? }                       (membre du projet requis)
 *       | { action: 'close' }
 *       | { action: 'ready_for_review' }                     → brouillon → prête
 *       | { action: 'review', verdict, message, relaunch?, model? }
 *         → soumet la review sur la forge ; avec `relaunch` (verdict
 *           `request_changes` seulement) lance EN PLUS une run froide qui hérite
 *           de la branche et de la PR (MIN-68).
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
 * accepter (merge), refuser (close), approuver ou demander des changements.
 * Acteur = le membre qui agit (jamais Numo). Les simples commentaires — et les
 * reviews de verdict « commenter » — n'en produisent volontairement aucune.
 * Best-effort : insertEvents avale ses erreurs, la synchro ne casse pas le flux.
 */
async function recordPrActionEvent(
  issueId: string,
  actorId: string,
  type: "pr_accepted" | "pr_rejected" | "pr_changes_requested" | "pr_approved",
  prNumber: number,
): Promise<void> {
  await insertEvents(getServiceClient(), [
    { issue_id: issueId, actor_id: actorId, type, to_value: String(prNumber) },
  ]);
}

/** Verdict de review → événement d'activité, ou null (« commenter » ne trace rien). */
function eventForVerdict(
  verdict: ReviewVerdict,
): "pr_approved" | "pr_changes_requested" | null {
  if (verdict === "approve") return "pr_approved";
  if (verdict === "request_changes") return "pr_changes_requested";
  return null;
}

const REVIEW_VERDICTS: readonly ReviewVerdict[] = ["approve", "request_changes", "comment"];

// `review` + relaunch lance une run froide et kicke le drain dans after() : il lui
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
    const scope = { token: target.token, repoFullName: target.repoFullName, number: run.pr_number };

    // Les approbations voyagent avec la PR et les fichiers ; les checks, eux,
    // ont besoin du SHA de tête, donc d'un deuxième temps. Une lecture
    // d'approbations en échec (tier GitLab sans l'API, permission retirée) ne
    // doit pas faire tomber la vue PR : elle vaut null, pas zéro.
    const [pr, files, reviews] = await Promise.all([
      forge.getPullRequest(scope),
      forge.listPullRequestFiles(scope),
      forge.listReviews(scope).catch(() => null),
    ]);

    // `checks: null` = INCONNU (permission refusée, appel en échec), distinct de
    // `checks.total === 0` = « ce dépôt n'a pas de CI ». `checksError` dit
    // laquelle des deux : un 403 est une permission que l'installation n'a pas
    // encore acceptée (mesuré — « Resource not accessible by integration »).
    let checks = null;
    let checksError: "forbidden" | "unknown" | null = null;
    if (pr.headSha) {
      try {
        checks = await forge.listChecks({ ...scope, sha: pr.headSha });
      } catch (err) {
        checksError = isForgeApiError(err) && err.status === 403 ? "forbidden" : "unknown";
      }
    }

    return NextResponse.json({
      pr,
      files,
      provider: target.provider,
      checks,
      checksError,
      reviews,
      mergeMethods: forge.mergeMethods,
    });
  } catch (err) {
    const status = isForgeApiError(err) ? 502 : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}

interface PrActionBody {
  action?: string;
  message?: string;
  model?: string;
  verdict?: string;
  relaunch?: boolean;
  method?: string;
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { runId } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  let body: PrActionBody;
  try {
    body = (await request.json()) as PrActionBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const action = body.action;
  if (
    action !== "merge" &&
    action !== "close" &&
    action !== "review" &&
    action !== "ready_for_review"
  ) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const run = await getRun(runId);
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  const access = await getProjectAccess(auth.user.id, run.project_id);
  if (!access?.isMember) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  if (run.pr_number == null) {
    return NextResponse.json({ error: "This run has no pull request" }, { status: 400 });
  }

  if (action === "review") {
    return submitReview(body, run, auth.user.id);
  }

  try {
    const target = await resolveRepoCloneTarget(run.project_id);
    if (!target) return NextResponse.json({ error: "No repository linked" }, { status: 409 });
    const forge = forgeFor(target.provider);
    const scope = { token: target.token, repoFullName: target.repoFullName, number: run.pr_number };

    if (action === "merge") {
      // La méthode vient de l'UI, qui n'offre que `forge.mergeMethods` : on la
      // revalide ici plutôt que de laisser la forge refuser en 422 opaque.
      const method = body.method as MergeMethod | undefined;
      if (method && !forge.mergeMethods.includes(method)) {
        return NextResponse.json(
          { error: "Unsupported merge method", code: "unsupportedMergeMethod" },
          { status: 400 },
        );
      }
      await forge.mergePullRequest({ ...scope, method });
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

    if (action === "ready_for_review") {
      // Le `nodeId` (clé de la mutation GraphQL GitHub) n'existe que sur le GET
      // d'UNE PR : on relit donc la PR avant de basculer.
      const pr = await forge.getPullRequest(scope);
      await forge.markReadyForReview({ ...scope, nodeId: pr.nodeId });
      // Même motif que merge/close : tous les runs de la PR, pas seulement celui-ci.
      await syncPrState({ repoFullName: target.repoFullName, prNumber: run.pr_number, prState: "open", provider: target.provider });
      // Une PR qui devient prête est prête à être RELUE → l'issue passe en revue
      // (elle était en cours tant que la PR restait brouillon).
      if (run.issue_id) {
        await syncIssueStatusFromPr({ issueId: run.issue_id, actorId: auth.user.id, prState: "open" });
      }
      return NextResponse.json({ ok: true, pr_state: "open" });
    }

    await forge.closePullRequest(scope);
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

/**
 * Soumet une review (MIN-138) et, si demandé, relance Numo dessus (MIN-68).
 *
 * Deux gestes distincts réunis en un : le verdict part sur la forge, et la case
 * « et relancer Numo » ouvre EN PLUS une run froide qui hérite de la branche et
 * de la PR — c'est ce que minddy sait faire et que GitHub ne sait pas.
 *
 * `published: "comment"` en retour = la forge a refusé de publier le verdict
 * (une App ne peut pas approuver sa propre PR : 422 mesuré). Le verdict est
 * quand même enregistré côté minddy, en activité de l'issue.
 */
async function submitReview(
  body: PrActionBody,
  run: NonNullable<Awaited<ReturnType<typeof getRun>>>,
  userId: string,
): Promise<NextResponse> {
  const prNumber = run.pr_number as number;
  const verdict = body.verdict as ReviewVerdict | undefined;
  if (!verdict || !REVIEW_VERDICTS.includes(verdict)) {
    return NextResponse.json({ error: "Invalid verdict" }, { status: 400 });
  }
  const message = typeof body.message === "string" ? body.message.trim() : "";
  // Un commentaire vide n'a rien à dire, et les deux forges le refusent ; une
  // approbation nue, elle, se passe très bien de message.
  if (!message && verdict !== "approve") {
    return NextResponse.json({ error: "Message required" }, { status: 400 });
  }
  // Relancer Numo n'a de sens que sur une demande de changements : il lui faut
  // une consigne, et approuver ne demande rien.
  const relaunch = !!body.relaunch && verdict === "request_changes";

  let launchedRunId: string | null = null;
  if (relaunch) {
    // Run CARNET (MIN-84) : pas de lignée à relancer à froid — la demande de
    // changements se fait en PARLANT à la session (sa conversation /steer, qui
    // re-vérifie le quota). Refus explicite plutôt qu'une relance impossible.
    if (!run.issue_id) {
      return NextResponse.json({ error: "notebookRun", code: "notebookRun" }, { status: 409 });
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
    // et poster la review avant eux laisserait une review orpheline sur la PR —
    // dupliquée à chaque retry de l'utilisateur.
    const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : undefined;
    const result = await launchAgentRun({
      issueId: run.issue_id,
      userId,
      triggeredBy: "button",
      prompt: message,
      model,
      forced: !!model,
    });
    if (!result.ok) return launchErrorResponse(result);
    launchedRunId = result.run.id;
  }

  let published: "review" | "comment" = "review";
  try {
    const target = await resolveRepoCloneTarget(run.project_id);
    if (!target) return NextResponse.json({ error: "No repository linked" }, { status: 409 });
    const result = await forgeFor(target.provider).submitReview({
      token: target.token,
      repoFullName: target.repoFullName,
      number: prNumber,
      verdict,
      body: message,
    });
    published = result.published;
  } catch (err) {
    // Avec relance : best-effort. La run est lancée et PORTE déjà le message
    // (prompt) — un échec de la forge ici ne doit pas faire croire que la demande
    // n'est pas partie. Sans relance, la review EST le seul effet : on le dit.
    if (!relaunch) {
      const status = isForgeApiError(err) ? 502 : 500;
      return NextResponse.json({ error: (err as Error).message }, { status });
    }
    console.error("[agent-pr] review post failed:", (err as Error).message);
    published = "comment";
  }

  // Le verdict RÉEL est tracé côté minddy même quand la forge l'a replié en
  // commentaire : c'est là que l'utilisateur lira « a approuvé la PR ».
  const eventType = eventForVerdict(verdict);
  if (run.issue_id && eventType) {
    await recordPrActionEvent(run.issue_id, userId, eventType, prNumber);
  }
  return NextResponse.json({
    ok: true,
    published,
    ...(launchedRunId ? { run: { id: launchedRunId } } : {}),
  });
}
