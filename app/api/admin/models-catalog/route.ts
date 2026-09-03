import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { isAdminUser } from "@/lib/server/admin";
import { getAdminModelCatalog } from "@/lib/server/agent/models-catalog";
import { isModelCatalogCapability } from "@/lib/model-catalog-capability";

/**
 * Admin dashboard template catalog (`/admin` → “Templates” tab).
 *
 * Deliberately distinct from `/api/agent/models`: this one resolves the provider
 * ACTIVE of the account (its BYOK), while the `app_config` models are running
 * still on the OpenRouter platform key — offer the Anthropic catalog
 * of an admin in BYOK would cause runtime to write unusable ids. And he doesn't
 * Capability-aware filtering keeps conversational, transcription, and
 * embedding settings on separate compatible model lists.
 *
 * Conversational models carry their cost multiplier without a plan ceiling.
 * Non-text model pricing uses different units, so those catalogs do not show
 * a misleading comparison against the conversational baseline.
 */

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  if (!(await isAdminUser(auth.user))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const capability = request.nextUrl.searchParams.get("capability") ?? "text";
  if (!isModelCatalogCapability(capability)) {
    return NextResponse.json({ error: "Unknown model capability" }, { status: 400 });
  }

  return NextResponse.json(await getAdminModelCatalog(capability));
}
