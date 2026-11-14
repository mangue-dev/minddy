import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";

import { getAuthedUser } from "@/lib/server/api-auth";
import { readAiInstructions } from "@/lib/server/ai-instructions";
import { listPendingProposals } from "@/lib/server/ai-instruction-proposals";
import { getProjectAccess } from "@/lib/server/project-access";
import { getServiceClient } from "@/lib/supabase-service";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/projects/[id]/ai-instructions — what the owner told Smart Fill and
 * Smart Assign (MIN-988). Members read it, since it explains what the
 * automations do with their issues; readers do not. The owner also gets the
 * proposal waiting for their answer, if any. Writes go through
 * PATCH /api/projects/[id], owner only.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");
  const access = await getProjectAccess(auth.user.id, id);
  if (!access || access.role === "reader") {
    return NextResponse.json({ error: t("projectNotFound") }, { status: 404 });
  }
  try {
    const service = getServiceClient();
    const [instructions, proposals] = await Promise.all([
      readAiInstructions(service, id, auth.user.id),
      access.isOwner ? listPendingProposals(service, auth.user.id, { projectId: id }) : [],
    ]);
    return NextResponse.json({ instructions, proposal: proposals[0] ?? null });
  } catch {
    console.error("[api/projects/:id/ai-instructions] read failed");
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
}
