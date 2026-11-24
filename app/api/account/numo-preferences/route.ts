import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import {
  getNumoPreferences,
  numoApplicationModel,
  numoModelIsInstanceDefined,
  saveNumoDefaultModel,
} from "@/lib/server/assistant/model-preferences";
import { resolveNumoTurnConfiguration, isNumoConversationConfigError } from "@/lib/server/assistant/conversation-config";
import { isPlanLimitError, planLimitResponse } from "@/lib/server/plan-limit-error";
import { captureServerException } from "@/lib/server/error-tracking";
import { AiRouteError, setAiRoute } from "@/lib/server/ai-routes";
import { isKnownAgentProvider } from "@/lib/agent-providers";
import { MINDDY_CLOUD_PROVIDER, type AiProviderChoice } from "@/lib/ai-surfaces";
import { isReasoningLevel, type ReasoningLevel } from "@/lib/agent-reasoning";

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(await getNumoPreferences(auth.user.id));
  } catch (error) {
    // A handled 503 never reaches `onRequestError`; report it so the
    // settings alert (MIN-722) has a server-side trace.
    await captureServerException(error, request.headers.get("cookie"), {
      routePath: "/api/account/numo-preferences", routeType: "route", httpMethod: "GET",
    });
    return NextResponse.json({ error: "Could not load Numo preferences" }, { status: 503 });
  }
}

/**
 * Saves Numo's default provider, model and reasoning level (MIN-826). The
 * provider is the route of the Numo usage; the model and level are saved for
 * that provider, after they passed the provider's catalog. Only a personal
 * key takes them: on the instance's provider the administrator's model and
 * level run (MIN-954). An omitted level is a null one: it follows the
 * instance's.
 */
export async function PUT(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  let provider: AiProviderChoice;
  let model: string | null;
  let reasoningLevel: ReasoningLevel | null;
  try {
    const body = await request.json() as { provider?: unknown; default_model?: unknown; reasoning_level?: unknown };
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    if (body.provider !== MINDDY_CLOUD_PROVIDER &&
      !(typeof body.provider === "string" && isKnownAgentProvider(body.provider))) throw new Error();
    if (!(body.default_model === null ||
      typeof body.default_model === "string" && /^[\w./:@-]{1,200}$/.test(body.default_model))) throw new Error();
    if (!(body.reasoning_level === undefined || body.reasoning_level === null ||
      isReasoningLevel(body.reasoning_level))) throw new Error();
    provider = body.provider as AiProviderChoice;
    model = body.default_model;
    reasoningLevel = body.reasoning_level ?? null;
  } catch {
    return NextResponse.json({ error: "Invalid Numo model preference" }, { status: 400 });
  }
  if ((model !== null || reasoningLevel !== null) && numoModelIsInstanceDefined(provider)) {
    return NextResponse.json({
      error: "Numo's model is set by this workspace's administrator. Use a personal key to choose another.",
      code: "model_locked",
    }, { status: 422 });
  }
  try {
    if (model !== null || reasoningLevel !== null) {
      // The level must be one this model offers: the application default
      // when the account follows it, not the model saved before.
      await resolveNumoTurnConfiguration({
        userId: auth.user.id, provider, model: model ?? await numoApplicationModel(provider),
        reasoningLevel, catalogOnly: true,
      });
    }
    await setAiRoute(auth.user.id, "assistant_model", provider);
    await saveNumoDefaultModel(auth.user.id, provider, model, reasoningLevel);
    return NextResponse.json(await getNumoPreferences(auth.user.id));
  } catch (error) {
    if (isPlanLimitError(error)) return planLimitResponse(error);
    if (isNumoConversationConfigError(error)) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof AiRouteError) return NextResponse.json({ error: error.message }, { status: error.status });
    // Same as GET: a handled 503 never reaches `onRequestError`.
    await captureServerException(error, request.headers.get("cookie"), {
      routePath: "/api/account/numo-preferences", routeType: "route", httpMethod: "PUT",
    });
    return NextResponse.json({ error: "Could not save Numo preferences" }, { status: 503 });
  }
}
