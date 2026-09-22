import { NextResponse, type NextRequest } from "next/server";

import { verifyCronSecret } from "@/lib/server/cron-auth";
import { backfillInvitationEmailsBatch } from "@/lib/server/encryption/invitation-backfill";
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
  if (!isInvitationEncryptionEnabled()) {
    return NextResponse.json({ skipped: true });
  }
  if (!isInvitationEncryptionConfigured()) {
    return NextResponse.json({ error: "encryption_not_configured" }, { status: 503 });
  }
  try {
    return NextResponse.json(await backfillInvitationEmailsBatch(100));
  } catch (error) {
    console.error("[encryption-maintenance] backfill failed:", error);
    return NextResponse.json({ error: "backfill_failed" }, { status: 500 });
  }
}
