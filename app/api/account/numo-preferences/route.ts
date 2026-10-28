import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getNumoPreferences, saveNumoDefaultModel } from "@/lib/server/assistant/model-preferences";
import { resolveNumoTurnConfiguration, isNumoConversationConfigError } from "@/lib/server/assistant/conversation-config";
import { isPlanLimitError, planLimitResponse } from "@/lib/server/plan-limit-error";
import { captureServerException } from "@/lib/server/error-tracking";
import { AiRouteError, setAiRoute } from "@/lib/server/ai-routes";
import { isKnownAgentProvider } from "@/lib/agent-providers";
import { MINDDY_CLOUD_PROVIDER, type AiProviderChoice } from "@/lib/ai-surfaces";

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
 * Saves Numo's default provider and model (MIN-826). The provider is the
 * route of the Numo usage; the model is saved for that provider, after it
 * passed the provider's catalog and the plan ceiling.
 */
export async function PUT(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  let provider: AiProviderChoice;
  let model: string | null;
  try {
    const body = await request.json() as { provider?: unknown; default_model?: unknown };
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    if (body.provider !== MINDDY_CLOUD_PROVIDER &&
      !(typeof body.provider === "string" && isKnownAgentProvider(body.provider))) throw new Error();
    if (!(body.default_model === null ||
      typeof body.default_model === "string" && /^[\w./:@-]{1,200}$/.test(body.default_model))) throw new Error();
    provider = body.provider as AiProviderChoice;
    model = body.default_model;
  } catch {
    return NextResponse.json({ error: "Invalid Numo model preference" }, { status: 400 });
  }
  try {
    if (model !== null) {
      await resolveNumoTurnConfiguration({
        userId: auth.user.id, provider, model, catalogOnly: true,
      });
    }
    await setAiRoute(auth.user.id, "assistant", provider);
    await saveNumoDefaultModel(auth.user.id, provider, model);
    return NextResponse.json(await getNumoPreferences(auth.user.id));
  } catch (error) {
    if (isPlanLimitError(error)) return planLimitResponse(error);
    if (isNumoConversationConfigError(error)) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof AiRouteError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Could not save Numo preferences" }, { status: 503 });
  }
}
