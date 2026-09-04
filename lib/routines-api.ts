import { trackEvent } from "./analytics";
import { lengthBucket } from "./analytics-sanitize";
import type { AgentRunSummary } from "./agent-api";
import type { ReasoningLevel } from "./agent-reasoning";
import type { AssistantMention } from "./assistant-types";
import { DEFAULT_MAX_SPEND_PERCENT } from "./routine-budget";
import type { RoutineFrequency } from "./routine-schedule";

/**
 * ROUTINES client (MIN-185) — the HTTP gate, browser side.
 *
 * Same form as `lib/agent-api.ts`: bare fetchers which raise a
 * `RoutineApiError` carrying the `code` business the road. It is this code that
 * the screen translates — `ownerOnly`, `modelAbovePlan`, `unknownTimezone` — rather
 * than the English message from the server.
 */

/** API error that keeps the `code` from the route, for the UI to translate. */
export class RoutineApiError extends Error {
  code?: string;
  details?: Record<string, unknown>;
  constructor(message: string, code?: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "RoutineApiError";
    this.code = code;
    this.details = details;
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
    const payload = data as
      | { error?: string; code?: string; modelLimit?: Record<string, unknown> }
      | null;
    throw new RoutineApiError(
      payload?.error || text.trim() || "Request failed",
      payload?.code,
      payload?.modelLimit,
    );
  }
  return data as T;
}

/** A routine, as the API renders it. */
export interface Routine {
  id: string;
  project_id: string;
  owner_id: string;
  title: string;
  prompt: string;
  prompt_mentions: AssistantMention[];
  model: string | null;
  reasoning_level: ReasoningLevel;
  base_branch: string | null;
  /** Share of the monthly budget that ONE passage can spend (1–100; 100 = without
 * own ceiling, only the account quota limits). */
  max_spend_percent: number;
  frequency: RoutineFrequency;
  hour: number;
  minute: number;
  weekdays: number[];
  days_of_month: number[];
  timezone: string;
  enabled: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  /** CODE of the last missed passage (`quota`, `noRepo`…), translated by the UI. */
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

/** What a creation sends — the same form the factory expects. */
export interface RoutineInput {
  projectId: string;
  /** No title: minddy writes it from the instruction (see `titleFor`). */
  prompt: string;
  promptMentions?: AssistantMention[];
  model?: string | null;
  reasoningLevel?: ReasoningLevel;
  baseBranch?: string | null;
  /** Ceiling for a passage, as a % of the monthly budget. Absent = the defect (90%). */
  maxSpendPercent?: number;
  frequency: RoutineFrequency;
  hour: number;
  minute: number;
  weekdays?: number[] | null;
  daysOfMonth?: number[] | null;
  timezone: string;
}

export async function fetchRoutinesApi(): Promise<{ routines: Routine[] }> {
  return parseJson(await fetch("/api/routines"));
}

export async function createRoutineApi(
  input: RoutineInput,
): Promise<{ routine: Routine }> {
  // Aligned with `launchNotebookAgentApi`: what we measure is the SHAPE of the
  // gesture (cadence, model chosen or not), never the instruction itself.
  trackEvent("routine_created", {
    frequency: input.frequency,
    model: input.model ?? "default",
    reasoning_level: input.reasoningLevel ?? "default",
    has_branch: !!input.baseBranch,
    // The chosen spending limit: this is the setting we want to know if it
    // is TOUCHED, and in what sense — a defect that no one moves is not
    // the correct default.
    spend_cap_percent: input.maxSpendPercent ?? DEFAULT_MAX_SPEND_PERCENT,
    prompt_length_bucket: lengthBucket(input.prompt),
  });
  return parseJson(
    await fetch("/api/routines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function updateRoutineApi(
  routineId: string,
  patch: Partial<Omit<RoutineInput, "projectId">> & { enabled?: boolean },
): Promise<{ routine: Routine }> {
  return parseJson(
    await fetch(`/api/routines/${routineId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),
  );
}

export async function deleteRoutineApi(routineId: string): Promise<{ ok: true }> {
  return parseJson(await fetch(`/api/routines/${routineId}`, { method: "DELETE" }));
}

/** “Previous Runs” — the runs of the routine, with the most recent one at the top. */
export async function fetchRoutineRunsApi(
  routineId: string,
): Promise<{ runs: AgentRunSummary[] }> {
  return parseJson(await fetch(`/api/routines/${routineId}/runs`));
}

/** “Launch now”: a move outside of the calendar, without moving the deadline. */
export async function runRoutineNowApi(
  routineId: string,
): Promise<{ run: AgentRunSummary }> {
  trackEvent("routine_run_now", {});
  return parseJson(
    await fetch(`/api/routines/${routineId}/run`, { method: "POST" }),
  );
}
