import {
  REASONING_LEVELS,
  nearestReasoningLevel,
  type ReasoningLevel,
} from "@/lib/agent-reasoning";

/** Ordered slider stops for a model, with no reasoning fixed at the left edge. */
export function conversationReasoningLevels(
  modelLevels: ReasoningLevel[],
): ReasoningLevel[] {
  const levels = new Set<ReasoningLevel>(["off", ...modelLevels]);
  return REASONING_LEVELS.filter((level) => levels.has(level));
}

/** Place a persisted value on the closest stop the selected model exposes. */
export function conversationReasoningIndex(
  value: ReasoningLevel,
  levels: ReasoningLevel[],
): number {
  const allowed = conversationReasoningLevels(levels);
  return allowed.indexOf(nearestReasoningLevel(value, allowed));
}
