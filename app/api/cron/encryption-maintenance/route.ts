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
    ]);
    const invitation = outcomes[0];
    const scratchpad = outcomes[1];
    const statistics = outcomes[2];
    const failed = outcomes.some((outcome) => outcome.status === "rejected") || rotation.failed > 0 ||
      (scratchpad.status === "fulfilled" && scratchpad.value !== null &&
        (scratchpad.value.failed > 0 || scratchpad.value.interrupted)) ||
      (statistics.status === "fulfilled" && statistics.value !== null &&
        (statistics.value.failed > 0 || statistics.value.interrupted));
    if (failed) console.error("[encryption-maintenance] incomplete batch");
    return NextResponse.json({
      ...(invitation.status === "fulfilled" ? invitation.value : { invitation_failed: true }),
      rotation,
      ...(contentEnabled ? { scratchpads: scratchpad.status === "fulfilled" ? scratchpad.value : { failed: true } } : {}),
      ...(contentEnabled ? { statistics: statistics.status === "fulfilled" ? statistics.value : { failed: true } } : {}),
    }, { status: failed ? 503 : 200 });
  } catch {
    console.error("[encryption-maintenance] batch failed");
    return NextResponse.json({ error: "backfill_failed" }, { status: 500 });
  }
}
