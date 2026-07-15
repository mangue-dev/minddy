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

export type AgentRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "canceled"
  | "needs_input";

export interface AgentRunSummary {
  id: string;
  status: AgentRunStatus;
  model: string | null;
  model_forced: boolean;
  key_mode: "platform" | "byok";
  triggered_by: "button" | "chat" | "mention";
  pr_number: number | null;
  pr_url: string | null;
  pr_state: "draft" | "open" | "merged" | "closed" | null;
  continuations: number;
  cost_usd: number;
  outcome: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Statuts d'une SESSION reprennable (jamais fermée) : l'agent travaille
 * (queued/running) ou se repose en attendant l'utilisateur (needs_input). Sert à
 * décider si on peut steerer / rouvrir la conversation.
 */
export const ACTIVE_AGENT_STATUSES: AgentRunStatus[] = ["queued", "running", "needs_input"];

export function isAgentRunActive(status: AgentRunStatus): boolean {
  return ACTIVE_AGENT_STATUSES.includes(status);
}

/**
 * L'agent est-il en train de TRAVAILLER (par opposition au repos `needs_input`) ?
 * Pilote le halo animé des cartes, le polling d'events, et l'affichage du bouton
 * « Interrompre » dans la conversation.
 */
export function isAgentRunWorking(status: AgentRunStatus): boolean {
  return status === "queued" || status === "running";
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
 * Steering d'un run actif (MIN-46) : envoie un message à l'agent (orientation à
 * chaud, ou réponse à un `ask_user` qui reprend le run).
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
}

export async function fetchAgentRunPrApi(
  runId: string,
): Promise<{ pr: PullRequestRef | null; files: PullRequestFile[] }> {
  return parseJson(await fetch(`/api/agent-runs/${runId}/pr`));
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

/** Demande des changements à Numo : relance l'agent sur la même PR (MIN-66). */
export async function requestAgentPrChangesApi(
  runId: string,
  message: string,
): Promise<{ ok: true; run: { id: string } }> {
  return parseJson(
    await fetch(`/api/agent-runs/${runId}/pr`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "request_changes", message }),
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
  /** Un run encore actif sur cette PR = « Numo retravaille ». */
  activeRunId: string | null;
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
