import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { insertEvents } from "@/lib/server/issue-events";
import { ensureAgentsAllowed } from "@/lib/server/entitlements";
import { isPlanLimitError, planLimitResponse } from "@/lib/server/plan-limit-error";
import { ensureUsageBudget } from "@/lib/server/usage";
import { launchAgentRun, type LaunchResult } from "@/lib/server/agent/launch";
import { syncIssueStatusFromPr } from "@/lib/server/agent/issue-status-sync";
import { runPrAiReview } from "./pr-ai-review";
import { resolveRepoCloneTargetForRepo, type RepoCloneTarget } from "./repo-access";
import { resolveForgeActor, type ForgeActor } from "@/lib/server/git/forge-actor";
import { isGithubUserAuthConfigured } from "@/lib/server/git/github-user-auth";
import { isGitlabConfigured } from "@/lib/server/git/gitlab-app";
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
import {
  isReviewReactionContent,
  type ReviewReactionContent,
} from "@/lib/pr-review-reactions";

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
  /**
   * Le compte git de l'utilisateur, sous lequel partent les gestes HUMAINS
   * (MIN-144). PARESSEUX et mémoïsé pour la requête : `resolvePrScope` est
   * traversé par TOUTES les routes PR — `/comments`, `/review-comments`,
   * `/file`, et le détail qui re-poll toutes les 15 s pendant une CI — et y
   * résoudre l'acteur d'office ajouterait un aller-retour de forge (plus,
   * parfois, un refresh de token) à chacune.
   */
  actor: () => Promise<ForgeActor>;
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

  let pending: Promise<ForgeActor> | null = null;
  return {
    pr,
    target,
    forge: forgeFor(target.provider),
    call: { token: target.token, repoFullName: target.repoFullName, number: pr.number },
    // Ne rejette JAMAIS : une panne de résolution vaut « aucun compte » (donc
    // une 403 qui invite à reconnecter, ou un bandeau), jamais une 500 qui
    // ferait tomber la vue PR entière.
    actor: () =>
      (pending ??= resolveForgeActor({
        userId,
        provider: target.provider,
        repoFullName: target.repoFullName,
      }).catch((err) => {
        console.error("[pr-actions] actor unresolved:", (err as Error).message);
        return { kind: "none", reason: "noAccount" } as ForgeActor;
      })),
  };
}

/** Le triplet d'appel de forge, mais signé par l'utilisateur au lieu de l'App. */
export function actorCall(
  actor: Extract<ForgeActor, { kind: "actor" }>,
  scope: PrScope,
): { token: string; repoFullName: string; number: number } {
  return {
    token: actor.token,
    repoFullName: scope.target.repoFullName,
    number: scope.pr.number,
  };
}

/** Réponses de refus d'identité, dans l'ordre où l'utilisateur les rencontre. */
const ACTOR_ERROR_KEYS = {
  noAccount: "gitAccountRequired",
  noRepoAccess: "gitRepoAccessRequired",
  noWriteAccess: "gitWriteAccessRequired",
} as const;

/**
 * L'acteur, ou la 403 qui explique pourquoi il n'y en a pas. Le message est
 * traduit ICI (serveur) : c'est `err.message` que le client affiche en toast,
 * comme pour `prAiReviewResponse`.
 *
 * Les POST/PATCH refont ce contrôle même si l'UI l'a déjà fait : le cache est
 * chaud, le coût est nul, et l'UI n'est jamais la garde.
 */
export async function requireActor(
  scope: PrScope,
  need: "read" | "write",
): Promise<
  | { ok: true; actor: Extract<ForgeActor, { kind: "actor" }> }
  | { ok: false; response: NextResponse }
> {
  const actor = await scope.actor();
  const reason =
    actor.kind === "none"
      ? actor.reason
      : need === "write" && actor.capability !== "write"
        ? "noWriteAccess"
        : null;
  if (!reason) {
    return { ok: true, actor: actor as Extract<ForgeActor, { kind: "actor" }> };
  }

  const code = ACTOR_ERROR_KEYS[reason];
  const t = await getTranslations("ApiErrors");
  return {
    ok: false,
    response: NextResponse.json(
      { error: t(code, { repo: scope.target.repoFullName }), code },
      { status: 403 },
    ),
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
 * Ce que l'utilisateur COURANT peut faire sur cette PR (MIN-144) — la seule
 * lecture qui résout l'acteur, pour que « vous n'êtes pas membre » se découvre à
 * l'ouverture du panneau et non au premier clic.
 */
export interface PrViewer {
  provider: "github" | "gitlab";
  /** Le provider a-t-il de quoi autoriser un compte (env posées) ? */
  configured: boolean;
  connected: boolean;
  login: string | null;
  capability: "write" | "read" | "none";
}

async function resolveViewer(scope: PrScope): Promise<PrViewer> {
  const provider = scope.target.provider;
  const configured =
    provider === "github" ? isGithubUserAuthConfigured() : isGitlabConfigured();
  // `scope.actor()` ne rejette jamais : un échec de résolution vaut
  // `capability: "none"`, exactement comme `reviews` vaut null.
  const actor = await scope.actor();
  if (actor.kind === "actor") {
    return {
      provider,
      configured,
      connected: true,
      login: actor.login,
      capability: actor.capability,
    };
  }
  return {
    provider,
    configured,
    // « Pas membre du dépôt » suppose un compte connecté — le distinguer de
    // « aucun compte » est tout l'objet des deux états d'UI.
    connected: actor.reason === "noRepoAccess",
    login: actor.login ?? null,
    capability: "none",
  };
}

/**
 * GET du détail : metadata PR + fichiers/patches + checks CI + approbations +
 * méthodes de merge offertes par la forge, et ce que le lecteur a le droit d'y
 * faire (`viewer`).
 *
 * Les lectures restent sur le token d'INSTALLATION : tout membre du projet
 * minddy continue de VOIR la PR même sans compte git connecté. Seules les
 * écritures humaines changent de porteur.
 */
export async function prDetailResponse(scope: PrScope): Promise<NextResponse> {
  const { forge, call } = scope;
  try {
    // Les approbations voyagent avec la PR et les fichiers ; les checks, eux,
    // ont besoin du SHA de tête, donc d'un deuxième temps. Une lecture
    // d'approbations en échec (tier GitLab sans l'API, permission retirée) ne
    // doit pas faire tomber la vue PR : elle vaut null, pas zéro.
    const [pr, files, reviews, viewer] = await Promise.all([
      forge.getPullRequest(call),
      forge.listPullRequestFiles(call),
      forge.listReviews(call).catch(() => null),
      resolveViewer(scope),
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
      viewer,
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
  // Geste humain : il part du compte git de la personne, pas de `minddy-app[bot]`.
  const actor = await requireActor(scope, "read");
  if (!actor.ok) return actor.response;
  try {
    const comment = await scope.forge.createPullRequestComment({
      ...actorCall(actor.actor, scope),
      body,
    });
    return NextResponse.json({ comment });
  } catch (err) {
    return forgeErrorResponse(err);
  }
}

// ── Commentaires de review (ancrés à une ligne) ──────────────────────────────

/**
 * Les commentaires de review ET l'état de résolution de leurs fils (MIN-139),
 * en un seul aller-retour : le client a besoin des deux pour rendre un fil.
 *
 * Les fils sont best-effort — un échec (GraphQL indisponible, tier GitLab
 * inattendu) rend `threads: []`, donc des fils d'état INCONNU : les commentaires
 * s'affichent, seule l'affordance « Résoudre » disparaît. L'inverse — faire
 * tomber toute la vue parce qu'un état de résolution manque — coûterait bien
 * plus que ce qu'il protège.
 *
 * Seules les RÉACTIONS se lisent sous le compte de la personne (MIN-145) : leur
 * `mine` dépend de qui regarde, ce qui fait de cette route la seconde à résoudre
 * l'acteur après le détail — assumé, le cache de capability est déjà chaud. Les
 * commentaires et les fils, eux, restent sur le token d'installation : ils ne
 * dépendent d'aucune identité, et tout membre du projet minddy doit continuer de
 * VOIR la review sans compte git connecté.
 */
export async function prReviewCommentsResponse(scope: PrScope): Promise<NextResponse> {
  try {
    const [comments, threads, actor] = await Promise.all([
      scope.forge.listPullRequestReviewComments(scope.call),
      scope.forge.listReviewThreads(scope.call).catch((err) => {
        console.error("[pr-actions] review threads unreadable:", (err as Error).message);
        return [];
      }),
      scope.actor(),
    ]);
    // Les réactions viennent APRÈS : côté GitLab elles s'interrogent note par
    // note, donc il faut d'abord savoir quelles notes existent. Sans commentaire,
    // rien à demander — une PR sans review ne doit rien coûter. Best-effort au
    // même titre que les fils : une réaction illisible ne vaut pas une vue vide.
    //
    // Sans acteur, on lit quand même — masquer les compteurs ferait croire qu'il
    // n'y a pas de réaction — mais avec `viewerIsActor: false` : le « j'ai
    // réagi » du token d'installation est celui du BOT, et le rendre tel quel
    // allumerait chez tout le monde une réaction que personne n'a posée.
    const viewerIsActor = actor.kind === "actor";
    const reactions = comments.length
      ? await scope.forge
          .listReviewCommentReactions({
            ...(viewerIsActor ? actorCall(actor, scope) : scope.call),
            commentIds: comments.map((c) => c.id),
            viewerIsActor,
          })
          .catch((err) => {
            console.error("[pr-actions] review reactions unreadable:", (err as Error).message);
            return [];
          })
      : [];
    return NextResponse.json({ comments, threads, reactions });
  } catch (err) {
    return forgeErrorResponse(err);
  }
}

/**
 * Valide un PATCH de résolution de fil. `thread_id` est un identifiant OPAQUE
 * qui finit interpolé dans une URL (GitLab) ou dans une variable GraphQL
 * (GitHub) : même vigilance que `in_reply_to`, on le contraint à l'alphabet des
 * deux forges (hexadécimal GitLab, node id GitHub) plutôt que de faire confiance
 * au type. Un `..` n'y passe pas.
 */
export function parseReviewThreadPayload(
  raw: unknown,
): { ok: true; payload: { threadId: string; resolved: boolean } } | { ok: false; response: NextResponse } {
  const p = (raw ?? {}) as { thread_id?: unknown; resolved?: unknown };
  const bad = (error: string) => ({
    ok: false as const,
    response: NextResponse.json({ error }, { status: 400 }),
  });

  if (typeof p.thread_id !== "string" || !/^[A-Za-z0-9_=-]{1,255}$/.test(p.thread_id)) {
    return bad("Invalid thread_id");
  }
  if (typeof p.resolved !== "boolean") return bad("Invalid resolved");
  return { ok: true, payload: { threadId: p.thread_id, resolved: p.resolved } };
}

export async function setPrReviewThreadResolvedResponse(
  scope: PrScope,
  payload: { threadId: string; resolved: boolean },
): Promise<NextResponse> {
  // Résoudre un fil est le symptôme MESURÉ en MIN-139 (`resolvedBy:
  // "minddy-app[bot]"`). C'est un geste d'écriture sur le dépôt : `write`.
  const actor = await requireActor(scope, "write");
  if (!actor.ok) return actor.response;
  try {
    await scope.forge.setReviewThreadResolved({
      ...actorCall(actor.actor, scope),
      ...payload,
    });
    return NextResponse.json({ ok: true, resolved: payload.resolved });
  } catch (err) {
    return forgeErrorResponse(err);
  }
}

/**
 * Valide un POST de réaction (MIN-139). `comment_id` finit interpolé dans une URL
 * de forge — même vigilance que `in_reply_to` : un ENTIER, vérifié comme tel.
 * `content` est refermé sur les huit valeurs du vocabulaire canonique.
 */
export function parseReactionPayload(
  raw: unknown,
):
  | { ok: true; payload: { commentId: number; content: ReviewReactionContent; on: boolean } }
  | { ok: false; response: NextResponse } {
  const p = (raw ?? {}) as { comment_id?: unknown; content?: unknown; on?: unknown };
  const bad = (error: string) => ({
    ok: false as const,
    response: NextResponse.json({ error }, { status: 400 }),
  });

  if (
    typeof p.comment_id !== "number" ||
    !Number.isInteger(p.comment_id) ||
    p.comment_id < 1
  ) {
    return bad("Invalid comment_id");
  }
  if (!isReviewReactionContent(p.content)) return bad("Invalid content");
  if (typeof p.on !== "boolean") return bad("Invalid on");
  return { ok: true, payload: { commentId: p.comment_id, content: p.content, on: p.on } };
}

export async function setPrReviewCommentReactionResponse(
  scope: PrScope,
  payload: { commentId: number; content: ReviewReactionContent; on: boolean },
): Promise<NextResponse> {
  // `read` et non « connecté » (MIN-145) : le RETRAIT relit la liste des
  // réactions du commentaire avec ce même token pour y retrouver la sienne. Un
  // compte qui ne sait pas lire le dépôt échouerait là — même raisonnement que
  // le commentaire de ligne, et même niveau exigé.
  const actor = await requireActor(scope, "read");
  if (!actor.ok) return actor.response;
  try {
    await scope.forge.setReviewCommentReaction({
      ...actorCall(actor.actor, scope),
      ...payload,
      login: actor.actor.login,
    });
    return NextResponse.json({ ok: true, on: payload.on });
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
  // `read` et non « connecté » : côté GitHub, `createPullRequestReviewComment`
  // relit la PR à chaud pour son `commitId` AVEC le token qu'on lui passe. Un
  // compte qui ne sait pas lire le dépôt échouerait là, pas à l'écriture.
  const actor = await requireActor(scope, "read");
  if (!actor.ok) return actor.response;
  const call = actorCall(actor.actor, scope);
  try {
    if (payload.inReplyTo != null) {
      const comment = await scope.forge.replyToPullRequestReviewComment({
        ...call,
        commentId: payload.inReplyTo,
        body: payload.body,
      });
      return NextResponse.json({ comment });
    }
    // L'ancre du commentaire est résolue PAR le provider (tête de PR relue à
    // chaud sur GitHub, diff_refs sur GitLab) — l'appelant n'a rien à pré-lire.
    const comment = await scope.forge.createPullRequestReviewComment({
      ...call,
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
  // Merger, refuser ou proposer une PR change l'ÉTAT du dépôt : `write`, et
  // rien d'autre. La protection de branche coûterait une permission GitHub hors
  // périmètre, la forge refuse le reste toute seule, et `mergeableState ===
  // "blocked"` le dit déjà dans l'UI.
  const actor = await requireActor(scope, "write");
  if (!actor.ok) return actor.response;
  const myCall = actorCall(actor.actor, scope);
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
      await forge.mergePullRequest({ ...myCall, method });
      await propagatePrState(scope, "merged", userId);
      // Trace « a accepté la PR » dans l'activité du ticket lié.
      if (scope.pr.issue_id) {
        await recordPrActionEvent(scope.pr.issue_id, userId, "pr_accepted", scope.pr.number);
      }
      return NextResponse.json({ ok: true, pr_state: "merged" });
    }

    if (action === "ready_for_review") {
      // Le `nodeId` (clé de la mutation GraphQL GitHub) n'existe que sur le GET
      // d'UNE PR : on relit donc la PR avant de basculer. Cette PRÉ-LECTURE
      // reste sur le token d'installation — c'est une lecture, et elle marche
      // même si l'acteur n'a qu'un accès étroit au dépôt.
      const pr = await forge.getPullRequest(call);
      await forge.markReadyForReview({ ...myCall, nodeId: pr.nodeId });
      // Une PR qui devient prête est prête à être RELUE → le ticket passe en
      // revue (il était en cours tant que la PR restait brouillon).
      await propagatePrState(scope, "open", userId);
      return NextResponse.json({ ok: true, pr_state: "open" });
    }

    await forge.closePullRequest(myCall);
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

  // AVANT `launchAgentRun` : un refus d'identité qui arriverait après laisserait
  // une run lancée sans review — même raisonnement que l'ordre lancement-puis-
  // review plus bas. Le verdict part du compte de la personne : c'est ce qui
  // fait que la case verte de GitHub se coche enfin pour de vrai (une App ne
  // peut pas approuver sa propre PR — 422, d'où le repli de MIN-138).
  const actor = await requireActor(scope, "read");
  if (!actor.ok) return actor.response;

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
      ...actorCall(actor.actor, scope),
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

/**
 * « Faire vérifier par Numo » (MIN-141) : une passe de review sur le diff, qui
 * dépose des commentaires de ligne et une synthèse sur la PR.
 *
 * Offerte sur TOUTE pull request, pas seulement sur celles que Numo a ouvertes :
 * relire est un geste de forge (comme approuver ou commenter), pas un geste
 * d'agent — il ne demande ni branche à hériter ni run précédent, juste un diff.
 *
 * Deux gardes EN PRÉ-VOL, dans cet ordre :
 *  1. **le plan** — faire relire du code par Numo est un geste d'agent, vendu à
 *     partir de Go comme le lancement d'un run (`checkAgentQuota` refuse sans
 *     `allowAgents`). La page Pull requests est déjà derrière `AgentsPlanGate`,
 *     mais une garde d'UI n'est pas une garde : c'est ici que ça se refuse ;
 *  2. **le budget d'usage** — comme partout où un clic déclenche un appel LLM :
 *     c'est le déclencheur qui paye.
 *
 * Les erreurs du modèle (clé absente, réponse hors format) sortent en 502 avec
 * un code — la review n'a simplement pas eu lieu, rien n'a été posté.
 */
export async function prAiReviewResponse(
  scope: PrScope,
  userId: string,
  locale: string,
): Promise<Response> {
  try {
    await ensureAgentsAllowed(userId);
    await ensureUsageBudget(userId);
  } catch (err) {
    if (isPlanLimitError(err)) return planLimitResponse(err);
    throw err;
  }

  try {
    const result = await runPrAiReview({
      forge: scope.forge,
      call: scope.call,
      pr: scope.pr,
      userId,
      locale,
    });
    if (!result.ok) {
      // « Rien à relire » n'est pas une panne (409) ; un modèle absent ou hors
      // format en est une, et elle vient d'en face (502). Dans les deux cas rien
      // n'a été posté sur la PR — le message le dit, le code le laisse brancher.
      const t = await getTranslations("ApiErrors");
      const noDiff = result.error === "noDiff";
      return NextResponse.json(
        {
          error: t(noDiff ? "aiReviewNoDiff" : "aiReviewFailed"),
          code: result.error,
        },
        { status: noDiff ? 409 : 502 },
      );
    }
    return NextResponse.json(result);
  } catch (err) {
    return forgeErrorResponse(err);
  }
}
