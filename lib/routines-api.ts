import { trackEvent } from "./analytics";
import { lengthBucket } from "./analytics-sanitize";
import type { AgentRunSummary } from "./agent-api";
import type { ReasoningLevel } from "./agent-reasoning";
import type { RoutineFrequency } from "./routine-schedule";

/**
 * Client des ROUTINES (MIN-185) — la porte HTTP, côté navigateur.
 *
 * Même forme que `lib/agent-api.ts` : des fetchers nus qui lèvent une
 * `RoutineApiError` portant le `code` métier de la route. C'est ce code que
 * l'écran traduit — `ownerOnly`, `modelAbovePlan`, `unknownTimezone` — plutôt
 * que le message anglais du serveur.
 */

/** Erreur d'API qui garde le `code` de la route, pour que l'UI le traduise. */
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

/** Une routine, telle que l'API la rend. */
export interface Routine {
  id: string;
  project_id: string;
  owner_id: string;
  title: string;
  prompt: string;
  model: string | null;
  reasoning_level: ReasoningLevel;
  base_branch: string | null;
  frequency: RoutineFrequency;
  hour: number;
  minute: number;
  weekdays: number[];
  days_of_month: number[];
  timezone: string;
  enabled: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  /** CODE du dernier passage manqué (`quota`, `noRepo`…), traduit par l'UI. */
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

/** Ce qu'une création envoie — la même forme que la fabrique attend. */
export interface RoutineInput {
  projectId: string;
  /** Pas de titre : minddy l'écrit à partir de l'instruction (cf. `titleFor`). */
  prompt: string;
  model?: string | null;
  reasoningLevel?: ReasoningLevel;
  baseBranch?: string | null;
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
  // Aligné sur `launchNotebookAgentApi` : ce qu'on mesure, c'est la FORME du
  // geste (cadence, modèle choisi ou non), jamais l'instruction elle-même.
  trackEvent("routine_created", {
    frequency: input.frequency,
    model: input.model ?? "default",
    reasoning_level: input.reasoningLevel ?? "default",
    has_branch: !!input.baseBranch,
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

/** Les « Exécutions précédentes » — les runs de la routine, la plus récente en tête. */
export async function fetchRoutineRunsApi(
  routineId: string,
): Promise<{ runs: AgentRunSummary[] }> {
  return parseJson(await fetch(`/api/routines/${routineId}/runs`));
}

/** « Lancer maintenant » : un passage hors calendrier, sans déplacer l'échéance. */
export async function runRoutineNowApi(
  routineId: string,
): Promise<{ run: AgentRunSummary }> {
  trackEvent("routine_run_now", {});
  return parseJson(
    await fetch(`/api/routines/${routineId}/run`, { method: "POST" }),
  );
}
