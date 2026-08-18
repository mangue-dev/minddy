import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { FORGE_ATTACHMENTS_BUCKET } from "@/lib/forge-image-assets";

/**
 * Objects in a project that do NOT live in the bucket `attachments`
 * (MIN-296).
 *
 * Three buckets carry project data, and two of them are public
 * for reading: `project-icons` (the uploaded icon) and `forge-attachments` (the
 * files attached to the pull request comments). Neither cascaded,
 * and neither was swept — neither when purging a project, nor when deleting an
 * account. A deleted project therefore left its icon and the images of its PR
 * served by their URL, with nothing left in the base to designate them: exactly the
 * "promised file deleted, still in storage" that the audit tracks.
 *
 * The paths are recovered BEFORE the delete — afterward, the cascade has taken over the
 * lines that say where they are.
 */

/** What a page of `list()` brings to the maximum (Storage API ceiling). */
const LIST_PAGE = 1000;

/**
 * Recursively lists objects of a prefix (Storage API does not descend), en
 * PAGINING: `list()` stops at a thousand entries without saying there are any left.
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

/** The uploaded icons of the given projects — one per project, extension
 unknown (hence the listing of the prefix rather than an inferred path). */
export async function projectIconPaths(
  service: SupabaseClient,
  projectIds: string[]
): Promise<string[]> {
  const paths: string[] = [];
  for (const id of projectIds) {
    paths.push(...(await listStoragePrefix(service, "project-icons", id)));
  }
  return paths;
}

/**
 * The `forge-attachments` objects of the given projects.
 *
 * The path for a PR comment attachment is `{pr_id}/{uuid}/{nom}`
 * (MIN-162): it doesn't say the project. We therefore go back down the chain which links it to
 * — projects → linked repositories (`project_git_links`) → PR of these repositories.
 *
 * A PR belongs to a DEPOSIT, not to a project, and two projects can link the
 * same: we do not delete only if no surviving project still binds it. Without this
 * filter, purging a project would take away the images of comments from a team
 * which remains.
 */
export async function forgeAttachmentPathsForProjects(
  service: SupabaseClient,
  projectIds: string[]
): Promise<string[]> {
  if (projectIds.length === 0) return [];

  const { data: links } = await service
    .from("project_git_links")
    .select("project_id, provider, repo_full_name")
    .not("repo_full_name", "is", null);
  const rows = (links ?? []) as Array<{
    project_id: string;
    provider: string;
    repo_full_name: string;
  }>;
  if (rows.length === 0) return [];

  const key = (l: { provider: string; repo_full_name: string }) =>
    `${l.provider} ${l.repo_full_name}`;
  const survivors = new Set(
    rows.filter((l) => !projectIds.includes(l.project_id)).map(key)
  );
  const doomed = rows.filter(
    (l) => projectIds.includes(l.project_id) && !survivors.has(key(l))
  );

  const paths: string[] = [];
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
 * Cleaning the two public buckets for a batch of disappearing projects:
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
