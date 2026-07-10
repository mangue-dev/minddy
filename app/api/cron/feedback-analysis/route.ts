import { NextResponse, type NextRequest } from "next/server";
import { getServiceClient } from "@/lib/supabase-service";
import { runFeedbackAnalysis } from "@/lib/server/feedback/analyze";

/**
 * Cron horaire (Vercel Cron, vercel.json) : passe d'analyse IA du feedback
 * (MIN-37) + ménage des sessions/OTP expirés. Vercel envoie automatiquement
 * `Authorization: Bearer ${CRON_SECRET}` quand la variable est configurée ;
 * la route est inutilisable sans ce secret.
 */

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const report = await runFeedbackAnalysis();

  // Ménage : codes OTP expirés depuis plus d'un jour, sessions expirées.
  const service = getServiceClient();
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const now = new Date().toISOString();
  await Promise.all([
    service.from("feedback_otp_codes").delete().lt("expires_at", dayAgo),
    service.from("feedback_sessions").delete().lt("expires_at", now),
  ]);

  return NextResponse.json({ ok: true, report });
}
