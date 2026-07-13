import { NextResponse, type NextRequest } from "next/server";
import { getServiceClient } from "@/lib/supabase-service";
import { runFeedbackAnalysis } from "@/lib/server/feedback/analyze";
import { runFeedbackClassification } from "@/lib/server/feedback/classify";

/**
 * Cron horaire (Vercel Cron, vercel.json) : passe de merge IA (MIN-37) puis passe
 * de classification IA (MIN-54 : catégorisation + revue avant publication +
 * modération), + ménage des sessions/OTP expirés. Vercel envoie automatiquement
 * `Authorization: Bearer ${CRON_SECRET}` quand la variable est configurée ;
 * la route est inutilisable sans ce secret.
 */

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Ordre merge → classify : un post absorbé par un merge (tombstone) sort de la
  // file de classification (claim exclut merged_into_id) et n'est pas publié à part.
  const report = await runFeedbackAnalysis();
  const classification = await runFeedbackClassification();

  // Ménage : codes OTP expirés depuis plus d'un jour, sessions expirées.
  const service = getServiceClient();
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const now = new Date().toISOString();
  await Promise.all([
    service.from("feedback_otp_codes").delete().lt("expires_at", dayAgo),
    service.from("feedback_sessions").delete().lt("expires_at", now),
  ]);

  return NextResponse.json({ ok: true, report, classification });
}
