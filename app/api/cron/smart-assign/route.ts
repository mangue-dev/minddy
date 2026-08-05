import { NextResponse, type NextRequest } from "next/server";

import { verifyCronSecret } from "@/lib/server/cron-auth";
import { sweepUnassignedIssues } from "@/lib/server/smart-assign";

/**
 * Le FILET de Smart Assign (MIN-31) : les tickets qu'un déclenchement aurait dû
 * assigner et qui sont restés sans personne.
 *
 * Il existe parce qu'un ticket créé par le MCP l'a prouvé : l'affectation vivait
 * dans un `after()`, l'`after()` n'est pas allé au bout, et il n'est rien resté
 * — ni assigné, ni erreur, ni nouvelle tentative. Le cas déterministe écrit
 * désormais avant la réponse et ne dépend plus de rien ; l'appel au modèle, lui,
 * reste différé, donc perdable. C'est ce reste que ce réveil rattrape.
 *
 * Court par construction : le balayage est borné (24 h, jamais assigné, 100
 * tickets), et l'immense majorité des réveils ne trouve rien.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

async function handle(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await sweepUnassignedIssues();
  return NextResponse.json({ ok: true, ...result });
}

export const GET = handle;
export const POST = handle;
