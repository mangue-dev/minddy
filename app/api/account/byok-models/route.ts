import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { isModelCatalogCapability } from "@/lib/model-catalog-capability";
import { getActiveByokModelCatalog } from "@/lib/server/agent/models-catalog";

export const runtime = "nodejs";

/** Model catalog for one supported family of the account's active BYOK provider. */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const capability = request.nextUrl.searchParams.get("capability") ?? "text";
  if (!isModelCatalogCapability(capability)) {
    return NextResponse.json({ error: "Unknown model capability" }, { status: 400 });
  }
  return NextResponse.json(await getActiveByokModelCatalog(auth.user.id, capability));
}
