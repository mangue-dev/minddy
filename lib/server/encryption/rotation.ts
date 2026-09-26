import "server-only";

import { getContentKeys, listDueContentKeys, markContentKeyRotationAttempt } from "./registry";

const ROTATION_AGE_MS = 90 * 24 * 60 * 60 * 1_000;

/** Bounded and restartable: a successful CAS gives the current key a new creation date. */
export async function rotateDueContentKeys(limit = 20, now = Date.now()): Promise<{
  scanned: number; advanced: number; failed: number;
}> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isFinite(now)) {
    throw new Error("Invalid data key rotation batch");
  }
  const due = await listDueContentKeys(new Date(now - ROTATION_AGE_MS).toISOString(), limit);
  const result = { scanned: due.length, advanced: 0, failed: 0 };
  for (const record of due) {
    try {
      await markContentKeyRotationAttempt(record, new Date(now).toISOString());
      // Another worker may have advanced the candidate since the batch was read.
      const version = await getContentKeys().rotate(record.scope, record.version);
      if (version > record.version) result.advanced += 1;
    } catch {
      result.failed += 1;
      // SDK errors can include request metadata; keep the operational event content-free.
      console.error("[data-key-rotation] failed", { scope_kind: record.scope.kind, scope_id: record.scope.id });
    }
  }
  return result;
}
