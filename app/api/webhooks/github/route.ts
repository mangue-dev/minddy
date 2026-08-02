import { type NextRequest, NextResponse } from "next/server";
import { verifyGithubSignature } from "@/lib/server/git/github-app";
import { syncPrState, findRunsForPr } from "@/lib/server/agent/runs";
import { syncIssueStatusFromPr } from "@/lib/server/agent/issue-status-sync";
import {
  applyForgePrToIssue,
  isPrActionEcho,
  recordForgePrActionEvents,
  recordForgePrGesture,
  notifyForgePrAction,
} from "@/lib/server/agent/pr-activity";
import {
  githubPrState,
  githubPrStateForAction,
  isPullRequestComment,
  prActionForPullRequest,
  prActionForReview,
} from "@/lib/server/agent/pr-webhook-core";
import { normalizeGithubIssueEvent } from "@/lib/server/git/issue-sync-core";
import { syncRemoteIssueEvent } from "@/lib/server/git/issue-sync";
import {
  findPullRequestByNumber,
  resolveIssueForPr,
  upsertPullRequest,
} from "@/lib/server/agent/pull-requests";
import { handleForgeNumoMention } from "@/lib/server/agent/pr-mention";
import type { PrActionEventType } from "@/lib/pr-events";

/**
 * POST /api/webhooks/github — récepteur webhook de la GitHub App (MIN-47/MIN-46).
 *
 * On vérifie la signature HMAC (`X-Hub-Signature-256`) puis on synchronise l'état
 * des Pull Requests du dépôt :
 *  - `pull_request` → INGÈRE la PR dans `pull_requests` (MIN-143 : de Numo ou
 *    d'un humain, c'est le même fait du dépôt), met à jour `agent_runs.pr_state`
 *    (la review in-app reflète le vrai état côté GitHub) ET trace dans l'activité
 *    de l'issue liée ce qui a été fait DIRECTEMENT sur GitHub : ouvrir (`opened`),
 *    pousser des commits (`synchronize`), accepter ou refuser (`closed`).
 *  - `pull_request_review` → trace « approuvé la PR » / « demandé des changements »,
 *    et « commenté la PR » quand la review porte un message. Les reviews
 *    « dismissed » sont ignorées.
 *  - `pull_request_review_comment` → trace « commenté le code de la PR ». Une
 *    review de N remarques arrive en N events : ils se regroupent en une ligne
 *    (`collapsesInBurst`).
 *  - `issue_comment` (sur une PR) → trace « commenté la PR », et déclenche la
 *    relecture de Numo si le message le MENTIONNE (MIN-162). Écrire `@numo`
 *    depuis github.com fait donc la même chose que l'écrire depuis minddy — sauf
 *    que la dépense est portée par le owner du projet du ticket lié, faute d'un
 *    compte minddy derrière l'auteur (cf. `lib/server/agent/pr-mention`).
 *  - `issues` (opened/closed/reopened) → synchronisation unidirectionnelle des
 *    issues du dépôt vers les projets qui l'ont activée (MIN-97). Sens unique :
 *    minddy n'écrit jamais chez GitHub.
 * Tout autre event (ping, push…) est simplement acquitté.
 *
 * PRÉREQUIS D'INSTALLATION : `issue_comment` et `pull_request_review_comment`
 * doivent être cochés dans les événements auxquels la GitHub App s'abonne (page
 * de réglages de l'App) — ils n'exigent aucune permission de plus que les
 * Pull requests déjà accordées. Sans ça, les commentaires ne sont jamais livrés
 * et les lignes correspondantes n'apparaissent pas.
 *
 * Anti-doublon : les actions minddy in-app (merge/close/demande de changements)
 * sont déjà tracées côté route avec l'acteur HUMAIN précis. Leur écho webhook est
 * émis par le BOT de la GitHub App (`sender.type === "Bot"`) → on l'ignore ici.
 * Seules les actions faites par un HUMAIN sur GitHub produisent une activité.
 *
 * Fail-closed : signature invalide → 401. Secret non déployé → 503 sans rien
 * traiter (GitHub re-livrera une fois le secret en place), aligné sur le
 * récepteur GitLab.
 */

interface GithubActor {
  /** Id du compte — la clé d'identité, immuable au renommage (MIN-154). */
  id?: number;
  login?: string;
  type?: string;
}

/** L'id du compte de forge de l'acteur, en texte (colonne `provider_account_id`). */
function actorAccountId(actor: GithubActor | undefined | null): string | null {
  return actor?.id != null ? String(actor.id) : null;
}

/** L'acteur est le bot de la GitHub App → l'action vient de Numo (écho d'une
    action d'agent déjà tracée) : on ne re-trace pas.

    Ne suffit PLUS à reconnaître un geste HUMAIN fait depuis minddy : depuis
    MIN-144 il part du compte git de la personne, donc l'acteur du hook est le
    même que si elle avait cliqué sur github.com. C'est `isPrActionEcho` qui
    tranche ce cas-là, sur l'événement déjà tracé par la route. */
function isBot(actor: GithubActor | undefined | null): boolean {
  return actor?.type === "Bot";
}

/** La PR telle que GitHub la livre dans un event `pull_request`. */
interface PullRequestPayload {
  number?: number;
  merged?: boolean;
  merged_at?: string | null;
  html_url?: string;
  state?: string;
  draft?: boolean;
  title?: string;
  body?: string | null;
  head?: { ref?: string; sha?: string };
  base?: { ref?: string };
  user?: { login?: string; avatar_url?: string } | null;
  created_at?: string;
  updated_at?: string;
}

interface PullRequestEvent {
  action?: string;
  number?: number;
  pull_request?: PullRequestPayload;
  repository?: { full_name?: string };
  sender?: GithubActor;
}

/**
 * Actions qui décrivent un état de PR à INGÉRER (MIN-143). Plus large que
 * `githubPrStateForAction`, qui ne pilote que le cycle de vie des runs et du
 * ticket : ici on tient à jour la PR elle-même — son titre, sa tête, son état —
 * et une PR modifiée ou repoussée est une PR qui a changé.
 */
const INGESTED_PR_ACTIONS = new Set([
  "opened",
  "edited",
  "closed",
  "reopened",
  "synchronize",
  "converted_to_draft",
  "ready_for_review",
]);

/**
 * Enregistre la PR chez minddy — de Numo ou d'un humain, c'est le même fait du
 * dépôt (MIN-143). Le rattachement au ticket vient de ce que la PR dit d'elle
 * (branche, titre, ligne de fermeture) ; s'il ne donne rien, on ne touche PAS au
 * rattachement existant : un run a pu le poser, lui.
 */
async function ingestPullRequest(
  repoFullName: string,
  number: number,
  pr: PullRequestPayload,
): Promise<void> {
  const issueId = await resolveIssueForPr({
    provider: "github",
    repoFullName,
    branch: pr.head?.ref,
    title: pr.title,
    body: pr.body,
  });
  await upsertPullRequest({
    provider: "github",
    repoFullName,
    number,
    state: githubPrState(pr),
    url: pr.html_url ?? null,
    title: pr.title ?? null,
    authorLogin: pr.user?.login ?? null,
    authorAvatarUrl: pr.user?.avatar_url ?? null,
    headBranch: pr.head?.ref ?? null,
    baseBranch: pr.base?.ref ?? null,
    headSha: pr.head?.sha ?? null,
    openedAt: pr.created_at ?? null,
    mergedAt: pr.merged_at ?? null,
    updatedAt: pr.updated_at,
    issueId: issueId ?? undefined,
  });
}

interface PullRequestReviewEvent {
  action?: string;
  /** `body` sépare la review qui PORTE un message de la simple enveloppe de
      remarques de ligne (cf. `prActionForReview`). */
  review?: { state?: string; body?: string | null; user?: GithubActor };
  pull_request?: { number?: number };
  repository?: { full_name?: string };
  sender?: GithubActor;
}

/** Commentaire de FIL. GitHub sert les issues et les PR sur le même event —
    `issue.pull_request` est ce qui les distingue (cf. `isPullRequestComment`). */
interface IssueCommentEvent {
  action?: string;
  issue?: { number?: number; pull_request?: unknown } | null;
  /** `body` sert la mention `@numo` (MIN-162) : c'est le seul signal qu'on ait
      d'un appel à Numo écrit depuis github.com. */
  comment?: { body?: string | null; user?: GithubActor } | null;
  repository?: { full_name?: string };
  sender?: GithubActor;
}

/** Remarque de LIGNE (commentaire de review ancré dans le diff). */
interface PullRequestReviewCommentEvent {
  action?: string;
  comment?: { user?: GithubActor } | null;
  pull_request?: { number?: number };
  repository?: { full_name?: string };
  sender?: GithubActor;
}

async function handlePullRequest(payload: PullRequestEvent): Promise<void> {
  const action = payload.action ?? "";
  const number = payload.number ?? payload.pull_request?.number;
  const repoFullName = payload.repository?.full_name;
  if (number == null || !repoFullName) return;

  // Ingestion D'ABORD (MIN-143) : la PR existe chez minddy, qu'elle vienne de
  // Numo ou d'un humain. Les gardes qui suivent — l'état pilotant, puis les
  // runs — ne parlent que du cycle de vie de l'agent, et une PR humaine n'en a
  // pas. C'est aussi ce qui rend le rattachement au ticket LISIBLE plus bas :
  // `applyForgePrToIssue` relit la ligne qu'on vient d'écrire.
  if (payload.pull_request && INGESTED_PR_ACTIONS.has(action)) {
    await ingestPullRequest(repoFullName, number, payload.pull_request);
  }

  const merged = !!payload.pull_request?.merged;
  // L'état vient du PAYLOAD, pas de l'action seule (MIN-164) : une PR rouverte
  // peut être restée brouillon, et `reopened` valait « ouverte » en dur.
  const prState = githubPrStateForAction(action, payload.pull_request ?? {});
  // Activité : ouvrir, pousser des commits, accepter (merge) ou refuser (close)
  // depuis GitHub. Le geste in-app fait par Numo passe par le bot de l'App →
  // ignoré (déjà tracé côté agent ou route).
  const actionType = prActionForPullRequest(action, merged);
  // Deux axes indépendants (même forme que le récepteur GitLab) : `synchronize`
  // ne change AUCUN état de run — il ne fait que raconter. Le sortir ici, comme
  // le faisait le `if (!prState) return`, revenait à ne jamais le tracer.
  if (!prState && !actionType) return;

  const runs = prState
    ? await syncPrState({
        repoFullName,
        prNumber: number,
        prState,
        prUrl: payload.pull_request?.html_url ?? null,
        provider: "github",
      })
    : await findRunsForPr({ repoFullName, prNumber: number, provider: "github" });

  const byHuman = !isBot(payload.sender);

  // AUCUN run derrière cette PR : c'est une PR humaine (MIN-143). Elle peut
  // porter un ticket quand même — par son nom de branche, son titre ou une ligne
  // de fermeture. Le fusionner sur GitHub doit produire ce que le fusionner
  // depuis minddy produit, sinon le même geste a deux effets selon l'endroit.
  if (runs.length === 0) {
    await applyForgePrToIssue({
      provider: "github",
      repoFullName,
      prNumber: number,
      prState,
      actionType: byHuman ? actionType : null,
      accountId: actorAccountId(payload.sender),
      login: payload.sender?.login ?? null,
    });
    return;
  }

  // Aligne le statut des issues sur le nouvel état PR (MIN-46) :
  // merged→done, closed→todo, ouverte→in_review, brouillon→in_progress.
  if (prState) {
    for (const run of runs) {
      // `issueId` null = run carnet (MIN-84) : aucune issue à aligner.
      if (run.createdBy && run.issueId) {
        await syncIssueStatusFromPr({ issueId: run.issueId, actorId: run.createdBy, prState });
      }
    }
  }
  // `byHuman` ne dit plus « fait sur GitHub » depuis MIN-144 : un merge/close
  // lancé depuis minddy porte lui aussi un compte humain. L'écho se lit donc sur
  // l'événement que la route vient d'écrire.
  const echo =
    !!actionType &&
    byHuman &&
    (await isPrActionEcho({
      issueIds: runs.map((r) => r.issueId),
      type: actionType,
      prNumber: number,
      provider: "github",
      accountId: actorAccountId(payload.sender),
      login: payload.sender?.login ?? null,
    }));
  if (actionType && byHuman && !echo) {
    await recordForgePrActionEvents({
      runs,
      type: actionType,
      prNumber: number,
      provider: "github",
      login: payload.sender?.login ?? null,
    });
    // Inbox : l'auteur du run apprend que sa PR a été fusionnée (MIN-138).
    await notifyForgePrAction({ runs, type: actionType, actorLogin: payload.sender?.login ?? null });
  }
}

/**
 * Trace un geste de forge SANS effet d'état — review, commentaire de fil,
 * remarque de ligne. Le bot de l'App est écarté ici : quand il agit, c'est Numo,
 * et Numo trace ses propres gestes avec sa propre identité.
 *
 * `recordForgePrGesture` porte le reste (runs ou PR humaine, anti-écho,
 * regroupement des rafales) — il est partagé avec le récepteur GitLab.
 */
async function recordGithubGesture(opts: {
  type: PrActionEventType | null;
  number: number | undefined;
  repoFullName: string | undefined;
  actor: GithubActor | undefined | null;
}): Promise<void> {
  if (!opts.type || opts.number == null || !opts.repoFullName || isBot(opts.actor)) return;
  await recordForgePrGesture({
    provider: "github",
    repoFullName: opts.repoFullName,
    prNumber: opts.number,
    type: opts.type,
    accountId: actorAccountId(opts.actor),
    login: opts.actor?.login ?? null,
  });
}

async function handlePullRequestReview(payload: PullRequestReviewEvent): Promise<void> {
  if (payload.action !== "submitted") return;
  await recordGithubGesture({
    type: prActionForReview(payload.review ?? {}),
    number: payload.pull_request?.number,
    repoFullName: payload.repository?.full_name,
    actor: payload.review?.user ?? payload.sender,
  });
}

async function handleIssueComment(payload: IssueCommentEvent): Promise<void> {
  if (!isPullRequestComment(payload)) return;
  const actor = payload.comment?.user ?? payload.sender;
  const number = payload.issue?.number;
  const repoFullName = payload.repository?.full_name;

  await recordGithubGesture({ type: "pr_commented", number, repoFullName, actor });

  // `@numo` écrit DEPUIS github.com (MIN-162). Deux gardes avant d'y toucher :
  //  · le bot de l'App, c'est Numo lui-même — le laisser s'appeler ferait boucler
  //    la passe sur sa propre synthèse ;
  //  · un commentaire posté depuis minddy revient ici par écho quelques secondes
  //    plus tard, et la route a déjà lancé la passe. `isPrActionEcho` le
  //    reconnaît sur l'événement qu'elle vient d'écrire — le même garde que pour
  //    l'activité, sur le même geste.
  if (
    payload.action !== "created" ||
    number == null ||
    !repoFullName ||
    isBot(actor) ||
    !payload.comment?.body
  ) {
    return;
  }
  const pr = await findPullRequestByNumber({
    provider: "github",
    repoFullName,
    number,
  });
  if (!pr) return;
  const echo = await isPrActionEcho({
    issueIds: [pr.issue_id],
    type: "pr_commented",
    prNumber: number,
    provider: "github",
    accountId: actorAccountId(actor),
    login: actor?.login ?? null,
  });
  if (echo) return;

  await handleForgeNumoMention({
    provider: "github",
    repoFullName,
    prNumber: number,
    body: payload.comment.body,
    authorLogin: actor?.login ?? null,
  });
}

async function handlePullRequestReviewComment(
  payload: PullRequestReviewCommentEvent,
): Promise<void> {
  if (payload.action !== "created") return;
  await recordGithubGesture({
    type: "pr_code_commented",
    number: payload.pull_request?.number,
    repoFullName: payload.repository?.full_name,
    actor: payload.comment?.user ?? payload.sender,
  });
}

/** Actions `issues` synchronisées (MIN-97) — les éditions de titre/corps, les
    labels et les suppressions distantes ne le sont pas (v1). */
const SYNCED_ISSUE_ACTIONS = new Set(["opened", "closed", "reopened"]);

async function handleIssues(payload: unknown): Promise<void> {
  const remote = normalizeGithubIssueEvent(payload);
  if (!remote || !SYNCED_ISSUE_ACTIONS.has(remote.action)) return;
  await syncRemoteIssueEvent(remote);
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const secret = process.env.GITHUB_WEBHOOK_SECRET;

  // FAIL-CLOSED intégral (MIN-118), aligné sur le récepteur GitLab : sans
  // secret déployé, AUCUN event n'est traité — même ceux qui ne font que
  // refléter un état déjà décidé côté GitHub. Un `pr_state` forgé déclenche
  // quand même des écritures (sync du statut d'issue, notifications) ; le
  // fail-open partiel historique laissait cette porte ouverte. 503 plutôt que
  // 200 : GitHub re-livrera une fois le secret déployé.
  if (!secret) {
    console.error("[webhooks/github] GITHUB_WEBHOOK_SECRET is not set — event refused");
    return NextResponse.json({ error: "webhook secret not configured" }, { status: 503 });
  }

  const ok = verifyGithubSignature(
    rawBody,
    request.headers.get("x-hub-signature-256"),
    secret,
  );
  if (!ok) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const event = request.headers.get("x-github-event");
  try {
    if (event === "pull_request") {
      await handlePullRequest(JSON.parse(rawBody) as PullRequestEvent);
    } else if (event === "pull_request_review") {
      await handlePullRequestReview(JSON.parse(rawBody) as PullRequestReviewEvent);
    } else if (event === "pull_request_review_comment") {
      await handlePullRequestReviewComment(
        JSON.parse(rawBody) as PullRequestReviewCommentEvent,
      );
    } else if (event === "issue_comment") {
      await handleIssueComment(JSON.parse(rawBody) as IssueCommentEvent);
    } else if (event === "issues") {
      await handleIssues(JSON.parse(rawBody));
    }
  } catch (err) {
    // Best-effort : on acquitte quand même pour que GitHub ne re-livre pas.
    console.error(`[webhooks/github] ${event} handling failed:`, (err as Error).message);
  }

  return NextResponse.json({ ok: true });
}
