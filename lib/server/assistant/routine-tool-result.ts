export type RoutineToolSource = {
  id: string;
  title: string;
  prompt: string;
  model: string | null;
  max_spend_percent: number;
  frequency: string;
  hour: number;
  minute: number;
  weekdays: number[];
  days_of_month: number[];
  timezone: string;
  enabled: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  last_error: string | null;
};

/**
 * Enough for a maximum-length instruction plus routine metadata and JSON
 * escaping. The general tool ceiling is intentionally much smaller.
 */
export const ROUTINE_TOOL_RESULT_CHAR_LIMIT = 48_000;

/** Enough for dozens of routine summaries without spending room on instructions. */
export const ROUTINE_LIST_RESULT_CHAR_LIMIT = 24_000;

/** Serialize a routine for Numo, optionally omitting its potentially long instruction. */
export function routineForAssistantTool(
  routine: RoutineToolSource,
  options: { includePrompt?: boolean } = {},
) {
  return {
    id: routine.id,
    title: routine.title,
    ...(options.includePrompt === false ? {} : { prompt: routine.prompt }),
    model: routine.model,
    /** What one run can spend, as a percentage of the owner's monthly budget. */
    max_spend_percent: routine.max_spend_percent,
    frequency: routine.frequency,
    hour: routine.hour,
    minute: routine.minute,
    weekdays: routine.weekdays,
    days_of_month: routine.days_of_month,
    timezone: routine.timezone,
    enabled: routine.enabled,
    next_run_at: routine.next_run_at,
    last_run_at: routine.last_run_at,
    last_error: routine.last_error,
  };
}

/** Build either the compact collection or one full routine selected from it. */
export function routinesForAssistantTool(
  routines: RoutineToolSource[],
  routineId?: string,
) {
  if (routineId) {
    const routine = routines.find((candidate) => candidate.id === routineId);
    return routine ? [routineForAssistantTool(routine)] : null;
  }

  return routines.map((routine) =>
    routineForAssistantTool(routine, { includePrompt: false }),
  );
}
