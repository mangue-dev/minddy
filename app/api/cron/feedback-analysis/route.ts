import { NextResponse, type NextRequest } from "next/server";
import { getServiceClient } from "@/lib/supabase-service";
import { runFeedbackReview } from "@/lib/server/feedback/review";
import { getAppConfigValue } from "@/lib/server/app-config";
import { captureServerEvent } from "@/lib/server/posthog";
import { durationBucket } from "@/lib/analytics-sanitize";

/**
 * Cron horaire (Vercel Cron, vercel.json) : passe de revue IA du feedback
 * (MIN-87 — dédoublonnage + catégorisation + modération en un appel), purge des
 * farces écartées, et ménage des sessions/OTP expirés. Depuis MIN-87 la revue
 * est surtout déclenchée à la soumission (`after()`) : ce cron est le FILET DE
 * SÉCURITÉ (LLM en panne au moment du post, budget IA revenu depuis, backfill).
 * Vercel envoie automatiquement `Authorization: Bearer ${CRON_SECRET}` quand la
 * variable est configurée ; la route est inutilisable sans ce secret.
 */

export const maxDuration = 300;

const DEFAULT_JUNK_PURGE_DAYS = 30;
const PURGE_BATCH = 200;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const review = await runFeedbackReview();

  const service = getServiceClient();
  const purged = await purgeJunk();

  // Ménage : codes OTP expirés depuis plus d'un jour, sessions expirées.
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const now = new Date().toISOString();
  await Promise.all([
    service.from("feedback_otp_codes").delete().lt("expires_at", dayAgo),
    service.from("feedback_sessions").delete().lt("expires_at", now),
  ]);

  captureServerEvent({
    distinctId: "cron",
    event: "cron_executed",
    properties: {
      job: "feedback-analysis",
      duration_bucket: durationBucket(Date.now() - startedAt),
    },
  });
  return NextResponse.json({ ok: true, review, purged });
}

/**
 * Suppression définitive des farces (MIN-87). Un post écarté par la modération
 * n'a pas à traîner indéfiniment, mais on ne supprime QUE ce dont personne ne
 * s'est saisi : pas d'issue liée, pas de soutien au-delà de la voix de son
 * auteur, et passé le délai de rétention (l'équipe peut le republier d'ici là).
 * Toutes les dépendances partent en cascade (votes, commentaires, événements,
 * notifications, pièces jointes).
 */
async function purgeJunk(): Promise<number> {
  const days = Number.parseFloat(
    (await getAppConfigValue("feedback_junk_purge_days")) ?? ""
  );
  const retention = Number.isFinite(days) ? days : DEFAULT_JUNK_PURGE_DAYS;
  if (retention <= 0) return 0;

  const cutoff = new Date(Date.now() - retention * 24 * 3600 * 1000).toISOString();
  const service = getServiceClient();
  const { data: candidates, error: pickError } = await service
    .from("feedback_posts")
    .select("id")
    .is("deleted_at", null)
    .eq("review_state", "rejected")
    .is("issue_id", null)
    .is("merged_into_id", null)
    .lte("vote_count", 1)
    .lt("created_at", cutoff)
    .limit(PURGE_BATCH);
  if (pickError) {
    console.error("[feedback-cron] junk purge scan failed:", pickError.message);
    return 0;
  }
  const ids = (candidates ?? []).map((p) => p.id as string);
  if (ids.length === 0) return 0;

  // Un post rejeté peut avoir absorbé des doublons (fusions d'avant la
  // modération). Le supprimer remettrait ses tombstones à `merged_into_id`
  // null — ils ressusciteraient en posts autonomes sur le board. On le garde.
  const { data: absorbers } = await service
    .from("feedback_posts")
    .select("merged_into_id")
    .is("deleted_at", null)
    .in("merged_into_id", ids);
  const referenced = new Set(
    (absorbers ?? []).map((p) => p.merged_into_id as string)
  );
  const deletable = ids.filter((id) => !referenced.has(id));
  if (deletable.length === 0) return 0;

  const { data, error } = await service
    .from("feedback_posts")
    .delete()
    .is("deleted_at", null)
    .in("id", deletable)
    .select("id");
  if (error) {
    console.error("[feedback-cron] junk purge failed:", error.message);
    return 0;
  }
  return (data ?? []).length;
}
