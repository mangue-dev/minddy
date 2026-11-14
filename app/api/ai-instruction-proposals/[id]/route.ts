import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { resolveAiInstructionProposal } from "@/lib/server/ai-instruction-proposals";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";
import { getServiceClient } from "@/lib/supabase-service";

type RouteContext = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/ai-instruction-proposals/[id] — the owner's answer to a proposed
 * instruction (MIN-988): `{ action: "accept", instruction }` writes the text
 * they validated, possibly edited, to the project's instructions;
 * `{ action: "dismiss" }` sets it aside. Only the owner's own request does
 * either: no model and no other member can answer for them.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");
  const rl = checkSessionRateLimit(auth.user.id, "ai-instruction-proposal", { limit: 30 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests", retry_after: rl.retryAfter },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }
  const body = await request.json().catch(() => null) as { action?: unknown; instruction?: unknown } | null;
  if (!UUID.test(id) || !body) {
    return NextResponse.json({ error: t("invalidJson"), code: "invalid" }, { status: 400 });
  }
  try {
    const result = await resolveAiInstructionProposal(getServiceClient(), auth.user.id, id, body);
    if (result.ok) return NextResponse.json({ status: result.status });
    const error = result.code === "owner_only" ? t("ownerOnly")
      : result.code === "not_found" ? t("projectNotFound")
      : result.code === "invalid" ? t("invalidJson")
      : t("databaseError");
    return NextResponse.json({ error, code: result.code }, { status: result.status });
  } catch {
    console.error("[api/ai-instruction-proposals/:id] resolution failed");
    return NextResponse.json({ error: t("databaseError"), code: "unavailable" }, { status: 503 });
  }
}
