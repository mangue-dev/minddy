"use client";

import type { RepoProviderId } from "@/lib/repo-providers";
import type { ReasoningLevel } from "@/lib/agent-reasoning";
import type { ReviewThreadState } from "@/lib/pr-review-threads";
import type { PrReviewEvent, PrReviewRun } from "@/lib/pr-review-run";
import type { PrTimelineEvent } from "@/lib/pr-timeline";
import type { CommitAuthor } from "@/lib/commit-authors";
import type {
  ReviewCommentReaction,
  ReviewReactionContent,
} from "@/lib/pr-review-reactions";
import { trackEvent } from "./analytics";
import { lengthBucket } from "./analytics-sanitize";

/**
 * Fetchers client de l'agent de code (MIN-46) : lancer un run sur une issue et
 * lister ses runs. (Le détail live + events + stop d'un run arrivent en Phase 7.)
 */

/**
 * Erreur d'API qui conserve le `code` métier de la route (ex. `lineNotInDiff`) en
 * plus du message : certains appelants doivent distinguer le cas, pas seulement
 * l'afficher. Reste une `Error` — les appelants qui ne lisent que `.message` sont
 * inchangés.
 */
export class ApiError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const payload = data as { error?: string; code?: string } | null;
    const message = payload?.error || text.trim() || "Request failed";
    throw new ApiError(message, payload?.code);
  }
  return data as T;
}

export type AgentRunStatus = "queued" | "running" | "completed" | "failed" | "canceled";

export interface AgentRunSummary {
  id: string;
  status: AgentRunStatus;
  model: string | null;
  model_forced: boolean;
  /** Niveau de raisonnement FIGÉ au lancement (MIN-122) : le sélecteur d'une run
   *  en cours l'affiche en lecture seule, comme le modèle et la branche. */
  reasoning_level: ReasoningLevel;
  key_mode: "platform" | "byok";
  triggered_by: "button" | "chat" | "mention";
  /** Prompt de lancement (bulle « originelle » de la conversation). */
  prompt: string | null;
  /** Branche COPIÉE au lancement (choisie en compose, sinon le défaut du dépôt).
      Null tant que le premier chunk ne l'a pas stampée sur une run sans héritage. */
  base_branch: string | null;
  /** Branche de travail de la lignée (l'héritage des runs froides est indexé dessus). */
  branch_name: string | null;
  pr_number: number | null;
  pr_url: string | null;
  pr_state: "draft" | "open" | "merged" | "closed" | null;
  continuations: number;
  cost_usd: number;
  outcome: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  /**
   * Moment PRÉCIS de la dernière fin d'agent (transition vers `completed`), stampé
   * par trigger DB — insensible aux heartbeats / webhooks PR. `null` tant que la run
   * n'a jamais terminé. Pilote la bulle bleue « lu / non-lu » (comparé au dernier
   * `last_read_at` de la session).
   */
  completed_at: string | null;
  /** Le dernier tour s'est terminé sur un ask_user : la run ATTEND la réponse de
   *  l'utilisateur → point JAUNE (mêmes règles de lecture que le non-lu). */
  awaiting_input: boolean;
}

/**
 * Statuts d'un run qui OCCUPE l'issue : l'agent TRAVAILLE (queued/running). Au
 * repos (`completed`), la session n'occupe plus le ticket — modèle conversationnel :
 * elle attend simplement le prochain message dans sa conversation. Un seul run au
 * travail par issue : tant qu'il y en a un, on n'en lance pas de nouveau.
 */
export const ACTIVE_AGENT_STATUSES: AgentRunStatus[] = ["queued", "running"];

export function isAgentRunActive(status: AgentRunStatus): boolean {
  return ACTIVE_AGENT_STATUSES.includes(status);
}

/**
 * L'agent est-il en train de TRAVAILLER ? Pilote le halo animé des cartes, le
 * polling d'events, et l'affichage du bouton « Interrompre » dans la conversation.
 * (Identique à `isAgentRunActive` depuis la fin de `needs_input` — conservé pour
 * la lisibilité des call-sites : « travaille » vs « occupe le ticket ».)
 */
export function isAgentRunWorking(status: AgentRunStatus): boolean {
  return status === "queued" || status === "running";
}

/**
 * Ce run précis peut-il être repris à CHAUD (message dans SA conversation) ? Oui
 * même au repos : son checkpoint et sa sandbox sont conservés, on enchaîne un tour
 * de plus dans le même contexte — c'est le geste NORMAL d'une conversation. Seule
 * une erreur d'amorçage (`failed` : pas de dépôt/modèle) n'a rien à reprendre.
 * Rappel : seule la DERNIÈRE run de l'issue est reprennable (les runs partagent la
 * branche) — le serveur refuse les autres (`supersededRun`).
 */
export function isAgentRunResumable(status: AgentRunStatus): boolean {
  return status !== "failed";
}

export async function fetchIssueAgentRunsApi(
  issueId: string,
): Promise<{ runs: AgentRunSummary[] }> {
  return parseJson(await fetch(`/api/issues/${issueId}/agent`));
}

export async function launchAgentRunApi(
  issueId: string,
  body: {
    prompt?: string;
    model?: string;
    baseBranch?: string;
    /** Niveau de raisonnement choisi au lancement (MIN-122). Absent = défaut perso. */
    reasoningLevel?: ReasoningLevel;
    /** `plan` (cadrer), `verify` (contrôler du travail fait) et `custom`
     *  (consigne libre de l'utilisateur) laissent l'issue où elle est : seul
     *  `implement` la passe « en cours » côté serveur. */
    intent?: "implement" | "plan" | "verify" | "custom";
  },
): Promise<{ run: AgentRunSummary }> {
  // Le prompt n'est JAMAIS envoyé — seulement sa présence et sa longueur.
  trackEvent("agent_launched", {
    model: body.model ?? "default",
    reasoning_level: body.reasoningLevel ?? "default",
    has_branch: !!body.baseBranch,
    provider: "unknown",
    scope: "issue",
    has_prompt: !!body.prompt,
    prompt_length_bucket: lengthBucket(body.prompt),
  });
  return parseJson(
    await fetch(`/api/issues/${issueId}/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

/**
 * Branches du dépôt lié au projet de l'issue (picker de branche de base en phase
 * compose). `defaultBranch` en tête de liste.
 */
export async function fetchIssueRepoBranchesApi(
  issueId: string,
): Promise<{ branches: string[]; defaultBranch: string }> {
  return parseJson(await fetch(`/api/issues/${issueId}/agent/branches`));
}

// ── Runs CARNET (MIN-84) : lancement sans ticket ─────────────────────────────

/**
 * Lance un run CARNET : sans ticket, ancré à un projet (le dépôt à cloner) +
 * la note comme instruction. Chaque lancement est une conversation autonome.
 */
export async function launchNotebookAgentApi(body: {
  projectId: string;
  prompt: string;
  model?: string;
  baseBranch?: string;
}): Promise<{ run: AgentRunSummary }> {
  trackEvent("agent_launched", {
    model: body.model ?? "default",
    has_branch: !!body.baseBranch,
    provider: "unknown",
    scope: "notebook",
    has_prompt: !!body.prompt,
    prompt_length_bucket: lengthBucket(body.prompt),
  });
  return parseJson(
    await fetch(`/api/agent-runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

/** Branches du dépôt lié à un PROJET (compose d'un run carnet). */
export async function fetchProjectRepoBranchesApi(
  projectId: string,
): Promise<{ branches: string[]; defaultBranch: string }> {
  return parseJson(await fetch(`/api/projects/${projectId}/agent/branches`));
}

/** Détail (client-safe) d'un run — la conversation d'une session carnet. */
export async function fetchAgentRunApi(
  runId: string,
): Promise<{ run: AgentRunSummary }> {
  return parseJson(await fetch(`/api/agent-runs/${runId}`));
}

// ── Run détail / events / stop / PR ──────────────────────────────────────────

export type AgentEventType =
  | "status"
  | "thinking"
  | "tool_call"
  | "tool_result"
  | "commit"
  | "pr_opened"
  | "error"
  | "summary"
  | "user_message"
  | "plan_update"
  | "files_changed"
  | "question"
  /** Budget d'usage mensuel épuisé en cours de run : le fil rend la carte qui dit
   *  où en est le budget et ce qu'on peut faire (monter de plan, attendre, BYOK). */
  | "quota_exhausted";

export interface AgentRunEvent {
  id: string;
  seq: number;
  type: AgentEventType;
  payload: Record<string, unknown> | null;
  created_at: string;
}

/** Nature d'un changement de fichier d'un tour (git name-status → 4 cas affichables). */
export type AgentFileChangeStatus = "added" | "modified" | "deleted" | "renamed";

/**
 * Un fichier changé pendant un tour de l'agent (MIN-46, note « diff par tour »).
 * Émis dans l'event `files_changed` en fin de tour, calculé côté serveur par un
 * `git diff --numstat --name-status <shaAvant> <shaAprès>` dans la sandbox (source
 * de vérité — les tool-calls ne suffisent pas : `apply_edits` et `run_command`
 * changent des fichiers hors de leur payload). `previousPath` n'est présent que
 * pour un renommage (chemin AVANT — celui qui adresse la version de base).
 */
export interface AgentFileChange {
  path: string;
  status: AgentFileChangeStatus;
  additions: number;
  deletions: number;
  previousPath?: string;
}

/** Résultat parsé d'un event `files_changed`. `truncated` : la liste a été bornée (gros tour). */
export interface AgentFilesChangedPayload {
  files: AgentFileChange[];
  truncated: boolean;
}

/** Lit le payload d'un event `files_changed` en tolérant les formes partielles. */
export function parseFilesChangedPayload(
  payload: Record<string, unknown> | null,
): AgentFilesChangedPayload {
  const rawFiles = Array.isArray(payload?.files) ? (payload!.files as unknown[]) : [];
  const files: AgentFileChange[] = [];
  for (const raw of rawFiles) {
    if (typeof raw !== "object" || raw === null) continue;
    const r = raw as Record<string, unknown>;
    const path = typeof r.path === "string" ? r.path : "";
    if (!path) continue;
    const status =
      r.status === "added" || r.status === "deleted" || r.status === "renamed"
        ? r.status
        : "modified";
    files.push({
      path,
      status,
      additions: typeof r.additions === "number" ? r.additions : 0,
      deletions: typeof r.deletions === "number" ? r.deletions : 0,
      ...(typeof r.previousPath === "string" ? { previousPath: r.previousPath } : {}),
    });
  }
  return { files, truncated: payload?.truncated === true };
}

export async function fetchAgentRunEventsApi(
  runId: string,
  after?: number,
): Promise<{ events: AgentRunEvent[] }> {
  const q = after != null ? `?after=${after}` : "";
  return parseJson(await fetch(`/api/agent-runs/${runId}/events${q}`));
}

/**
 * « Interrompre la réponse en cours » : demande au chunk qui tourne de suspendre
 * proprement l'appel LLM en cours et de revenir au repos. N'annule PAS la session,
 * n'efface PAS le contexte, n'arrête PAS la sandbox — tout reste reprennable.
 * (L'endpoint reste /stop côté serveur.)
 */
export async function interruptAgentRunApi(runId: string): Promise<void> {
  trackEvent("agent_stopped", {});
  await parseJson(await fetch(`/api/agent-runs/${runId}/stop`, { method: "POST" }));
}

/**
 * Heartbeat : rafraîchit l'horloge d'inactivité du run tant que la conversation
 * est ouverte, pour que la sandbox ne soit pas coupée pendant que l'utilisateur
 * lit ou écrit. Best-effort (ignore les erreurs réseau).
 */
export async function heartbeatAgentRunApi(runId: string): Promise<void> {
  try {
    await fetch(`/api/agent-runs/${runId}/heartbeat`, { method: "POST" });
  } catch {
    // best-effort : le prochain heartbeat rattrapera.
  }
}

/**
 * Message à une session (MIN-46) : oriente l'agent à chaud s'il travaille, ou
 * poursuit la conversation (nouveau tour) si la session est au repos.
 */
export async function steerAgentRunApi(
  runId: string,
  message: string,
): Promise<{ ok: true; status: AgentRunStatus }> {
  trackEvent("agent_steered", { length_bucket: lengthBucket(message) });
  return parseJson(
    await fetch(`/api/agent-runs/${runId}/steer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    }),
  );
}

export interface PullRequestRef {
  number: number;
  url: string;
  state: string;
  draft?: boolean;
  merged?: boolean;
  title?: string;
  body?: string | null;
  head?: string;
  base?: string;
  /** SHA de tête — le diff EXACT servi. Comparé au SHA qu'a relu la dernière
   *  review de Numo pour savoir si relancer aurait quelque chose de neuf à lire. */
  headSha?: string;
  /** Auteur et date d'ouverture : le `body` ouvre le fil de conversation comme un commentaire. */
  user?: { login: string; avatar_url: string | null } | null;
  createdAt?: string;
  /** `null`/absent = fusionnabilité INCONNUE (les forges la calculent en
      asynchrone), à ne jamais afficher comme « bloqué » — MIN-138. */
  mergeable?: boolean | null;
  /** `clean` · `blocked` (le dépôt exige approbations/checks) · `dirty` (conflit)
      · `unstable` (checks non requis en échec) · `unknown`. */
  mergeableState?: string | null;
}

/** État normalisé d'un check CI (MIN-138) — miroir de `lib/server/agent/checks-core.ts`. */
export type CheckState = "pending" | "success" | "failure" | "neutral";

export interface PullRequestCheck {
  name: string;
  state: CheckState;
  url: string | null;
  /** L'intégration qui a produit le check (« GitHub Actions », « Vercel »…),
      quand le nom du check ne la porte pas déjà. */
  appName: string | null;
  /** Son logo chez la forge. `null` → l'UI retombe sur l'icône de la forge. */
  appAvatarUrl: string | null;
  /** Le résultat en une ligne, tel que la forge le formule. */
  description: string | null;
  durationMs: number | null;
}

export interface ChecksSummary {
  checks: PullRequestCheck[];
  /** Agrégat : un échec l'emporte, puis « en cours ». `null` = aucun check. */
  state: CheckState | null;
  /** Checks non bloquants (réussis ou neutres) — le `n` de « n/m réussis ». */
  passing: number;
  total: number;
}

/** Méthodes de merge offertes par la forge du dépôt lié. */
export type MergeMethod = "merge" | "squash" | "rebase";

export interface PullRequestReviewSummary {
  approvals: number;
  changesRequested: number;
}

/**
 * Réponse du GET de la PR d'un run. Deux nuances de « pas de checks » :
 * `checks: null` = on n'a pas pu lire (`checksError` dit pourquoi — `forbidden`
 * = permission GitHub que l'installation n'a pas acceptée), `checks.total === 0`
 * = le dépôt n'a pas de CI. Même chose pour `reviews: null`.
 */
/**
 * Ce que l'utilisateur courant peut faire sur cette PR (MIN-144). Sur GitHub
 * comme sur GitLab, un geste humain part de SON compte git : sans compte
 * connecté, ou sans droit sur le dépôt, minddy le dit au lieu d'offrir un bouton
 * qui mentirait sur l'auteur.
 */
export interface PrViewer {
  provider: RepoProviderId;
  /** Le provider a-t-il de quoi autoriser un compte (self-host sans env) ? */
  configured: boolean;
  connected: boolean;
  login: string | null;
  /** `write` = merger/résoudre, `read` = reviewer/commenter, `none` = rien. */
  capability: "write" | "read" | "none";
}

export interface AgentRunPrResponse {
  pr: PullRequestRef | null;
  files: PullRequestFile[];
  provider?: RepoProviderId;
  checks?: ChecksSummary | null;
  checksError?: "forbidden" | "unknown" | null;
  reviews?: PullRequestReviewSummary | null;
  viewer?: PrViewer;
  mergeMethods?: MergeMethod[];
}

export interface PullRequestFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
  /** Chemin AVANT la PR si le fichier a été renommé — c'est lui qui adresse la version de base. */
  previous_filename?: string;
}

export async function fetchPullRequestApi(prId: string): Promise<AgentRunPrResponse> {
  return parseJson(await fetch(`/api/pull-requests/${prId}`));
}

/**
 * Diff VIVANT d'un run — la vue diff DANS la conversation, sans attendre la PR :
 * les fichiers/patches de la PR quand elle existe, sinon le compare
 * base...branche de travail (le travail POUSSÉ, rafraîchi à chaque fin de tour).
 * `url` : la PR ou la page compare du provider (liens « voir sur … »).
 */
export async function fetchAgentRunDiffApi(runId: string): Promise<{
  files: PullRequestFile[];
  provider?: RepoProviderId;
  url: string | null;
}> {
  return parseJson(await fetch(`/api/agent-runs/${runId}/diff`));
}

/**
 * Base des routes d'une pull request (MIN-143). Deux familles servent les mêmes
 * gestes : celle indexée par la PR — la page Pull Requests, qui montre aussi les
 * PR humaines — et la façade indexée par le run, que la vue diff de la
 * conversation d'agent est seule à utiliser (elle n'a qu'un run à donner, sa
 * session n'ayant parfois aucune PR).
 */
export type PrEndpoint = string;

export function prEndpoint(prId: string): PrEndpoint {
  return `/api/pull-requests/${prId}`;
}

export function runPrEndpoint(runId: string): PrEndpoint {
  return `/api/agent-runs/${runId}/pr`;
}

/**
 * Version base d'un fichier de la PR (texte brut au merge base) — la source du
 * dépliage de contexte dans la vue diff. `path` = chemin côté base.
 */
export async function fetchPrFileSourceApi(
  endpoint: PrEndpoint,
  path: string,
): Promise<{ content: string }> {
  return parseJson(await fetch(`${endpoint}/file?path=${encodeURIComponent(path)}`));
}

/**
 * URL du proxy d'octets d'un fichier du diff — la source des `<img>` de la vue
 * côte à côte des images (MIN-66). `path` = le chemin tel que le diff le nomme
 * (le serveur en déduit lui-même la version base d'un fichier renommé).
 */
export function prFileRawUrl(
  endpoint: PrEndpoint,
  path: string,
  side: "base" | "head",
): string {
  return `${endpoint}/file/raw?path=${encodeURIComponent(path)}&side=${side}`;
}

export async function actOnPullRequestApi(
  prId: string,
  action: "merge" | "close" | "ready_for_review",
  method?: MergeMethod,
): Promise<{ ok: true; pr_state: string }> {
  trackEvent("pr_review_submitted", { verdict: action });
  return parseJson(
    await fetch(prEndpoint(prId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, method }),
    }),
  );
}

/** Verdict d'une review soumise depuis minddy (MIN-138). */
export type ReviewVerdict = "approve" | "request_changes" | "comment";

/**
 * Soumet une review sur la PR (MIN-138). `relaunch` (sur `request_changes`
 * seulement) lance EN PLUS une run froide de Numo qui itère sur cette même PR,
 * avec son propre modèle (MIN-68).
 *
 * `published: "comment"` en retour = la forge a refusé de publier le verdict —
 * une App ne peut pas approuver sa propre pull request. Le verdict est enregistré
 * côté minddy quand même ; l'appelant doit le dire à l'utilisateur.
 */
export async function submitPullRequestReviewApi(
  prId: string,
  input: { verdict: ReviewVerdict; message: string; relaunch?: boolean; model?: string },
): Promise<{ ok: true; published: "review" | "comment"; run?: { id: string } }> {
  trackEvent("pr_review_submitted", { verdict: input.verdict });
  return parseJson(
    await fetch(prEndpoint(prId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "review", ...input }),
    }),
  );
}

/**
 * « Faire vérifier par Numo » (MIN-141) : une passe de review sur le diff, qui
 * dépose une synthèse et jusqu'à cinq commentaires de ligne sur la PR.
 *
 * Disponible sur TOUTE pull request — relire ne demande rien d'autre qu'un diff,
 * contrairement à « relancer Numo », qui a besoin d'une branche à hériter.
 * Manuel par construction : rien ne le déclenche à l'ouverture d'une PR.
 *
 * Rend la SESSION, pas le résultat : la passe se joue en tâche de fond et se
 * regarde dans le panneau de review (`usePrReviewSession`). Si une passe tourne
 * déjà sur cette PR, c'est la sienne qui revient — on n'en ouvre pas deux.
 *
 * `model` : l'id choisi dans le picker, `""` pour revenir au défaut de minddy,
 * `undefined` pour ne rien changer au choix retenu.
 */
export async function requestPullRequestAiReviewApi(
  prId: string,
  model?: string,
): Promise<{ ok: true; review: PrReviewRun }> {
  trackEvent("pr_ai_review_requested");
  return parseJson(
    await fetch(prEndpoint(prId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ai_review", ...(model === undefined ? {} : { model }) }),
    }),
  );
}

/** L'état de la review de Numo sur une PR : la session, son fil, et de quoi
 *  décider s'il y a lieu d'en relancer une (`reviewedHeadSha`). */
export interface PrReviewSession {
  review: PrReviewRun | null;
  events: PrReviewEvent[];
  /** SHA relu par la dernière passe terminée — comparé à la tête courante. */
  reviewedHeadSha: string | null;
  model: {
    /** Défaut réglé en /admin : ce que vaut « défaut » dans le picker. */
    instance: string;
    /** Dernier choix du compte, ou null s'il n'en a jamais fait. */
    preferred: string | null;
  };
}

export async function fetchPullRequestAiReviewApi(prId: string): Promise<PrReviewSession> {
  return parseJson(await fetch(`${prEndpoint(prId)}/ai-review`));
}

// ── Page Pull Requests globale (MIN-66, élargie par MIN-143) ─────────────────

/** État de filtrage de la liste — servi par le SERVEUR (`?state=`). */
export type PullRequestStateFilter = "open" | "merged" | "closed" | "all";

export interface PullRequestListItem {
  /** L'item EST la PR. Le run n'en est plus le porteur, juste une décoration. */
  prId: string;
  pr_number: number;
  pr_url: string | null;
  pr_state: "draft" | "open" | "merged" | "closed";
  /** Provider du dépôt lié — pilote le vocabulaire PR/MR et les liens (MIN-69). */
  provider: RepoProviderId;
  title: string | null;
  /** Qui l'a ouverte — ce qui distingue une PR de Numo d'une PR humaine. */
  author: { login: string; avatar_url: string | null } | null;
  head_branch: string | null;
  created_at: string;
  updated_at: string;
  issue: { id: string; number: number; title: string } | null;
  project: { id: string; key: string; name: string; icon_url: string | null } | null;
  /** Run canonique de la PR, ou null : une PR humaine n'en a aucun. */
  runId: string | null;
  /** Un run TRAVAILLE sur cette PR (queued/running) = « Numo retravaille ». */
  activeRunId: string | null;
  /** Un run ACTIF occupe l'issue → « demander des changements » indisponible (MIN-68). */
  busyRunId: string | null;
  /** Tous les runs portant cette PR — un deep-link `?run=` matche n'importe lequel. */
  runIds: string[];
}

export interface PullRequestComment {
  id: number;
  body: string;
  user: { login: string; avatar_url: string | null } | null;
  created_at: string;
  html_url: string;
}

export interface PullRequestListResponse {
  pullRequests: PullRequestListItem[];
  /** Il en reste au-delà de `limit` — le bouton « en voir plus » de la page. */
  hasMore: boolean;
  /** La pagination d'une forge a été coupée : la liste n'est pas exhaustive. */
  truncated: boolean;
}

/**
 * `pin` ÉPINGLE une PR dans la réponse même si elle tombe hors de la page — un
 * deep-link vers une vieille PR ne doit pas dépendre de la profondeur du
 * défilement. `{ pr }` pour un lien direct, `{ run }` pour les liens historiques
 * de l'app (la sidebar d'issue et /agents parlent en run).
 */
export async function fetchAllPullRequestsApi(input: {
  state: PullRequestStateFilter;
  limit: number;
  pin?: { pr?: string | null; run?: string | null };
}): Promise<PullRequestListResponse> {
  const params = new URLSearchParams({ state: input.state, limit: String(input.limit) });
  if (input.pin?.pr) params.set("pr", input.pin.pr);
  if (input.pin?.run) params.set("run", input.pin.run);
  return parseJson(await fetch(`/api/pull-requests?${params}`));
}

/**
 * Le fil de conversation : messages, ACTIVITÉ de la PR (MIN-159) et réactions,
 * servis ensemble — tout ça se rend dans un seul fil ordonné par date.
 *
 * `reactions` porte AUSSI celles du corps de la PR, sous `PR_BODY_COMMENT_ID` :
 * le message qui ouvre le fil se réagit comme les autres.
 *
 * `timeline` est best-effort côté serveur : une liste vide veut dire « la forge
 * n'a pas su la donner » autant que « il ne s'est rien passé ». Le fil rend alors
 * ses messages, comme avant.
 */
export async function fetchPullRequestCommentsApi(prId: string): Promise<{
  comments: PullRequestComment[];
  timeline: PrTimelineEvent[];
  reactions: ReviewCommentReaction[];
}> {
  return parseJson(await fetch(`${prEndpoint(prId)}/comments`));
}

/**
 * Un commit de la PR. DEUX auteurs, et ils ne disent pas la même chose :
 * `author` est le COMPTE de la forge (avatar + login), quand elle a su rattacher
 * l'email du commit ; `authorName` est le nom écrit DANS le commit, que git a
 * toujours. Côté GitLab, dont l'API ne sert aucun compte sur cet endpoint, il
 * n'y a jamais que le second — d'où le repli du rendu sur lui.
 */
export interface PullRequestCommit {
  sha: string;
  /** Message COMPLET : première ligne = titre, le reste = corps. */
  message: string;
  author: { login: string; avatar_url: string | null } | null;
  authorName: string | null;
  /** Email de l'auteur — la clé de dédoublonnage avec les co-signataires. */
  authorEmail: string | null;
  authoredAt: string | null;
  url: string | null;
  /** Signature vérifiée. `null` = INCONNU (GitLab ne le sert pas), pas « non ». */
  verified: boolean | null;
  /** Premier parent — le côté « avant » du diff de ce commit. */
  parentSha: string | null;
  /** Lignes ajoutées / retirées PAR CE COMMIT. `null` = la forge n'a pas su les
      donner (GraphQL en échec, ou MR trop longue côté GitLab) : l'indicateur
      +/− disparaît alors, mais le diff du commit reste ouvrable. */
  additions: number | null;
  deletions: number | null;
  /**
   * TOUS ses auteurs, principal en tête (MIN-159). Un commit co-signé
   * (`Co-authored-by:`) en a plusieurs — le cas courant dès qu'un agent a tenu
   * le clavier — et l'écran en empile les avatars, comme la forge.
   *
   * OPTIONNEL bien que la route le remplisse toujours : un onglet resté ouvert
   * pendant un déploiement garde en cache la réponse de la version d'avant, qui
   * n'avait pas ce champ. Le type le dit, pour que chaque lecture le garde —
   * sans quoi la page entière tombe sur un `.length` d'`undefined`.
   */
  authors?: CommitAuthor[];
}

/**
 * Les commits qui composent la PR, du plus ancien au plus récent — l'onglet
 * Commits. `truncated` : la PR en a plus que ce que minddy liste d'un coup.
 */
export async function fetchPullRequestCommitsApi(
  prId: string,
): Promise<{ commits: PullRequestCommit[]; truncated: boolean }> {
  return parseJson(await fetch(`${prEndpoint(prId)}/commits`));
}

/** Base des routes d'UN commit : son diff, et — comme une PR — ses fichiers. */
export function prCommitEndpoint(prId: string, sha: string): PrEndpoint {
  return `${prEndpoint(prId)}/commits/${sha}`;
}

export interface PrCommitDiff {
  files: PullRequestFile[];
  additions: number;
  deletions: number;
  url: string | null;
  parentSha: string | null;
  message: string;
  author: { login: string; avatar_url: string | null } | null;
  authorName: string | null;
  authoredAt: string | null;
  provider?: RepoProviderId;
}

/**
 * Le diff d'UN commit de la PR, contre son parent. Sert la vue « ce que ce
 * commit change » — mêmes fichiers/patches que le diff de la PR, donc le même
 * composant de rendu, à ceci près que le dépliage de contexte y résout le
 * PARENT du commit (cf. `prCommitEndpoint`).
 */
export async function fetchPrCommitDiffApi(
  prId: string,
  sha: string,
): Promise<PrCommitDiff> {
  return parseJson(await fetch(prCommitEndpoint(prId, sha)));
}

/**
 * Pose ou retire une réaction sur un message du fil de conversation, ou sur le
 * corps de la PR (`commentId: PR_BODY_COMMENT_ID`). `on` porte l'état VOULU, pas
 * une bascule — même contrat que côté review.
 */
export async function setPrCommentReactionApi(
  endpoint: PrEndpoint,
  input: { commentId: number; content: ReviewReactionContent; on: boolean },
): Promise<{ ok: true; on: boolean }> {
  return parseJson(
    await fetch(`${endpoint}/comments/reactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        comment_id: input.commentId,
        content: input.content,
        on: input.on,
      }),
    }),
  );
}

/**
 * Commentaire de review : ancré à une ligne du diff, contrairement à
 * `PullRequestComment` qui vit dans le fil plat de la conversation.
 *
 * `line` non nul ne veut PAS dire « la ligne est dans le diff » : GitHub le
 * conserve tant qu'il sait retrouver la ligne dans la tête, même si le diff s'est
 * déplacé ailleurs. C'est la résolution dans les hunks rendus qui décide de
 * l'affichage inline — voir `pr-diff`.
 */
export interface PullRequestReviewComment {
  id: number;
  body: string;
  path: string;
  line: number | null;
  original_line: number | null;
  side: "LEFT" | "RIGHT";
  /** Racine du fil, ou null si ce commentaire EST la racine. */
  in_reply_to_id: number | null;
  /** Review qui porte ce commentaire (MIN-159) — le fil de conversation range
      les points d'une review SOUS elle. `null` côté GitLab, sans objet review. */
  review_id: number | null;
  diff_hunk: string;
  user: { login: string; avatar_url: string | null } | null;
  created_at: string;
  html_url: string;
}

/**
 * Commentaires de review ET état de leurs fils (MIN-139), servis ensemble : un
 * fil se rend avec les deux. `threads` peut être vide alors que des commentaires
 * existent — la forge n'a pas su dire l'état, et l'UI n'offre alors pas de
 * bouton « Résoudre » plutôt que d'annoncer « ouvert » à l'aveugle.
 */
export async function fetchPrReviewCommentsApi(
  endpoint: PrEndpoint,
): Promise<{
  comments: PullRequestReviewComment[];
  threads: ReviewThreadState[];
  reactions: ReviewCommentReaction[];
}> {
  return parseJson(await fetch(`${endpoint}/review-comments`));
}

/**
 * Pose ou retire une réaction sur un commentaire de review. `on` porte l'état
 * VOULU, pas une bascule : deux clics concurrents convergent au lieu de
 * s'annuler, et un renvoi après échec réseau ne défait pas ce qui avait abouti.
 */
export async function setPrReviewCommentReactionApi(
  endpoint: PrEndpoint,
  input: { commentId: number; content: ReviewReactionContent; on: boolean },
): Promise<{ ok: true; on: boolean }> {
  return parseJson(
    await fetch(`${endpoint}/review-comments/reactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        comment_id: input.commentId,
        content: input.content,
        on: input.on,
      }),
    }),
  );
}

/** Résout / rouvre un fil de review (`threadId` vient de `threads` ci-dessus). */
export async function setPrReviewThreadResolvedApi(
  endpoint: PrEndpoint,
  input: { threadId: string; resolved: boolean },
): Promise<{ ok: true; resolved: boolean }> {
  return parseJson(
    await fetch(`${endpoint}/review-comments`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thread_id: input.threadId, resolved: input.resolved }),
    }),
  );
}

/**
 * Poste un commentaire sur une ligne du diff. Part immédiatement sur GitHub.
 * Lève une `ApiError` de code `lineNotInDiff` si GitHub refuse d'ancrer la ligne.
 */
export async function postPrReviewCommentApi(
  endpoint: PrEndpoint,
  input: { body: string; path: string; line: number; side: "LEFT" | "RIGHT" },
): Promise<{ comment: PullRequestReviewComment }> {
  return parseJson(
    await fetch(`${endpoint}/review-comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

/** Répond dans un fil de review (`inReplyTo` = n'importe quel id du fil). */
export async function replyPrReviewCommentApi(
  endpoint: PrEndpoint,
  input: { body: string; inReplyTo: number },
): Promise<{ comment: PullRequestReviewComment }> {
  return parseJson(
    await fetch(`${endpoint}/review-comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: input.body, in_reply_to: input.inReplyTo }),
    }),
  );
}

// ── Page Agents (liste globale des sessions) ─────────────────────────────────

/**
 * Une SESSION de l'agent = une issue, et une issue peut avoir plusieurs runs
 * successives (MIN-68). L'endpoint global dédoublonne par issue et renvoie comme
 * REPRÉSENTANT la DERNIÈRE run en date — le badge de la sidebar reflète l'état de
 * la dernière session / dernière PR. Le « titre » de la session est dérivé du
 * titre de l'issue liée (aucun champ propre).
 */
export interface AgentSessionListItem {
  runId: string;
  status: AgentRunStatus;
  model: string | null;
  triggered_by: "button" | "chat" | "mention";
  /** Titre d'une session CARNET (`issue` null) : le résumé écrit au lancement,
   *  à défaut l'excerpt de la note. Cf. la route pour la cascade. */
  noteTitle: string | null;
  pr_number: number | null;
  pr_url: string | null;
  pr_state: "draft" | "open" | "merged" | "closed" | null;
  created_at: string;
  updated_at: string;
  /** Null = session CARNET (MIN-84) : le run est sa propre session. */
  issue: { id: string; number: number; title: string } | null;
  project: { id: string; key: string; name: string; icon_url: string | null } | null;
  /** Un run de l'issue TRAVAILLE (queued/running) → spinner « Numo travaille ». */
  working: boolean;
  /** Nombre total de runs de l'issue (≥ 1) → accès à l'historique. */
  runCount: number;
  /**
   * Dernière fin d'agent de la session (max `completed_at` de ses runs), ou `null`
   * si aucune run n'a jamais terminé. Comparé au `last_read_at` de l'utilisateur →
   * bulle bleue « terminé, non lu ».
   */
  lastCompletedAt: string | null;
  /** La DERNIÈRE run de la session attend une réponse (ask_user) → point JAUNE. */
  awaitingInput: boolean;
}

export async function fetchAgentSessionsApi(): Promise<{
  sessions: AgentSessionListItem[];
}> {
  return parseJson(await fetch(`/api/agent-runs`));
}

// ── État « lu » des sessions d'agent (bulle bleue « terminé, non lu ») ────────

/**
 * Carte { issueId → last_read_at } des sessions consultées par l'utilisateur. Une
 * session est NON LUE quand sa dernière run terminée (`lastCompletedAt`) est
 * postérieure à ce timestamp (ou absente de la carte = jamais consultée).
 */
export async function fetchAgentReadsApi(): Promise<{
  reads: Record<string, string>;
}> {
  return parseJson(await fetch(`/api/agent-reads`));
}

/** Marque une session (issue) comme lue MAINTENANT — upsert `last_read_at = now()`. */
export async function markAgentSessionReadApi(issueId: string): Promise<void> {
  await parseJson(
    await fetch(`/api/agent-reads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ issueId }),
    }),
  );
}

/**
 * Une session est NON LUE quand sa dernière fin d'agent (`lastCompletedAt`) est
 * postérieure au dernier `last_read_at` de l'utilisateur (ou jamais consultée), ET
 * qu'aucun run ne TRAVAILLE : pendant le travail c'est le halo/spinner qui prime, la
 * bulle « terminé » n'apparaît qu'une fois l'agent au repos.
 */
export function isAgentSessionUnread(
  session: Pick<AgentSessionListItem, "working" | "lastCompletedAt" | "issue">,
  reads: Record<string, string>,
): boolean {
  if (session.working || !session.lastCompletedAt || !session.issue) return false;
  const lastRead = reads[session.issue.id];
  // Comparaison NUMÉRIQUE : `completed_at` (Postgres, `…+00:00`) et `last_read_at`
  // (client, `…Z`) n'ont pas le même format string → un `>` lexical serait faux.
  if (!lastRead) return true;
  return new Date(session.lastCompletedAt).getTime() > new Date(lastRead).getTime();
}

/**
 * Un run précis est NON LU : il a terminé (`completed_at`) après le dernier
 * `last_read_at` de la session (ou jamais consultée). Pilote la bulle dans le
 * sélecteur de sessions (chaque run = « Session N »).
 */
export function isAgentRunUnread(
  run: Pick<AgentRunSummary, "completed_at">,
  lastReadAt: string | null | undefined,
): boolean {
  if (!run.completed_at) return false;
  // Comparaison NUMÉRIQUE (formats de date hétérogènes — cf. isAgentSessionUnread).
  if (!lastReadAt) return true;
  return new Date(run.completed_at).getTime() > new Date(lastReadAt).getTime();
}

/**
 * La run est AU REPOS EN ATTENTE d'une réponse de l'utilisateur (tour terminé
 * sur ask_user, MIN-86) : les points « non lu » passent au JAUNE — la
 * conversation est bloquée tant que l'utilisateur n'a pas répondu.
 */
export function isAgentRunAwaitingInput(
  run: Pick<AgentRunSummary, "status" | "awaiting_input">,
): boolean {
  return run.status === "completed" && run.awaiting_input === true;
}

export async function postPullRequestCommentApi(
  prId: string,
  body: string,
): Promise<{ comment: PullRequestComment }> {
  return parseJson(
    await fetch(`${prEndpoint(prId)}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    }),
  );
}
