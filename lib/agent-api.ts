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

export const ACTIVE_AGENT_STATUSES: AgentRunStatus[] = ["queued", "running", "needs_input"];

export function isAgentRunActive(status: AgentRunStatus): boolean {
  return ACTIVE_AGENT_STATUSES.includes(status);
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
  | "summary";

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

export async function stopAgentRunApi(runId: string): Promise<void> {
  await parseJson(await fetch(`/api/agent-runs/${runId}/stop`, { method: "POST" }));
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
