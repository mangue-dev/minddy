import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { isAdminUser } from "@/lib/server/admin";
import { getByokModelCatalog } from "@/lib/server/agent/byok-models";
import { isByokCatalogProvider } from "@/lib/byok-model-catalog";
import { isModelCatalogCapability } from "@/lib/model-catalog-capability";

/**
 * Native model list of one BYOK provider and runtime capability, for the model
 * selects of `/admin` → “Models” (MIN-416). Sourced from the public
 * OpenRouter index server-side: works with no provider API key at all.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  if (!(await isAdminUser(auth.user))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const provider = request.nextUrl.searchParams.get("provider");
  if (!isByokCatalogProvider(provider)) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }

  const capability = request.nextUrl.searchParams.get("capability") ?? "text";
  if (!isModelCatalogCapability(capability)) {
    return NextResponse.json({ error: "Unknown model capability" }, { status: 400 });
  }

  const models = await getByokModelCatalog(provider, capability);
  return NextResponse.json({ provider, models });
}
