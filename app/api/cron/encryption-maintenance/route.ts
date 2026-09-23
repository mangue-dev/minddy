import { backfillCommentsBatch } from "@/lib/server/encryption/comment-backfill";
import { backfillHistoryBatch } from "@/lib/server/encryption/history-backfill";
import { NextResponse, type NextRequest } from "next/server";

import { verifyCronSecret } from "@/lib/server/cron-auth";
import { backfillInvitationEmailsBatch } from "@/lib/server/encryption/invitation-backfill";
import { rotateDueContentKeys } from "@/lib/server/encryption/rotation";
import { isContentEncryptionEnabled } from "@/lib/server/encryption/content-config";
import { backfillScratchpadsBatch } from "@/lib/server/encryption/scratchpad-backfill";
import { backfillStatEventsBatch } from "@/lib/server/encryption/stat-events-backfill";
import {
  isInvitationEncryptionConfigured,
  isInvitationEncryptionEnabled,
} from "@/lib/server/encryption/invitation-email";

export const maxDuration = 60;

/** A bounded pass; the next hourly run resumes any remaining legacy rows. */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const invitationsEnabled = isInvitationEncryptionEnabled();
  const contentEnabled = isContentEncryptionEnabled();
  if (!invitationsEnabled && !contentEnabled) {
    return NextResponse.json({ skipped: true });
  }
  if (!isInvitationEncryptionConfigured()) {
    return NextResponse.json({ error: "encryption_not_configured" }, { status: 503 });
  }
  try {
    const rotation = await rotateDueContentKeys();
    const outcomes = await Promise.allSettled([
      invitationsEnabled ? backfillInvitationEmailsBatch(100) : Promise.resolve(null),
      contentEnabled ? backfillScratchpadsBatch(50, request.signal) : Promise.resolve(null),
      contentEnabled ? backfillStatEventsBatch(50, request.signal) : Promise.resolve(null),
      contentEnabled ? backfillHistoryBatch("issue_events", 50, request.signal) : Promise.resolve(null),
      contentEnabled ? backfillHistoryBatch("page_versions", 50, request.signal) : Promise.resolve(null),
      contentEnabled ? backfillCommentsBatch("comments", 50, request.signal) : Promise.resolve(null),
      contentEnabled ? backfillCommentsBatch("page_comments", 50, request.signal) : Promise.resolve(null),
    ]);
    const invitation = outcomes[0];
    const scratchpad = outcomes[1];
    const statistics = outcomes[2];
    const activity = outcomes[3];
    const pageVersions = outcomes[4];
    const comments = outcomes[5];
    const pageComments = outcomes[6];
    const failed = outcomes.some((outcome) => outcome.status === "rejected") || rotation.failed > 0 ||
      (scratchpad.status === "fulfilled" && scratchpad.value !== null &&
        (scratchpad.value.failed > 0 || scratchpad.value.interrupted)) ||
      (statistics.status === "fulfilled" && statistics.value !== null &&
        (statistics.value.failed > 0 || statistics.value.interrupted)) ||
      [activity, pageVersions, comments, pageComments].some((outcome) => outcome.status === "fulfilled" && outcome.value !== null &&
        (outcome.value.failed > 0 || outcome.value.interrupted));
    if (failed) console.error("[encryption-maintenance] incomplete batch");
    return NextResponse.json({
      ...(invitation.status === "fulfilled" ? invitation.value : { invitation_failed: true }),
      rotation,
      ...(contentEnabled ? {
        comments: comments.status === "fulfilled" ? comments.value : { failed: true },
        page_comments: pageComments.status === "fulfilled" ? pageComments.value : { failed: true },
        activity: activity.status === "fulfilled" ? activity.value : { failed: true },
        page_versions: pageVersions.status === "fulfilled" ? pageVersions.value : { failed: true },
      } : {}),
      ...(contentEnabled ? { scratchpads: scratchpad.status === "fulfilled" ? scratchpad.value : { failed: true } } : {}),
      ...(contentEnabled ? { statistics: statistics.status === "fulfilled" ? statistics.value : { failed: true } } : {}),
    }, { status: failed ? 503 : 200 });
  } catch {
    console.error("[encryption-maintenance] batch failed");
    return NextResponse.json({ error: "backfill_failed" }, { status: 500 });
  }
}
