import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { isAdminUser } from "@/lib/server/admin";
import { getAdminModelCatalog } from "@/lib/server/agent/models-catalog";
import { isAdminCatalogCapability } from "@/lib/model-catalog-capability";

/**
 * Admin dashboard template catalog (`/admin` → “Templates” tab).
 *
 * Deliberately distinct from `/api/assistant/models`: that one resolves the
 * provider serving the account's Numo (its BYOK), while the `app_config`
 * models always run on the OpenRouter platform key, and an admin's Anthropic
 * catalog would write ids the runtime cannot use.
 * Capability-aware filtering keeps conversational, transcription, embedding
 * and decision settings on separate compatible model lists.
 *
 * Conversational models carry their cost multiplier without a plan ceiling.
 * Non-text model pricing uses different units, so those catalogs do not show
 * a misleading comparison against the conversational baseline.
 */

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  if (!(await isAdminUser(auth.user, auth.claims))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const capability = request.nextUrl.searchParams.get("capability") ?? "text";
  if (!isAdminCatalogCapability(capability)) {
    return NextResponse.json({ error: "Unknown model capability" }, { status: 400 });
  }

  return NextResponse.json(await getAdminModelCatalog(capability));
}
