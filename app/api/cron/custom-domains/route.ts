import { NextResponse, type NextRequest } from "next/server";
import { verifyCronSecret } from "@/lib/server/cron-auth";
import { reconcileCustomDomains } from "@/lib/server/custom-domain-cleanup";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await reconcileCustomDomains();
    return NextResponse.json(result, { status: result.ok ? 200 : 503 });
  } catch {
    console.error("[custom-domains] reconciliation failed");
    return NextResponse.json({ ok: false, error: "reconciliation_failed" }, { status: 503 });
  }
}
