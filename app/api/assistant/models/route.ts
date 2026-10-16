import { getAuthedUser } from "@/lib/server/api-auth";
import type { NextRequest } from "next/server";
import { getUserByok } from "@/lib/server/agent/model";
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

  // One BYOK resolution serves the catalog and the preference namespace, and
  // the preference read no longer waits for the catalog.
  const byok = getUserByok(auth.user.id, "assistant");
  const [catalog, defaultReasoning, preferences] = await Promise.all([
    getAssistantModelsForUser(auth.user.id, byok),
    getAssistantReasoningLevel(),
    getNumoPreferences(auth.user.id, byok).catch((error: unknown) => {
      if (!(error instanceof DatabaseOperationError) || error.operation !== "read_numo_preferences") throw error;
      return error;
    }),
  ]);
  let defaultModel: string | null = null;
  if (preferences instanceof DatabaseOperationError) {
    // Model discovery remains available for an explicit selection. Turn admission
    // still requires the saved preference before choosing an implicit default.
    await captureServerException(preferences, request.headers.get("cookie"), {
      routePath: "/api/assistant/models", routeType: "route", httpMethod: "GET",
    });
  } else {
    defaultModel = preferences.default_model ?? preferences.application_model;
  }
  return Response.json({ ...catalog, defaultModel, defaultReasoning });
}
