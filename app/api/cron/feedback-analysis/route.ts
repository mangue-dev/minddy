import { NextResponse, type NextRequest } from "next/server";
import { verifyCronSecret } from "@/lib/server/cron-auth";
import { getServiceClient } from "@/lib/supabase-service";
import { runFeedbackReview } from "@/lib/server/feedback/review";
import { getAppConfigValue } from "@/lib/server/app-config";

/**
 * Hourly Vercel cron: review feedback with AI, purge rejected junk, and remove
 * expired sessions and OTPs. Submission normally triggers the review; this job
 * is the safety net for temporary model failures, restored budgets, and backfill.
 * Vercel sends `Authorization: Bearer ${CRON_SECRET}` when configured, and the
 * route is unavailable without that secret.
 */

export const maxDuration = 300;

const DEFAULT_JUNK_PURGE_DAYS = 30;
const PURGE_BATCH = 200;

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const review = await runFeedbackReview();

  const service = getServiceClient();
  const purged = await purgeJunk();

  // Housekeeping: OTP codes expired for more than a day, expired sessions.
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const now = new Date().toISOString();
  await Promise.all([
    service.from("feedback_otp_codes").delete().lt("expires_at", dayAgo),
    service.from("feedback_sessions").delete().lt("expires_at", now),
  ]);

  return NextResponse.json({ ok: true, review, purged });
}

/**
 * Permanently removes old junk (MIN-87), but only when no one protected it:
 * no linked issue, no extra vote, and no merged post that depends on it. The
 * guarded RPC repeats every condition in the deleting transaction, so a stale
 * candidate scan cannot erase a post that was protected concurrently.
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
    .eq("status", "spam")
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

  const { data, error } = await service.rpc("purge_feedback_junk_guarded", {
    p_ids: ids,
    p_cutoff: cutoff,
  });
  if (error) {
    console.error("[feedback-cron] junk purge failed:", error.message);
    return 0;
  }
  return (data ?? []).length;
}
