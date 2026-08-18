import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { isAdminUser } from "@/lib/server/admin";
import { getAdminModelCatalog } from "@/lib/server/agent/models-catalog";

/**
 * Admin dashboard template catalog (`/admin` → “Templates” tab).
 *
 * Deliberately distinct from `/api/agent/models`: this one resolves the provider
 * ACTIVE of the account (its BYOK), while the `app_config` models are running
 * still on the OpenRouter platform key — offer the Anthropic catalog
 * of an admin in BYOK would cause runtime to write unusable ids. And he doesn't
 * not filter on tool-calling, since the config also covers the
 * transcription and embeddings.
 *
 * Each model carries its cost multiplier, without a ceiling in front: it is
 * here we choose what minddy pays — the cost scale is the information
 * work, while no billing plan applies to a setting
 * d'instance.
 */

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  if (!(await isAdminUser(auth.user))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(await getAdminModelCatalog());
}
