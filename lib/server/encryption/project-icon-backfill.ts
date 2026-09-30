import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { recordBackfillAttempt } from "./backfill-attempt";
import { ICON_MIME_EXT } from "@/lib/server/favicon";
import { projectIconPaths } from "@/lib/server/project-storage";
import { downloadProtectedProjectIcon, projectIconRoute,
  removeProtectedProjectIcon, uploadProtectedProjectIcon } from
  "@/lib/server/project-icon-content";
import { safeFetch } from "@/lib/server/safe-fetch";
import { getContentKeys, getEncryptedStore } from "./registry";
import { isContentEncryptionEnabled } from "./content-config";

const BUCKET = "project-icons";
type Service = ReturnType<typeof getServiceClient>;

async function legacyBytes(service: Service, projectId: string,
  url: string): Promise<{ bytes: Buffer; mimeType: string; oldPath: string | null }> {
  const path = (await projectIconPaths(service, [projectId]))
    .find((value) => value.startsWith(`${projectId}.`));
  if (path) {
    const { data, error } = await service.storage.from(BUCKET).download(path);
    if (error || !data) throw new Error("Legacy project icon is unavailable");
    const mimeType = data.type || "image/webp";
    if (!ICON_MIME_EXT[mimeType]) throw new Error("Unsupported project icon type");
    return { bytes: Buffer.from(await data.arrayBuffer()), mimeType,
      oldPath: path };
  }
  const embedded = /^data:(image\/[a-z.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/
    .exec(url);
  if (embedded) {
    if (!ICON_MIME_EXT[embedded[1]]) throw new Error("Unsupported project icon type");
    const bytes = Buffer.from(embedded[2], "base64");
    if (bytes.toString("base64") !== embedded[2]) {
      throw new Error("Invalid embedded project icon");
    }
    return { bytes, mimeType: embedded[1], oldPath: null };
  }
  const response = await safeFetch(url, { maxBytes: 512 * 1024,
    maxRedirects: 3, timeoutMs: 10_000 });
  const mimeType = response.headers.get("content-type")?.split(";", 1)[0]
    .trim().toLowerCase() ?? "";
  if (!response.ok || !ICON_MIME_EXT[mimeType] || !response.bytes.length) {
    throw new Error("Unable to recover external project icon");
  }
  return { bytes: response.bytes, mimeType, oldPath: null };
}

async function currentVersion(projectId: string): Promise<number> {
  const current = await getContentKeys().current({ kind: "project",
    id: projectId });
  const version = current.version;
  current.bytes.fill(0);
  return version;
}

async function protectedVersion(service: Service, path: string): Promise<{
  version: number; format: number;
}> {
  const { data, error } = await service.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error("Protected project icon is unavailable");
  const container = JSON.parse(Buffer.from(await data.arrayBuffer()).toString("utf8"));
  const store = getEncryptedStore();
  const manifest = store.fromDatabase(container.manifest);
  return { version: store.versionOf(manifest), format: store.formatOf(manifest) };
}

/** Verify and rotate icons in bounded CAS batches, then remove orphaned old bytes. */
export async function backfillProjectIconsBatch(limit = 10,
  signal?: AbortSignal) {
  if (!isContentEncryptionEnabled()) {
    throw new Error("Project icon encryption is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Invalid project icon batch size");
  }
  const service = getServiceClient();
  const result = { scanned: 0, migrated: 0, verified: 0, conflicted: 0,
    orphaned: 0, failed: 0, interrupted: false };
  const { data, error } = await service.from("projects")
    .select("id,icon_url,icon_storage_path").not("icon_url", "is", null)
    .order("icon_attempted_at", { ascending: true, nullsFirst: true })
    .order("id", { ascending: true }).limit(limit);
  if (error) throw new Error("Unable to scan project icons");
  for (const row of data ?? []) {
    if (signal?.aborted) { result.interrupted = true; break; }
    result.scanned++;
    try {
      if (!await recordBackfillAttempt(service, "projects",
        "icon_attempted_at", { id: row.id, icon_url: row.icon_url, icon_storage_path: row.icon_storage_path })) {
        result.conflicted++;
        continue;
      }
      if (!row.icon_url) throw new Error("Missing project icon URL");
      const protectedSource = row.icon_storage_path
        ? await downloadProtectedProjectIcon(service, row.id,
          row.icon_storage_path, { actorId: null,
            reason: "migration_verification" }) : null;
      const legacy = protectedSource ? null
        : await legacyBytes(service, row.id, row.icon_url);
      const source = protectedSource ?? legacy!;
      if (!source.bytes.length || source.bytes.length > 20 * 1024 * 1024) {
        throw new Error("Invalid project icon size");
      }
      const version = row.icon_storage_path
        ? await protectedVersion(service, row.icon_storage_path) : null;
      const fresh = version?.format === 3 &&
        version.version === await currentVersion(row.id);
      if (fresh) {
        const checked = await service.rpc("verify_project_icon", {
          p_id: row.id, p_url: row.icon_url,
          p_path: row.icon_storage_path,
        });
        if (checked.error) throw new Error("Unable to verify project icon");
        if (checked.data) result.verified++;
        else result.conflicted++;
        continue;
      }
      const target = await uploadProtectedProjectIcon(service, row.id,
        source.bytes, source.mimeType);
      if (signal?.aborted) { result.interrupted = true;
        await removeProtectedProjectIcon(service, target); break; }
      const swap = await service.rpc("replace_project_icon", {
        p_id: row.id, p_old_url: row.icon_url,
        p_old_path: row.icon_storage_path,
        p_new_url: projectIconRoute(row.id), p_new_path: target,
      });
      if (swap.error || !swap.data) {
        await removeProtectedProjectIcon(service, target);
        result.conflicted++;
        continue;
      }
      if (row.icon_storage_path) {
        await removeProtectedProjectIcon(service, row.icon_storage_path);
      } else if (legacy?.oldPath) {
        const removed = await service.storage.from(BUCKET).remove([legacy.oldPath]);
        if (removed.error) throw new Error("Unable to remove clear project icon");
      }
      result.migrated++;
    } catch { result.failed++; }
  }
  if (!result.interrupted) {
    const orphans = await service.rpc("list_orphan_project_icon_objects",
      { p_limit: limit });
    if (orphans.error) throw new Error("Unable to scan orphan project icons");
    for (const object of orphans.data ?? []) {
      if (signal?.aborted) { result.interrupted = true; break; }
      const removed = await service.storage.from(BUCKET).remove([object.name]);
      if (removed.error) result.failed++;
      else result.orphaned++;
    }
  }
  return result;
}
