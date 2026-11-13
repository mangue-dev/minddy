import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { isKnownAgentProvider } from "@/lib/agent-providers";
import { MINDDY_CLOUD_PROVIDER, type AiProviderChoice } from "@/lib/ai-surfaces";
import { isDecisionEngine, type DecisionEngine } from "@/lib/decision-engine";
import {
  DecisionSettingsError,
  getDecisionSettings,
  updateDecisionSettings,
  type DecisionSettingsPatch,
} from "@/lib/server/decisions/engine";
import { captureServerException } from "@/lib/server/error-tracking";

export const runtime = "nodejs";

/** The account's decision settings (MIN-980): engine, provider and model. */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(await getDecisionSettings(auth.user.id));
  } catch (error) {
    await captureServerException(error, request.headers.get("cookie"), {
      routePath: "/api/account/ai-decisions", routeType: "route", httpMethod: "GET",
    });
    return NextResponse.json({ error: "Could not load decision settings" }, { status: 503 });
  }
}

/**
 * Changes the account's decision settings. Each field is optional; `null`
 * returns it to its default: the instance's engine, the automatic provider,
 * the provider's default model.
 */
export async function PUT(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const patch: DecisionSettingsPatch = {};
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid decision settings" }, { status: 400 });
  }
  if ("engine" in body) {
    if (body.engine !== null && !isDecisionEngine(body.engine)) {
      return NextResponse.json({ error: "Invalid decision engine" }, { status: 400 });
    }
    patch.engine = body.engine as DecisionEngine | null;
  }
  if ("provider" in body) {
    if (!(body.provider === null || body.provider === MINDDY_CLOUD_PROVIDER ||
      (typeof body.provider === "string" && isKnownAgentProvider(body.provider)))) {
      return NextResponse.json({ error: "Invalid decision provider" }, { status: 400 });
    }
    patch.provider = body.provider as AiProviderChoice | null;
  }
  if ("model" in body) {
    if (!(body.model === null || (typeof body.model === "string" && body.model.length <= 200))) {
      return NextResponse.json({ error: "Invalid decision model" }, { status: 400 });
    }
    patch.model = body.model as string | null;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No setting supplied" }, { status: 400 });
  }
  try {
    return NextResponse.json(await updateDecisionSettings(auth.user.id, patch));
  } catch (error) {
    if (error instanceof DecisionSettingsError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    await captureServerException(error, request.headers.get("cookie"), {
      routePath: "/api/account/ai-decisions", routeType: "route", httpMethod: "PUT",
    });
    return NextResponse.json({ error: "Could not save decision settings" }, { status: 503 });
  }
}
