import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { isKnownAgentProvider } from "@/lib/agent-providers";
import {
  MINDDY_CLOUD_PROVIDER,
  ROUTED_AI_SURFACES,
  isRoutedAiSurface,
  type AiProviderChoice,
} from "@/lib/ai-surfaces";
import {
  AiRouteError,
  getAiProviderOptions,
  getAiRoutes,
  setAiRoute,
} from "@/lib/server/ai-routes";

export const runtime = "nodejs";

async function routesPayload(userId: string) {
  const [routes, options] = await Promise.all([
    getAiRoutes(userId),
    Promise.all(ROUTED_AI_SURFACES.map(async (surface) =>
      [surface, await getAiProviderOptions(userId, surface)] as const)),
  ]);
  return { routes, options: Object.fromEntries(options) };
}

/** The provider of each AI usage, and the providers each usage can choose (MIN-826). */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  return NextResponse.json(await routesPayload(auth.user.id));
}

/** Routes one usage to a provider: `minddy` or one of the account's credentials. */
export async function PUT(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => null) as { surface?: unknown; provider?: unknown } | null;
  if (!body || !isRoutedAiSurface(body.surface) || !(body.provider === MINDDY_CLOUD_PROVIDER ||
    (typeof body.provider === "string" && isKnownAgentProvider(body.provider)))) {
    return NextResponse.json({ error: "Invalid AI usage route" }, { status: 400 });
  }
  try {
    await setAiRoute(auth.user.id, body.surface, body.provider as AiProviderChoice);
  } catch (error) {
    if (error instanceof AiRouteError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
  return NextResponse.json(await routesPayload(auth.user.id));
}
