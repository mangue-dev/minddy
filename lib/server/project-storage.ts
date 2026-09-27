import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { FORGE_ATTACHMENTS_BUCKET } from "@/lib/forge-image-assets";

/**
 * Objects in a project that do NOT live in the bucket `attachments`
 * (MIN-296).
 *
 * Project icons and forge attachments live outside the normal attachment
 * bucket. Forge objects are private and project-scoped after conversion;
 * historical PR paths still need repository ownership checks during deletion.
 *
 * The paths are recovered BEFORE the delete — afterward, the cascade has taken over the
 * lines that say where they are.
 */

/** What a page of `list()` brings to the maximum (Storage API ceiling). */
const LIST_PAGE = 1000;

/**
 * Recursively lists objects under a prefix. Storage does not descend, and
 * `list()` stops at a thousand entries without reporting remaining entries.
 */
export async function listStoragePrefix(
  service: SupabaseClient,
  bucket: string,
  prefix: string,
  depth = 0
): Promise<string[]> {
  // Safeguard: the targeted trees are four levels at most. More
  // deep would have only one cause here — a loop.
  if (depth > 4) return [];

  const paths: string[] = [];
  for (let offset = 0; ; offset += LIST_PAGE) {
    const { data, error } = await service.storage
      .from(bucket)
      .list(prefix, { limit: LIST_PAGE, offset });
    if (error || !data) return paths;

    for (const entry of data) {
      const full = prefix ? `${prefix}/${entry.name}` : entry.name;
      // A Storage “folder” is an entry without metadata.
      if (entry.id === null || entry.metadata === null) {
        paths.push(...(await listStoragePrefix(service, bucket, full, depth + 1)));
      } else {
        paths.push(full);
      }
    }

    if (data.length < LIST_PAGE) return paths;
  }
}

/** Include opaque project folders and legacy root-level project icons. */
export async function projectIconPaths(
  service: SupabaseClient,
  projectIds: string[]
): Promise<string[]> {
  const paths: string[] = [];
  for (const id of projectIds) {
    paths.push(...(await listStoragePrefix(service, "project-icons", id)));
  }
  const ids = new Set(projectIds);
  for (let offset = 0; ; offset += LIST_PAGE) {
    const { data, error } = await service.storage.from("project-icons")
      .list("", { limit: LIST_PAGE, offset });
    if (error || !data) break;
    for (const entry of data) {
      const id = entry.name.split(".", 1)[0];
      if (ids.has(id) && entry.id !== null && entry.metadata !== null) {
        paths.push(entry.name);
      }
    }
    if (data.length < LIST_PAGE) break;
  }
  return paths;
}

/**
 * Include all opaque objects under each deleted project, including unregistered
 * orphans. Legacy PR paths lack a project prefix, so remove them only when no
 * surviving project still links the repository.
 */
export async function forgeAttachmentPathsForProjects(
  service: SupabaseClient,
  projectIds: string[]
): Promise<string[]> {
  if (projectIds.length === 0) return [];

  const paths: string[] = [];
  for (const id of projectIds) {
    paths.push(...(await listStoragePrefix(service, FORGE_ATTACHMENTS_BUCKET,
      `projects/${id}`)));
  }

  const { data: links } = await service
    .from("project_git_links")
    .select("project_id, provider, repo_full_name")
    .not("repo_full_name", "is", null);
  const rows = (links ?? []) as Array<{
    project_id: string;
    provider: string;
    repo_full_name: string;
  }>;
  if (rows.length === 0) return paths;

  const key = (l: { provider: string; repo_full_name: string }) =>
    `${l.provider} ${l.repo_full_name}`;
  const survivors = new Set(
    rows.filter((l) => !projectIds.includes(l.project_id)).map(key)
  );
  const doomed = rows.filter(
    (l) => projectIds.includes(l.project_id) && !survivors.has(key(l))
  );

  for (const link of doomed) {
    const { data: prs } = await service
      .from("pull_requests")
      .select("id")
      .eq("provider", link.provider)
      .eq("repo_full_name", link.repo_full_name);
    for (const pr of (prs ?? []) as Array<{ id: string }>) {
      paths.push(
        ...(await listStoragePrefix(service, FORGE_ATTACHMENTS_BUCKET, pr.id))
      );
    }
  }
  return paths;
}

/**
 * Deletes a batch of objects from a bucket. NEVER raises: a failed cleaning must
 * not cause the purge or account wipe that triggered it to fail — it
 * returns what it could not do, up to the caller to make it a warning.
 */
export async function removeBucketObjects(
  service: SupabaseClient,
  bucket: string,
  paths: string[]
): Promise<{ removed: number; errors: string[] }> {
  const errors: string[] = [];
  let removed = 0;
  // Storage caps a `remove`: we cut it.
  for (let i = 0; i < paths.length; i += 100) {
    const chunk = paths.slice(i, i + 100);
    try {
      const { error } = await service.storage.from(bucket).remove(chunk);
      if (error) errors.push(`storage ${bucket}: ${error.message}`);
      else removed += chunk.length;
    } catch (e) {
      errors.push(`storage ${bucket}: ${(e as Error).message}`);
    }
  }
  return { removed, errors };
}

/**
 * Clean the project icon and private forge buckets for disappearing projects:
 * notes the paths, deletes, returns the warnings. Called AFTER the delete
 * lines when the paths were cleared before (purging the trash), or
 * end-to-end when the cascade has not yet occurred (deleting
 * count).
 */
export async function removeProjectSideBuckets(
  service: SupabaseClient,
  paths: { icons: string[]; forge: string[] }
): Promise<{ removed: number; errors: string[] }> {
  const icons = await removeBucketObjects(service, "project-icons", paths.icons);
  const forge = await removeBucketObjects(
    service,
    FORGE_ATTACHMENTS_BUCKET,
    paths.forge
  );
  return {
    removed: icons.removed + forge.removed,
    errors: [...icons.errors, ...forge.errors],
  };
}
