import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { appTabValueVersion, decodeAppTabValue,
  encodeAppTabValue } from "@/lib/server/app-tabs-content";
import { isContentEncryptionEnabled } from "./content-config";
import { getContentKeys } from "./registry";

type Row = { id: string; user_id: string; href: string;
  custom_name: string | null; revision: number };

/** Rotate both tab fields together; an exact-value and revision CAS avoids stale writes. */
export async function backfillAppTabsBatch(limit = 25, signal?: AbortSignal) {
  if (!isContentEncryptionEnabled())
    throw new Error("Application tab encryption is not enabled");
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw new Error("Invalid application tab batch size");
  const result = { scanned: 0, migrated: 0, unchanged: 0,
    conflicted: 0, failed: 0, interrupted: false };
  const service = getServiceClient();
  const { data, error } = await service.from("app_tabs")
    .select("id,user_id,href,custom_name,revision")
    .order("encryption_attempted_at", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan application tabs");
  for (const row of (data ?? []) as Row[]) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      const scope = { kind: "user" as const, id: row.user_id };
      const key = await getContentKeys().current(scope);
      const currentVersion = key.version;
      key.bytes.fill(0);
      const href = await decodeAppTabValue(row.user_id, row.id, "href", row.href);
      const name = await decodeAppTabValue(row.user_id, row.id, "custom_name", row.custom_name);
      if (!href) throw new Error("Invalid application tab destination");
      const fresh = appTabValueVersion(row.href) === currentVersion &&
        (row.custom_name === null || appTabValueVersion(row.custom_name) === currentVersion);
      const nextHref = appTabValueVersion(row.href) === currentVersion
        ? row.href : await encodeAppTabValue(row.user_id, row.id, "href", href);
      const nextName = row.custom_name === null ? null
        : appTabValueVersion(row.custom_name) === currentVersion
          ? row.custom_name : await encodeAppTabValue(row.user_id, row.id, "custom_name", name!);
      if (await decodeAppTabValue(row.user_id, row.id, "href", nextHref) !== href ||
          await decodeAppTabValue(row.user_id, row.id, "custom_name", nextName) !== name)
        throw new Error("Application tab migration mismatch");
      if (signal?.aborted) { result.interrupted = true; break; }
      const now = new Date().toISOString();
      let query = service.from("app_tabs").update({ href: nextHref,
        custom_name: nextName, href_encryption_checked_at: now,
        custom_name_encryption_checked_at: nextName ? now : null,
        encryption_attempted_at: now })
        .eq("id", row.id).eq("user_id", row.user_id)
        .eq("revision", row.revision).eq("href", row.href);
      query = row.custom_name === null ? query.is("custom_name", null)
        : query.eq("custom_name", row.custom_name);
      const { data: saved, error: writeError } = await query
        .select("id").maybeSingle();
      if (writeError) throw new Error("Unable to migrate application tab");
      if (!saved) result.conflicted++;
      else if (fresh) result.unchanged++;
      else result.migrated++;
    } catch {
      result.failed++;
      await service.from("app_tabs")
        .update({ encryption_attempted_at: new Date().toISOString() })
        .eq("id", row.id).eq("revision", row.revision).eq("href", row.href);
    }
  }
  return result;
}
