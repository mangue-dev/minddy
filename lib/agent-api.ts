"use client";

/**
 * Fetchers client de l'agent de code (MIN-46) : lancer un run sur une issue et
 * lister ses runs. (Le détail live + events + stop d'un run arrivent en Phase 7.)
 */

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const message =
      (data as { error?: string } | null)?.error || text.trim() || "Request failed";
    throw new Error(message);
  }
  return data as T;
}

export type AgentRunStatus = "queued" | "running" | "completed" | "failed" | "canceled";

export interface AgentRunSummary {
  id: string;
  status: AgentRunStatus;
  model: string | null;
  model_forced: boolean;
  key_mode: "platform" | "byok";
  triggered_by: "button" | "chat" | "mention";
  /** Prompt de lancement (bulle « originelle » de la conversation). */
  prompt: string | null;
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
  body: { prompt?: string; model?: string },
): Promise<{ run: AgentRunSummary }> {
  return parseJson(
    await fetch(`/api/issues/${issueId}/agent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
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
  | "plan_update";

export interface AgentRunEvent {
  id: string;
  seq: number;
  type: AgentEventType;
  payload: Record<string, unknown> | null;
  created_at: string;
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

export async function fetchAgentRunPrApi(
  runId: string,
): Promise<{ pr: PullRequestRef | null; files: PullRequestFile[] }> {
  return parseJson(await fetch(`/api/agent-runs/${runId}/pr`));
}

/**
 * Version base d'un fichier de la PR (texte brut au merge base) — la source du
 * dépliage de contexte dans la vue diff. `path` = chemin côté base.
 */
export async function fetchPrFileSourceApi(
  runId: string,
  path: string,
): Promise<{ content: string }> {
  return parseJson(
    await fetch(`/api/agent-runs/${runId}/pr/file?path=${encodeURIComponent(path)}`),
  );
}

export async function actOnAgentPrApi(
  runId: string,
  action: "merge" | "close",
): Promise<{ ok: true; pr_state: string }> {
  return parseJson(
    await fetch(`/api/agent-runs/${runId}/pr`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    }),
  );
}

/**
 * Demande des changements à Numo (MIN-66 + MIN-68) : poste la review sur la PR, puis
 * lance une NOUVELLE run froide (modèle au choix) qui itère sur cette même PR.
 */
export async function requestAgentPrChangesApi(
  runId: string,
  message: string,
  model?: string,
): Promise<{ ok: true; run: { id: string } }> {
  return parseJson(
    await fetch(`/api/agent-runs/${runId}/pr`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "request_changes", message, model }),
    }),
  );
}

// ── Page Pull Requests globale (MIN-66) ──────────────────────────────────────

export interface PullRequestListItem {
  runId: string;
  pr_number: number;
  pr_url: string | null;
  pr_state: "draft" | "open" | "merged" | "closed" | null;
  model: string | null;
  created_at: string;
  updated_at: string;
  issue: { id: string; number: number; title: string } | null;
  project: { id: string; key: string; name: string } | null;
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

export async function fetchAllPullRequestsApi(): Promise<{
  pullRequests: PullRequestListItem[];
}> {
  return parseJson(await fetch(`/api/pull-requests`));
}

export async function fetchPrCommentsApi(
  runId: string,
): Promise<{ comments: PullRequestComment[] }> {
  return parseJson(await fetch(`/api/agent-runs/${runId}/comments`));
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
  pr_number: number | null;
  pr_url: string | null;
  pr_state: "draft" | "open" | "merged" | "closed" | null;
  created_at: string;
  updated_at: string;
  issue: { id: string; number: number; title: string } | null;
  project: { id: string; key: string; name: string } | null;
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

export async function postPrCommentApi(
  runId: string,
  body: string,
): Promise<{ comment: PullRequestComment }> {
  return parseJson(
    await fetch(`/api/agent-runs/${runId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    }),
  );
}
