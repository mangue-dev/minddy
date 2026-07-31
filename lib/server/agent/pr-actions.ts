import "server-only";

import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { insertEvents } from "@/lib/server/issue-events";
import { launchAgentRun, type LaunchResult } from "@/lib/server/agent/launch";
import { syncIssueStatusFromPr } from "@/lib/server/agent/issue-status-sync";
import { resolveRepoCloneTargetForRepo, type RepoCloneTarget } from "./repo-access";
import { forgeFor, isForgeApiError, type Forge, type MergeMethod } from "./forge";
import { findRunsForPr, syncPrState } from "./runs";
import {
  findPullRequest,
  resolvePrForRun,
  rowProvider,
  upsertPullRequest,
  type PullRequestRow,
  type PullRequestState,
} from "./pull-requests";
import { getRun } from "./runs";
import type { PullRequestFile, ReviewVerdict } from "./pr";

/**
 * Gestes de review d'une pull request (MIN-143), indexés par PR et non par run.
 *
 * Toute la logique des anciennes routes `agent-runs/[runId]/pr/*` vit ici : ces
 * routes-là sont devenues des façades (run → sa PR → délègue), et les nouvelles
 * `pull-requests/[prId]/*` en sont les appelants directs. Une seule copie de
 * chaque geste, un seul endroit où l'erreur d'une forge se traduit en HTTP.
 *
 * Ce qui a changé de porteur : le ticket. `syncIssueStatusFromPr` et l'activité
 * lisent `pull_requests.issue_id`, plus `run.issue_id` — une PR humaine peut
 * porter un ticket, et une PR de Numo n'est plus la seule à en avoir un. Une PR
 * sans ticket ne synchronise rien et ne trace rien, silencieusement : c'est le
 * cas normal, pas une panne.
 */

/** Tout ce qu'il faut pour parler de CETTE PR à SA forge, avec un token frais. */
export interface PrScope {
  pr: PullRequestRow;
  target: RepoCloneTarget;
  forge: Forge;
  /** Raccourci du triplet que chaque appel de forge redemande. */
  call: { token: string; repoFullName: string; number: number };
}

/**
 * Résout l'accès de `userId` à `pr` et mint un token de forge, ou null s'il n'a
 * aucun projet qui lie ce dépôt (l'appelant en fait un 404).
 */
export async function resolvePrScope(
  userId: string,
  pr: PullRequestRow,
): Promise<PrScope | null> {
  const provider = rowProvider(pr);
  const target = await resolveRepoCloneTargetForRepo({
    userId,
    provider,
    repoFullName: pr.repo_full_name,
  });
  if (!target) return null;
  return {
    pr,
    target,
    forge: forgeFor(target.provider),
    call: { token: target.token, repoFullName: target.repoFullName, number: pr.number },
  };
}

export type PrRequestAuth =
  | { ok: true; scope: PrScope; userId: string }
  | { ok: false; response: NextResponse };

/** 404 unique des deux familles de routes : « cette PR n'existe pas pour vous ». */
function prNotFound(): NextResponse {
  return NextResponse.json({ error: "Pull request not found" }, { status: 404 });
}

/**
 * Auth + résolution d'une route `pull-requests/[prId]/…` : la seule chose que
 * ces routes font avant de déléguer.
 */
export async function authorizePrRequest(
  request: NextRequest,
  prId: string,
): Promise<PrRequestAuth> {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return { ok: false, response: auth.response };

  const pr = await findPullRequest(prId);
  if (!pr) return { ok: false, response: prNotFound() };

  const scope = await resolvePrScope(auth.user.id, pr);
  if (!scope) return { ok: false, response: prNotFound() };
  return { ok: true, scope, userId: auth.user.id };
}

/**
 * Même chose depuis un `runId` : ce que font les façades
 * `agent-runs/[runId]/pr/*`, gardées pour les deep-links `?run=` existants et
 * pour la vue diff de la conversation d'agent — les casser reviendrait à casser
 * `/agents`.
 *
 * `noPr` distingue « ce run n'a pas de PR » (réponse vide légitime sur les GET,
 * 400 sur les POST) de « run inconnu » (404).
 */
export async function authorizeRunPrRequest(
  request: NextRequest,
  runId: string,
): Promise<PrRequestAuth | { ok: false; noPr: true; response: NextResponse }> {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return { ok: false, response: auth.response };

  const run = await getRun(runId);
  if (!run) return { ok: false, response: NextResponse.json({ error: "Run not found" }, { status: 404 }) };

  const pr = await resolvePrForRun(run);
  if (!pr) {
    return {
      ok: false,
      noPr: true,
      response: NextResponse.json({ error: "This run has no pull request" }, { status: 400 }),
    };
  }

  const scope = await resolvePrScope(auth.user.id, pr);
  if (!scope) return { ok: false, response: prNotFound() };
  return { ok: true, scope, userId: auth.user.id };
}

/** Erreur de forge → status HTTP (502 = la forge a répondu non, 500 = nous). */
export function forgeErrorResponse(err: unknown): NextResponse {
  const status = isForgeApiError(err) ? 502 : 500;
  return NextResponse.json({ error: (err as Error).message }, { status });
}

// ── Détail ───────────────────────────────────────────────────────────────────

/**
 * GET du détail : metadata PR + fichiers/patches + checks CI + approbations +
 * méthodes de merge offertes par la forge.
 */
export async function prDetailResponse(scope: PrScope): Promise<NextResponse> {
  const { forge, call } = scope;
  try {
    // Les approbations voyagent avec la PR et les fichiers ; les checks, eux,
    // ont besoin du SHA de tête, donc d'un deuxième temps. Une lecture
    // d'approbations en échec (tier GitLab sans l'API, permission retirée) ne
    // doit pas faire tomber la vue PR : elle vaut null, pas zéro.
    const [pr, files, reviews] = await Promise.all([
      forge.getPullRequest(call),
      forge.listPullRequestFiles(call),
      forge.listReviews(call).catch(() => null),
    ]);

    // `checks: null` = INCONNU (permission refusée, appel en échec), distinct de
    // `checks.total === 0` = « ce dépôt n'a pas de CI ». `checksError` dit
    // laquelle des deux : un 403 est une permission que l'installation n'a pas
    // encore acceptée (mesuré — « Resource not accessible by integration »).
    let checks = null;
    let checksError: "forbidden" | "unknown" | null = null;
    if (pr.headSha) {
      try {
        checks = await forge.listChecks({ ...call, sha: pr.headSha });
      } catch (err) {
        checksError = isForgeApiError(err) && err.status === 403 ? "forbidden" : "unknown";
      }
    }

    return NextResponse.json({
      pr,
      files,
      provider: scope.target.provider,
      checks,
      checksError,
      reviews,
      mergeMethods: forge.mergeMethods,
    });
  } catch (err) {
    return forgeErrorResponse(err);
  }
}

// ── Fil de conversation ──────────────────────────────────────────────────────

export async function prCommentsResponse(scope: PrScope): Promise<NextResponse> {
  try {
    const comments = await scope.forge.listPullRequestComments(scope.call);
    return NextResponse.json({ comments });
  } catch (err) {
    return forgeErrorResponse(err);
  }
}

export async function createPrCommentResponse(
  scope: PrScope,
  body: string,
): Promise<NextResponse> {
  try {
    const comment = await scope.forge.createPullRequestComment({ ...scope.call, body });
    return NextResponse.json({ comment });
  } catch (err) {
    return forgeErrorResponse(err);
  }
}

// ── Commentaires de review (ancrés à une ligne) ──────────────────────────────

export async function prReviewCommentsResponse(scope: PrScope): Promise<NextResponse> {
  try {
    const comments = await scope.forge.listPullRequestReviewComments(scope.call);
    return NextResponse.json({ comments });
  } catch (err) {
    return forgeErrorResponse(err);
  }
}

export interface ReviewCommentPayload {
  body: string;
  path?: string;
  line?: number;
  side?: "LEFT" | "RIGHT";
  inReplyTo?: number;
}

/**
 * Valide le corps d'un POST de commentaire de review : soit une réponse dans un
 * fil (`in_reply_to`), soit une ancre (`path` + `line` + `side`).
 *
 * `in_reply_to` est validé comme un ENTIER, et pas seulement typé : il finit
 * interpolé dans l'URL de la forge. Une chaîne y glisserait des `..` (que
 * `fetch` normalise) et sortirait de `/repos/{owner}/{repo}/…` — or le token
 * d'installation porte TOUT le périmètre de l'installation, pas ce seul dépôt.
 */
export function parseReviewCommentPayload(
  raw: unknown,
): { ok: true; payload: ReviewCommentPayload } | { ok: false; response: NextResponse } {
  const p = (raw ?? {}) as {
    body?: unknown;
    path?: unknown;
    line?: unknown;
    side?: unknown;
    in_reply_to?: unknown;
  };
  const bad = (error: string) => ({
    ok: false as const,
    response: NextResponse.json({ error }, { status: 400 }),
  });

  const body = typeof p.body === "string" ? p.body.trim() : "";
  if (!body) return bad("Comment required");

  if (p.in_reply_to != null) {
    if (
      typeof p.in_reply_to !== "number" ||
      !Number.isInteger(p.in_reply_to) ||
      p.in_reply_to < 1
    ) {
      return bad("Invalid in_reply_to");
    }
    return { ok: true, payload: { body, inReplyTo: p.in_reply_to } };
  }

  if (typeof p.path !== "string" || !p.path) return bad("Path required");
  if (typeof p.line !== "number" || !Number.isInteger(p.line) || p.line < 1) {
    return bad("Line required");
  }
  if (p.side !== "LEFT" && p.side !== "RIGHT") return bad("Invalid side");
  return { ok: true, payload: { body, path: p.path, line: p.line, side: p.side } };
}

export async function createPrReviewCommentResponse(
  scope: PrScope,
  payload: ReviewCommentPayload,
): Promise<NextResponse> {
  try {
    if (payload.inReplyTo != null) {
      const comment = await scope.forge.replyToPullRequestReviewComment({
        ...scope.call,
        commentId: payload.inReplyTo,
        body: payload.body,
      });
      return NextResponse.json({ comment });
    }
    // L'ancre du commentaire est résolue PAR le provider (tête de PR relue à
    // chaud sur GitHub, diff_refs sur GitLab) — l'appelant n'a rien à pré-lire.
    const comment = await scope.forge.createPullRequestReviewComment({
      ...scope.call,
      body: payload.body,
      path: payload.path as string,
      line: payload.line as number,
      side: payload.side as "LEFT" | "RIGHT",
    });
    return NextResponse.json({ comment });
  } catch (err) {
    if (isForgeApiError(err) && err.status === 422) {
      // 422 = la forge refuse d'ancrer la ligne. Le cas normal est une ligne hors
      // diff, mais il survient aussi quand la tête a bougé sous l'utilisateur.
      // Code dédié : l'UI l'explique et GARDE le texte saisi, là où un 502
      // générique ressemblerait à une panne.
      return NextResponse.json({ error: err.message, code: "lineNotInDiff" }, { status: 422 });
    }
    return forgeErrorResponse(err);
  }
}

// ── Version base d'un fichier du diff ────────────────────────────────────────

/** Chemin qui adresse la version de base : l'ancien nom si le fichier a été renommé. */
function basePathOf(file: PullRequestFile): string {
  return file.previous_filename ?? file.filename;
}

/**
 * Texte brut d'un fichier au merge base — la source du dépliage de contexte de
 * la vue diff. Le chemin est validé contre les fichiers de CE diff : sans ça, la
 * route donnerait à lire n'importe quel fichier du dépôt.
 */
export async function prFileSourceResponse(
  scope: PrScope,
  path: string,
): Promise<NextResponse> {
  const { forge, call } = scope;
  try {
    const [pr, files] = await Promise.all([
      forge.getPullRequest(call),
      forge.listPullRequestFiles(call),
    ]);
    const base = pr.base;
    const head = pr.headSha ?? pr.head;
    if (!base || !head) {
      return NextResponse.json({ error: "Pull request has no base or head" }, { status: 409 });
    }

    // Un fichier ajouté n'a pas de version de base : son patch EST déjà le
    // fichier entier.
    const file = files.find((f) => basePathOf(f) === path);
    if (!file || file.status === "added") {
      return NextResponse.json({ error: "File not found in this diff" }, { status: 404 });
    }

    const ref = await forge.getMergeBaseSha({ ...call, base, head });
    const content = await forge.getFileAtRef({
      token: call.token,
      repoFullName: call.repoFullName,
      path,
      ref,
    });
    if (content === null) {
      return NextResponse.json({ error: "File not found at merge base" }, { status: 404 });
    }
    return NextResponse.json({ content });
  } catch (err) {
    return forgeErrorResponse(err);
  }
}

// ── Actions ──────────────────────────────────────────────────────────────────

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
 * Trace une action de review dans le journal d'activité du ticket lié :
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

export const REVIEW_VERDICTS: readonly ReviewVerdict[] = [
  "approve",
  "request_changes",
  "comment",
];

/**
 * Propage un nouvel état de PR : la table (source de vérité de l'état), TOUS les
 * runs qui la portent (le garde `prMerged` du steer les lit, et n'en marquer
 * qu'un les laisserait sur un état périmé), puis le statut du ticket.
 */
async function propagatePrState(
  scope: PrScope,
  state: PullRequestState,
  actorId: string,
): Promise<void> {
  await upsertPullRequest({
    provider: scope.target.provider,
    repoFullName: scope.target.repoFullName,
    number: scope.pr.number,
    state,
    mergedAt: state === "merged" ? new Date().toISOString() : scope.pr.merged_at,
  });
  await syncPrState({
    repoFullName: scope.target.repoFullName,
    prNumber: scope.pr.number,
    prState: state,
    provider: scope.target.provider,
  });
  if (scope.pr.issue_id) {
    await syncIssueStatusFromPr({ issueId: scope.pr.issue_id, actorId, prState: state });
  }
}

export interface PrActionBody {
  action?: string;
  message?: string;
  model?: string;
  verdict?: string;
  relaunch?: boolean;
  method?: string;
}

/** merge / close / ready_for_review — les gestes qui changent l'état de la PR. */
export async function prStateActionResponse(
  scope: PrScope,
  action: "merge" | "close" | "ready_for_review",
  body: PrActionBody,
  userId: string,
): Promise<NextResponse> {
  const { forge, call } = scope;
  try {
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
      await forge.mergePullRequest({ ...call, method });
      await propagatePrState(scope, "merged", userId);
      // Trace « a accepté la PR » dans l'activité du ticket lié.
      if (scope.pr.issue_id) {
        await recordPrActionEvent(scope.pr.issue_id, userId, "pr_accepted", scope.pr.number);
      }
      return NextResponse.json({ ok: true, pr_state: "merged" });
    }

    if (action === "ready_for_review") {
      // Le `nodeId` (clé de la mutation GraphQL GitHub) n'existe que sur le GET
      // d'UNE PR : on relit donc la PR avant de basculer.
      const pr = await forge.getPullRequest(call);
      await forge.markReadyForReview({ ...call, nodeId: pr.nodeId });
      // Une PR qui devient prête est prête à être RELUE → le ticket passe en
      // revue (il était en cours tant que la PR restait brouillon).
      await propagatePrState(scope, "open", userId);
      return NextResponse.json({ ok: true, pr_state: "open" });
    }

    await forge.closePullRequest(call);
    // PR refusée → le ticket retourne « à faire » (todo, jamais annulé) — MIN-46.
    await propagatePrState(scope, "closed", userId);
    if (scope.pr.issue_id) {
      await recordPrActionEvent(scope.pr.issue_id, userId, "pr_rejected", scope.pr.number);
    }
    return NextResponse.json({ ok: true, pr_state: "closed" });
  } catch (err) {
    return forgeErrorResponse(err);
  }
}

/**
 * Soumet une review (MIN-138) et, si demandé, relance Numo dessus (MIN-68).
 *
 * Deux gestes distincts réunis en un : le verdict part sur la forge, et la case
 * « et relancer Numo » ouvre EN PLUS une run froide qui hérite de la branche et
 * de la PR — c'est ce que minddy sait faire et que GitHub ne sait pas.
 *
 * La relance exige que la PR ait DÉJÀ un run : `inheritableWorkForIssue` cherche
 * le travail héritable dans les runs PRÉCÉDENTS du ticket, et une PR humaine
 * n'en a aucun — Numo repartirait sur une branche neuve au lieu de reprendre
 * celle de la PR. L'UI masque le geste ; ici on le refuse, plutôt que de le
 * laisser produire silencieusement un travail à côté de la plaque.
 *
 * `published: "comment"` en retour = la forge a refusé de publier le verdict
 * (une App ne peut pas approuver sa propre PR : 422 mesuré). Le verdict est
 * quand même enregistré côté minddy, en activité du ticket.
 */
export async function prReviewResponse(
  scope: PrScope,
  body: PrActionBody,
  userId: string,
): Promise<NextResponse> {
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
    if (!scope.pr.issue_id) {
      return NextResponse.json({ error: "noIssue", code: "noIssue" }, { status: 409 });
    }
    if (scope.pr.state === "merged") {
      return NextResponse.json(
        { error: "Pull request is merged", code: "prMerged" },
        { status: 409 },
      );
    }
    // Aucun run derrière cette PR : Numo n'a pas de branche à reprendre.
    const runs = await findRunsForPr({
      repoFullName: scope.target.repoFullName,
      prNumber: scope.pr.number,
      provider: scope.target.provider,
    });
    if (runs.length === 0) {
      return NextResponse.json({ error: "noAgentRun", code: "noAgentRun" }, { status: 409 });
    }

    // Lancement D'ABORD : ses gardes (run déjà actif, quota, dépôt) peuvent
    // refuser, et poster la review avant eux laisserait une review orpheline sur
    // la PR — dupliquée à chaque retry de l'utilisateur.
    const model =
      typeof body.model === "string" && body.model.trim() ? body.model.trim() : undefined;
    const result = await launchAgentRun({
      issueId: scope.pr.issue_id,
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
    const result = await scope.forge.submitReview({
      ...scope.call,
      verdict,
      body: message,
    });
    published = result.published;
  } catch (err) {
    // Avec relance : best-effort. La run est lancée et PORTE déjà le message
    // (prompt) — un échec de la forge ici ne doit pas faire croire que la
    // demande n'est pas partie. Sans relance, la review EST le seul effet : on
    // le dit.
    if (!relaunch) return forgeErrorResponse(err);
    console.error("[pr-actions] review post failed:", (err as Error).message);
    published = "comment";
  }

  // Le verdict RÉEL est tracé côté minddy même quand la forge l'a replié en
  // commentaire : c'est là que l'utilisateur lira « a approuvé la PR ».
  const eventType = eventForVerdict(verdict);
  if (scope.pr.issue_id && eventType) {
    await recordPrActionEvent(scope.pr.issue_id, userId, eventType, scope.pr.number);
  }
  return NextResponse.json({
    ok: true,
    published,
    ...(launchedRunId ? { run: { id: launchedRunId } } : {}),
  });
}
