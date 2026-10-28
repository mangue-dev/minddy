import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { isModelCatalogCapability } from "@/lib/model-catalog-capability";
import { getActiveByokModelCatalog } from "@/lib/server/agent/models-catalog";
import { isKnownAgentProvider, type AgentProviderId } from "@/lib/agent-providers";

export const runtime = "nodejs";

/**
 * Model catalog for one supported family of an account credential: the one
 * named by `provider` (MIN-826), or the Numo route's otherwise.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const capability = request.nextUrl.searchParams.get("capability") ?? "text";
  if (!isModelCatalogCapability(capability)) {
    return NextResponse.json({ error: "Unknown model capability" }, { status: 400 });
  }
  const provider = request.nextUrl.searchParams.get("provider");
  if (provider && !isKnownAgentProvider(provider)) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }
  return NextResponse.json(await getActiveByokModelCatalog(
    auth.user.id, capability, (provider || undefined) as AgentProviderId | undefined,
  ));
}
