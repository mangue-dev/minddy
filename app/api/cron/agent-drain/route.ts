import { NextResponse, after, type NextRequest } from "next/server";

import { getServiceClient } from "@/lib/supabase-service";
import { drainAgentRuns } from "@/lib/server/agent/drain";
import { chainAgentDrain } from "@/lib/server/agent/drain-chain";

/**
 * Worker de l'agent de code (MIN-46). Draine les runs dus (auto-budget 270s sous
 * les 300s), puis auto-invoque si du travail reste (handoff des runs > 300s).
 * Deux déclencheurs partagent ce handler : le Vercel Cron toutes les 2 min (GET) et
 * l'auto-invocation (POST `?chain=N`, toutes les 2 min pour le cron). Vercel envoie automatiquement
 * `Authorization: Bearer ${CRON_SECRET}` ; sans ce secret, la route est 401.
 */

export const runtime = "nodejs";
export const maxDuration = 300;

async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const service = getServiceClient();
  const summary = await drainAgentRuns(service);

  const chain = Number(request.nextUrl.searchParams.get("chain") ?? "0") || 0;
  if (summary.claimed > 0) {
    after(async () => {
      await chainAgentDrain({ supabase: service, chain, origin: request.nextUrl.origin });
    });
  }

  return NextResponse.json({ ok: true, claimed: summary.claimed });
}

export const GET = handle;
export const POST = handle;
