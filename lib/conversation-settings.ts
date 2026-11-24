import { REASONING_LEVELS, type ReasoningLevel } from "@/lib/agent-reasoning";

/** The reasoning levels a conversation can use on a model, with no reasoning first. */
export function conversationReasoningLevels(
  modelLevels: ReasoningLevel[],
): ReasoningLevel[] {
  const levels = new Set<ReasoningLevel>(["off", ...modelLevels]);
  return REASONING_LEVELS.filter((level) => levels.has(level));
}
