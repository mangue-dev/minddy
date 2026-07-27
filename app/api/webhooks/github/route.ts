import { type NextRequest, NextResponse } from "next/server";
import { verifyGithubSignature } from "@/lib/server/git/github-app";
import { syncPrState, findRunsForPr } from "@/lib/server/agent/runs";
import { syncIssueStatusFromPr } from "@/lib/server/agent/issue-status-sync";
import { recordForgePrActionEvents } from "@/lib/server/agent/pr-activity";
import { normalizeGithubIssueEvent } from "@/lib/server/git/issue-sync-core";
import { syncRemoteIssueEvent } from "@/lib/server/git/issue-sync";
import type { PrActionEventType } from "@/lib/pr-events";
import type { AgentRun } from "@/lib/server/agent/runs";

/**
 * POST /api/webhooks/github — récepteur webhook de la GitHub App (MIN-47/MIN-46).
 *
 * On vérifie la signature HMAC (`X-Hub-Signature-256`) puis on synchronise l'état
 * des Pull Requests ouvertes par l'agent de code :
 *  - `pull_request` (closed/merged/reopened/…) → met à jour `agent_runs.pr_state`
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
 * on acquitte sans vérifier (aucun risque, traitement idempotent best-effort).
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

interface PullRequestEvent {
  action?: string;
  number?: number;
  pull_request?: { merged?: boolean; html_url?: string };
  repository?: { full_name?: string };
  sender?: GithubActor;
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
  const number = payload.number;
  const repoFullName = payload.repository?.full_name;
  const merged = !!payload.pull_request?.merged;
  const prState = mapPrState(action, merged);
  if (!prState || number == null || !repoFullName) return;

  const runs = await syncPrState({
    repoFullName,
    prNumber: number,
    prState,
    prUrl: payload.pull_request?.html_url ?? null,
    provider: "github",
  });
  // Aligne le statut des issues sur le nouvel état PR (MIN-46) :
  // merged→done, closed→todo, reopened/ready_for_review→in_review.
  for (const run of runs) {
    // `issueId` null = run carnet (MIN-84) : aucune issue à aligner.
    if (run.createdBy && run.issueId) {
      await syncIssueStatusFromPr({ issueId: run.issueId, actorId: run.createdBy, prState });
    }
  }
  // Activité : accepter (merge) / refuser (close) faits par un HUMAIN sur GitHub.
  // Le merge/close in-app passe par le bot de l'App → ignoré (déjà tracé).
  const actionType = prActionForPullRequest(action, merged);
  if (actionType && !isBot(payload.sender)) {
    await recordForgePrActionEvents({
      runs,
      type: actionType,
      prNumber: number,
      provider: "github",
      login: payload.sender?.login ?? null,
    });
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
      await handlePullRequest(JSON.parse(rawBody) as PullRequestEvent);
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
