import { getAuthedUser } from "@/lib/server/api-auth";
import type { NextRequest } from "next/server";
import { getAssistantModelsForUser } from "@/lib/server/agent/models-catalog";
import { getAssistantReasoningLevel } from "@/lib/server/assistant/reasoning";

import { getNumoPreferences } from "@/lib/server/assistant/model-preferences";

export const runtime = "nodejs";

/** Model and reasoning catalog for Numo's conversation composer. */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const [catalog, defaultReasoning] = await Promise.all([
    getAssistantModelsForUser(auth.user.id),
    getAssistantReasoningLevel(),
  ]);
  const preferences = await getNumoPreferences(auth.user.id);
  return Response.json({ ...catalog, defaultModel: preferences.default_model ?? preferences.application_model, defaultReasoning });
}
