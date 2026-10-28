import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { isKnownAgentProvider } from "@/lib/agent-providers";
import {
  MINDDY_CLOUD_PROVIDER,
  isByokModelKey,
  type AiProviderChoice,
  type ByokModelKey,
} from "@/lib/ai-surfaces";
import {
  AiRouteError,
  getAiRoutes,
  getAllAiProviderOptions,
  setAiRoute,
} from "@/lib/server/ai-routes";

export const runtime = "nodejs";

async function routesPayload(userId: string) {
  const [routes, options] = await Promise.all([getAiRoutes(userId), getAllAiProviderOptions(userId)]);
  return { routes, options };
}

/** The provider of each AI call type, and the providers each one can choose (MIN-826). */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  return NextResponse.json(await routesPayload(auth.user.id));
}

/** Routes one call type to a provider: `minddy` or one of the account's credentials. */
export async function PUT(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => null) as { usage?: unknown; provider?: unknown } | null;
  if (!body || typeof body.usage !== "string" || !isByokModelKey(body.usage) ||
    !(body.provider === MINDDY_CLOUD_PROVIDER ||
      (typeof body.provider === "string" && isKnownAgentProvider(body.provider)))) {
    return NextResponse.json({ error: "Invalid AI usage route" }, { status: 400 });
  }
  try {
    await setAiRoute(auth.user.id, body.usage as ByokModelKey, body.provider as AiProviderChoice);
  } catch (error) {
    if (error instanceof AiRouteError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
  return NextResponse.json(await routesPayload(auth.user.id));
}
