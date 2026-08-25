import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RepoProviderId } from "@/lib/repo-providers";
import { isForgeRelayClientConfigured } from "@/lib/server/forge-relay/client";
import { pushRelayLinkEvent } from "@/lib/server/forge-relay/link-push";

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
  /** Embedded from git_connections; array in PostgREST typing, object at runtime. */
  git_connections?: { source: string | null } | { source: string | null }[] | null;
}

interface PrRow {
  id: string;
  number: number;
  issue_id: string | null;
}

function splitFullName(fullName: string): { owner: string | null; name: string } {
  const cut = fullName.lastIndexOf("/");
  if (cut <= 0 || cut === fullName.length - 1) return { owner: null, name: fullName };
  return { owner: fullName.slice(0, cut), name: fullName.slice(cut + 1) };
}

/**
 * Moves the PR rows of `oldName` onto `newName`.
 *
 * Webhooks keep flowing DURING and after a rename: rows may already exist
 * under the new name (fresh data), while the old-name rows hold history such
 * as the ticket attachment. Rows without a new-name twin simply change name;
 * twins are collapsed into the newer row, carrying over the ticket link the
 * fresh row may lack.
 */
async function migratePullRequests(
  supabase: SupabaseClient,
  provider: RepoProviderId,
  oldName: string,
  newName: string,
): Promise<void> {
  const { data } = await supabase
    .from("pull_requests")
    .select("id, number, issue_id, repo_full_name")
    .eq("provider", provider)
    .in("repo_full_name", [oldName, newName]);
  const rows = ((data ?? []) as unknown as (PrRow & { repo_full_name: string })[]).filter(
    (row) => row.repo_full_name === oldName || row.repo_full_name === newName,
  );

  const twins = new Map<number, PrRow>();
  for (const row of rows) {
    if (row.repo_full_name === newName) twins.set(row.number, row);
  }

  for (const row of rows) {
    if (row.repo_full_name !== oldName) continue;
    const twin = twins.get(row.number);
    if (!twin) {
      const { error } = await supabase
        .from("pull_requests")
        .update({ repo_full_name: newName })
        .eq("id", row.id);
      if (error) throw new Error(`pull_requests rename failed: ${error.message}`);
      continue;
    }
    // Same PR on both names: the twin wins (it saw the latest webhooks), the
    // old row dies — but not its ticket attachment.
    if (!twin.issue_id && row.issue_id) {
      const { error } = await supabase
        .from("pull_requests")
        .update({ issue_id: row.issue_id })
        .eq("id", twin.id);
      if (error) throw new Error(`pull_requests twin merge failed: ${error.message}`);
    }
    const { error } = await supabase.from("pull_requests").delete().eq("id", row.id);
    if (error) throw new Error(`pull_requests duplicate cleanup failed: ${error.message}`);
  }
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
    .select("id, connection_id, repo_full_name, git_connections(source)")
    .eq("provider", opts.provider)
    .eq("external_repo_id", opts.externalRepoId);
  if (error) throw new Error(`project_git_links read failed: ${error.message}`);

  const stale = ((links ?? []) as unknown as StaleLinkRow[]).filter(
    (link) => link.repo_full_name && link.repo_full_name !== opts.fullName,
  );
  if (stale.length === 0) return { renamed: false };

  const { owner, name } = splitFullName(opts.fullName);
  for (const link of stale) {
    const oldName = link.repo_full_name as string;
    await migratePullRequests(supabase, opts.provider, oldName, opts.fullName);

    // The stamp dies rather than moving: right after a rename a fresh sweep
    // is exactly what we want (states may have moved while minting was down).
    const { error: stampError } = await supabase
      .from("pull_request_syncs")
      .delete()
      .eq("provider", opts.provider)
      .eq("repo_full_name", oldName);
    if (stampError) throw new Error(`pull_request_syncs cleanup failed: ${stampError.message}`);

    const { error: linkError } = await supabase
      .from("project_git_links")
      .update({
        repo_full_name: opts.fullName,
        repo_owner: owner,
        repo_name: name,
        updated_at: new Date().toISOString(),
      })
      .eq("id", link.id);
    if (linkError) throw new Error(`project_git_links rename failed: ${linkError.message}`);

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
