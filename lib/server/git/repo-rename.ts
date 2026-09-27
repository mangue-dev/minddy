import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import type { RepoProviderId } from "@/lib/repo-providers";
import { isForgeRelayClientConfigured } from "@/lib/server/forge-relay/client";
import { pushRelayLinkEvent } from "@/lib/server/forge-relay/link-push";
import { registerRepositoryName, shouldProtectRepositoryNames } from
  "./repository-name-content";

/**
 * Forge-side repository RENAME reconciliation.
 *
 * A repository keeps its identity at the forge when it is renamed (GitHub
 * `repository.id`, GitLab `project.id`) but minddy keys everything users see
 * on `owner/name`: `project_git_links`, `pull_requests`, the sync stamps, and
 * the repo-scoped token mints (MIN-327). After a rename, those rows still
 * carry the dead name — token mints start failing with "There is at least one
 * repository that does not exist…", sweeps stop, and PRs ingested by webhook
 * under the NEW name become invisible (no link matches them).
 *
 * Callers may use this only when both values are authenticated by the provider.
 * GitHub's signed payload provides that guarantee. GitLab's visible shared-token
 * hooks do not, so its receiver binds payload names to stored repository ids
 * instead of reconciling directly from webhook input (MIN-435). Idempotent — a
 * no-op costs one small select.
 */

interface StaleLinkRow {
  id: string;
  connection_id: string;
  repo_full_name: string | null;
  repo_previous_names: string[] | null;
  /** Embedded from git_connections; array in PostgREST typing, object at runtime. */
  git_connections?: { source: string | null } | { source: string | null }[] | null;
}

function splitFullName(fullName: string): { owner: string | null; name: string } {
  const cut = fullName.lastIndexOf("/");
  if (cut <= 0 || cut === fullName.length - 1) return { owner: null, name: fullName };
  return { owner: fullName.slice(0, cut), name: fullName.slice(cut + 1) };
}

/**
 * Reconcile ONE repository rename: the links bound to `externalRepoId` whose
 * stored name differs from the forge's current `fullName` are migrated, along
 * with their PR rows and sync stamps. Returns whether anything moved.
 */
export async function reconcileRepoRename(opts: {
  provider: RepoProviderId;
  /** Stable forge id (`external_repo_id`) — survives renames, unlike names. */
  externalRepoId: string | null | undefined;
  /** Current `owner/name` at the forge, straight from the hook payload. */
  fullName: string | null | undefined;
}): Promise<{ renamed: boolean }> {
  if (!opts.externalRepoId || !opts.fullName) return { renamed: false };
  const supabase = getServiceClient();
  const { data: links, error } = await supabase
    .from("project_git_links")
    .select("id, connection_id, repo_full_name, repo_previous_names, git_connections(source)")
    .eq("provider", opts.provider)
    .eq("external_repo_id", opts.externalRepoId);
  if (error) throw new Error(`project_git_links read failed: ${error.message}`);

  const protectNames = await shouldProtectRepositoryNames(supabase) ||
    ((links ?? []) as unknown as StaleLinkRow[]).some((link) =>
      link.repo_full_name?.startsWith("mdyr1:"));
  const storedName = protectNames
    ? await registerRepositoryName(opts.provider,opts.fullName)
    : opts.fullName;
  const stale = ((links ?? []) as unknown as StaleLinkRow[]).filter(
    (link) => link.repo_full_name && link.repo_full_name !== storedName,
  );
  if (stale.length === 0) return { renamed: false };

  if (protectNames) {
    const changes = await Promise.all(stale.map(async (link) => ({
      id:link.id,old:link.repo_full_name,
      aliases:await Promise.all([...new Set([
        ...(link.repo_previous_names ?? []),link.repo_full_name!,
      ])].slice(-20).map(async (value) => value.startsWith("mdyr1:")
        ? value : registerRepositoryName(opts.provider,value))),
    })));
    const { data:renamed,error:renameError } = await supabase.rpc(
      "reconcile_forge_repository_name",{
        p_provider:opts.provider,p_external_repo_id:opts.externalRepoId,
        p_new:storedName,p_links:changes,
      });
    if (renameError || renamed!==true) {
      throw new Error("Forge repository rename transaction failed");
    }
    for (const link of stale) {
      const embedded = link.git_connections;
      const source = Array.isArray(embedded)
        ? embedded[0]?.source ?? null : embedded?.source ?? null;
      if (source==="relay" && isForgeRelayClientConfigured()) {
        await pushRelayLinkEvent({ event:"linked",provider:opts.provider,
          repoId:opts.externalRepoId,repo:opts.fullName,
          connectionId:link.connection_id });
      }
    }
    return { renamed:true };
  }

  const { owner, name } = splitFullName(opts.fullName);
  const changes = stale.map((link) => ({ id: link.id, old: link.repo_full_name,
    aliases: [...new Set([...(link.repo_previous_names ?? []),
      link.repo_full_name!])].slice(-20) }));
  const { data: renamed, error: renameError } = await supabase.rpc(
    "reconcile_forge_repository_plain", {
      p_provider: opts.provider, p_external_repo_id: opts.externalRepoId,
      p_new: storedName, p_owner: owner, p_name: name, p_links: changes,
    });
  if (renameError || renamed !== true) {
    throw new Error("Forge repository rename transaction failed");
  }
  for (const link of stale) {
    // A RELAYED link must announce its new name to the control-plane mirror:
    // the mirror authorizes token mints and refuses a repo it never saw.
    const embedded = link.git_connections;
    const source = Array.isArray(embedded)
      ? (embedded[0]?.source ?? null)
      : (embedded?.source ?? null);
    if (source === "relay" && isForgeRelayClientConfigured()) {
      await pushRelayLinkEvent({
        event: "linked",
        provider: opts.provider,
        repoId: opts.externalRepoId,
        repo: opts.fullName,
        connectionId: link.connection_id,
      });
    }
  }

  return { renamed: true };
}
