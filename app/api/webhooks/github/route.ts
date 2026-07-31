import { type NextRequest, NextResponse } from "next/server";
import { verifyGithubSignature } from "@/lib/server/git/github-app";
import { syncPrState, findRunsForPr } from "@/lib/server/agent/runs";
import { syncIssueStatusFromPr } from "@/lib/server/agent/issue-status-sync";
import {
  applyForgePrToIssue,
  recordForgePrActionEvents,
  notifyForgePrAction,
} from "@/lib/server/agent/pr-activity";
import { normalizeGithubIssueEvent } from "@/lib/server/git/issue-sync-core";
import { syncRemoteIssueEvent } from "@/lib/server/git/issue-sync";
import {
  resolveIssueForPr,
  upsertPullRequest,
  type PullRequestState,
} from "@/lib/server/agent/pull-requests";
import type { PrActionEventType } from "@/lib/pr-events";
import type { AgentRun } from "@/lib/server/agent/runs";

/**
 * POST /api/webhooks/github — récepteur webhook de la GitHub App (MIN-47/MIN-46).
 *
 * On vérifie la signature HMAC (`X-Hub-Signature-256`) puis on synchronise l'état
 * des Pull Requests du dépôt :
 *  - `pull_request` → INGÈRE la PR dans `pull_requests` (MIN-143 : de Numo ou
 *    d'un humain, c'est le même fait du dépôt), met à jour `agent_runs.pr_state`
 *    (la review in-app reflète le vrai état côté GitHub) ET, pour un merge/close
 *    fait DIRECTEMENT sur GitHub, trace « accepté / refusé la PR » dans l'activité
 *    de l'issue liée.
 *  - `pull_request_review` (approved / changes_requested) → trace « approuvé la PR »
 *    / « demandé des changements » dans l'activité. Les reviews « commented » /
 *    « dismissed » sont ignorées (un commentaire n'est pas une activité).
 *  - `issues` (opened/closed/reopened) → synchronisation unidirectionnelle des
 *    issues du dépôt vers les projets qui l'ont activée (MIN-97). Sens unique :
 *    minddy n'écrit jamais chez GitHub.
 * Tout autre event (ping, push…) est simplement acquitté.
 *
 * Anti-doublon : les actions minddy in-app (merge/close/demande de changements)
 * sont déjà tracées côté route avec l'acteur HUMAIN précis. Leur écho webhook est
 * émis par le BOT de la GitHub App (`sender.type === "Bot"`) → on l'ignore ici.
 * Seules les actions faites par un HUMAIN sur GitHub produisent une activité.
 *
 * Fail-closed : secret présent + signature invalide → 401. Secret non déployé →
 * on acquitte sans traiter les events qui CRÉENT des lignes (`issues`,
 * `pull_request`) ; les autres, qui ne font que refléter un état déjà décidé
 * côté GitHub, restent traités (idempotent, best-effort).
 */

/** action GitHub → pr_state minddy (null = event ignoré). */
function mapPrState(action: string, merged: boolean): AgentRun["pr_state"] | null {
  switch (action) {
    case "closed":
      return merged ? "merged" : "closed";
    case "reopened":
    case "ready_for_review":
      return "open";
    case "converted_to_draft":
      return "draft";
    default:
      return null;
  }
}

/** action `pull_request` → événement d'activité PR (null = action non tracée). */
function prActionForPullRequest(action: string, merged: boolean): PrActionEventType | null {
  if (action !== "closed") return null;
  return merged ? "pr_accepted" : "pr_rejected";
}

/** state d'une review → événement d'activité (null = ignoré : commentaire/dismiss). */
function prActionForReview(state: string): PrActionEventType | null {
  switch (state) {
    case "approved":
      return "pr_approved";
    case "changes_requested":
      return "pr_changes_requested";
    default:
      return null;
  }
}

interface GithubActor {
  login?: string;
  type?: string;
}

/** L'acteur est le bot de la GitHub App → l'action vient de minddy (écho d'une
    action in-app déjà tracée avec l'acteur humain) : on ne re-trace pas. */
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
 * `mapPrState`, qui ne pilote que le cycle de vie des runs et du ticket : ici on
 * tient à jour la PR elle-même — son titre, sa tête, son état — et une PR
 * modifiée ou repoussée est une PR qui a changé.
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

/** État minddy de la PR telle que le payload la décrit. */
function payloadPrState(pr: PullRequestPayload): PullRequestState {
  if (pr.merged || pr.merged_at) return "merged";
  if (pr.state === "closed") return "closed";
  return pr.draft ? "draft" : "open";
}

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
    state: payloadPrState(pr),
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
  review?: { state?: string; user?: GithubActor };
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
  // Numo ou d'un humain. Les gardes qui suivent — `mapPrState`, puis les runs —
  // ne parlent que du cycle de vie de l'agent, et une PR humaine n'en a pas.
  if (payload.pull_request && INGESTED_PR_ACTIONS.has(action)) {
    await ingestPullRequest(repoFullName, number, payload.pull_request);
  }

  const merged = !!payload.pull_request?.merged;
  const prState = mapPrState(action, merged);
  if (!prState) return;

  const runs = await syncPrState({
    repoFullName,
    prNumber: number,
    prState,
    prUrl: payload.pull_request?.html_url ?? null,
    provider: "github",
  });

  // Activité : accepter (merge) / refuser (close) faits par un HUMAIN sur GitHub.
  // Le merge/close in-app passe par le bot de l'App → ignoré (déjà tracé).
  const actionType = prActionForPullRequest(action, merged);
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
      login: payload.sender?.login ?? null,
    });
    return;
  }

  // Aligne le statut des issues sur le nouvel état PR (MIN-46) :
  // merged→done, closed→todo, reopened/ready_for_review→in_review.
  for (const run of runs) {
    // `issueId` null = run carnet (MIN-84) : aucune issue à aligner.
    if (run.createdBy && run.issueId) {
      await syncIssueStatusFromPr({ issueId: run.issueId, actorId: run.createdBy, prState });
    }
  }
  if (actionType && byHuman) {
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

async function handlePullRequestReview(payload: PullRequestReviewEvent): Promise<void> {
  if (payload.action !== "submitted") return;
  const number = payload.pull_request?.number;
  const repoFullName = payload.repository?.full_name;
  const reviewer = payload.review?.user ?? payload.sender;
  const actionType = prActionForReview(payload.review?.state ?? "");
  if (!actionType || number == null || !repoFullName || isBot(reviewer)) return;

  const runs = await findRunsForPr({ repoFullName, prNumber: number, provider: "github" });
  await recordForgePrActionEvents({
    runs,
    type: actionType,
    prNumber: number,
    provider: "github",
    login: reviewer?.login ?? null,
  });
  // Inbox : l'auteur du run apprend qu'on a relu sa PR (MIN-138).
  await notifyForgePrAction({ runs, type: actionType, actorLogin: reviewer?.login ?? null });
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

  if (secret) {
    const ok = verifyGithubSignature(
      rawBody,
      request.headers.get("x-hub-signature-256"),
      secret,
    );
    if (!ok) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
  }

  const event = request.headers.get("x-github-event");
  try {
    if (event === "pull_request") {
      // FAIL-CLOSED depuis MIN-143, comme la branche `issues` : cette branche
      // CRÉE des lignes `pull_requests`. Sans secret déployé, la signature n'est
      // pas vérifiée — n'importe qui connaissant le nom d'un dépôt lié pourrait
      // forger une PR et la faire apparaître dans la liste d'un projet. Le
      // fail-open historique ne vaut que pour les events qui reflètent un état
      // déjà décidé côté provider.
      if (!secret) {
        console.warn(
          "[webhooks/github] GITHUB_WEBHOOK_SECRET is not set — pull_request event ignored",
        );
      } else {
        await handlePullRequest(JSON.parse(rawBody) as PullRequestEvent);
      }
    } else if (event === "pull_request_review") {
      await handlePullRequestReview(JSON.parse(rawBody) as PullRequestReviewEvent);
    } else if (event === "issues") {
      // FAIL-CLOSED, contrairement au reste de ce récepteur : cette branche CRÉE
      // des tickets dans un projet. Sans secret déployé, la signature n'est pas
      // vérifiée — n'importe qui connaissant le nom d'un dépôt lié pourrait alors
      // forger un `issues.opened` et écrire dans le projet. Les autres events ne
      // font que refléter un état déjà décidé côté provider : leur fail-open
      // historique reste sans danger.
      if (!secret) {
        console.warn(
          "[webhooks/github] GITHUB_WEBHOOK_SECRET is not set — issues event ignored",
        );
      } else {
        await handleIssues(JSON.parse(rawBody));
      }
    }
  } catch (err) {
    // Best-effort : on acquitte quand même pour que GitHub ne re-livre pas.
    console.error(`[webhooks/github] ${event} handling failed:`, (err as Error).message);
  }

  return NextResponse.json({ ok: true });
}
