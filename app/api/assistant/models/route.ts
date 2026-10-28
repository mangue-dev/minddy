import { getAuthedUser } from "@/lib/server/api-auth";
import type { NextRequest } from "next/server";
import { getAssistantModelsForUser } from "@/lib/server/agent/models-catalog";
import { getAssistantReasoningLevel } from "@/lib/server/assistant/reasoning";
import { isKnownAgentProvider } from "@/lib/agent-providers";
import { MINDDY_CLOUD_PROVIDER, type AiProviderChoice } from "@/lib/ai-surfaces";

import {
  getNumoDefaultModel,
  getNumoPreferences,
  numoApplicationModel,
} from "@/lib/server/assistant/model-preferences";
import { DatabaseOperationError } from "@/lib/server/failure-diagnostics";
import { captureServerException } from "@/lib/server/error-tracking";

export const runtime = "nodejs";

function providerParam(request: NextRequest): AiProviderChoice | null {
  const value = new URL(request.url).searchParams.get("provider");
  if (!value) return null;
  return value === MINDDY_CLOUD_PROVIDER || isKnownAgentProvider(value) ? value as AiProviderChoice : null;
}

/**
 * Model and reasoning catalog for Numo's conversation composer. Without a
 * `provider`, the catalog of Numo's default provider; with one, the models of
 * that provider (MIN-826), so the picker chooses a provider, then a model.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const preferences = await getNumoPreferences(auth.user.id).catch((error: unknown) => {
    if (!(error instanceof DatabaseOperationError)) throw error;
    return error;
  });
  if (preferences instanceof DatabaseOperationError) {
    // Model discovery remains available for an explicit selection. Turn admission
    // still requires the saved preference before choosing an implicit default.
    await captureServerException(preferences, request.headers.get("cookie"), {
      routePath: "/api/assistant/models", routeType: "route", httpMethod: "GET",
    });
  }
  const accountProvider = preferences instanceof DatabaseOperationError ? null : preferences.provider;
  const choice = providerParam(request) ?? accountProvider;
  const [catalog, defaultReasoning, defaultModel] = await Promise.all([
    getAssistantModelsForUser(auth.user.id, undefined, choice),
    getAssistantReasoningLevel(),
    !choice
      ? Promise.resolve(null)
      : choice === accountProvider && !(preferences instanceof DatabaseOperationError)
        ? Promise.resolve(preferences.default_model ?? preferences.application_model)
        : Promise.all([getNumoDefaultModel(auth.user.id, choice), numoApplicationModel(choice)])
          .then(([saved, application]) => saved ?? application)
          .catch(() => null),
  ]);
  return Response.json({
    ...catalog,
    defaultModel,
    defaultReasoning,
    providerChoice: choice,
    defaultProvider: accountProvider,
    providers: preferences instanceof DatabaseOperationError ? [] : preferences.providers,
  });
}
