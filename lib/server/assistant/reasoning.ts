import "server-only";

import { getAppConfigValue } from "@/lib/server/app-config";
import { toReasoningLevel, type ReasoningLevel } from "@/lib/agent-reasoning";
import {
  aiModelFallback,
  ASSISTANT_REASONING_CONFIG_KEY,
} from "@/lib/ai-model-config";

/** Resolve the instance-wide reasoning level shared by Numo chat and comments. */
export async function getAssistantReasoningLevel(): Promise<ReasoningLevel> {
  const configured = await getAppConfigValue(ASSISTANT_REASONING_CONFIG_KEY);
  return toReasoningLevel(
    configured?.trim() || aiModelFallback(ASSISTANT_REASONING_CONFIG_KEY),
  );
}
