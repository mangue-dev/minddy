import { getAuthedUser } from "@/lib/server/api-auth";
import type { NextRequest } from "next/server";
import { getAssistantModelsForUser } from "@/lib/server/agent/models-catalog";
import { getAssistantReasoningLevel } from "@/lib/server/assistant/reasoning";

import { getNumoPreferences } from "@/lib/server/assistant/model-preferences";
import { DatabaseOperationError } from "@/lib/server/failure-diagnostics";
import { captureServerException } from "@/lib/server/error-tracking";

export const runtime = "nodejs";

/** Model and reasoning catalog for Numo's conversation composer. */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const [catalog, defaultReasoning] = await Promise.all([
    getAssistantModelsForUser(auth.user.id),
    getAssistantReasoningLevel(),
  ]);
  let defaultModel: string | null = null;
  try {
    const preferences = await getNumoPreferences(auth.user.id);
    defaultModel = preferences.default_model ?? preferences.application_model;
  } catch (error) {
    if (!(error instanceof DatabaseOperationError) || error.operation !== "read_numo_preferences") throw error;
    // Model discovery remains available for an explicit selection. Turn admission
    // still requires the saved preference before choosing an implicit default.
    await captureServerException(error, request.headers.get("cookie"), {
      routePath: "/api/assistant/models", routeType: "route", httpMethod: "GET",
    });
  }
  return Response.json({ ...catalog, defaultModel, defaultReasoning });
}
