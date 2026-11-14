import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { listPendingProposals } from "@/lib/server/ai-instruction-proposals";
import { getServiceClient } from "@/lib/supabase-service";

/**
 * GET /api/me/ai-instruction-proposals — the instructions minddy proposes to
 * the user for the projects they own (MIN-988), one at most per project.
 * Reading never calls a model: the weekly run drafted them.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  try {
    const proposals = await listPendingProposals(getServiceClient(), auth.user.id);
    return NextResponse.json({ proposals });
  } catch {
    console.error("[api/me/ai-instruction-proposals] read failed");
    const t = await getTranslations("ApiErrors");
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
}
