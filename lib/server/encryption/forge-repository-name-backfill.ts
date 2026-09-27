import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { recordBackfillAttempt } from "./backfill-attempt";
import { isContentEncryptionEnabled } from "./content-config";
import { decodeRepositoryName, isProtectedRepositoryName,
  registerRepositoryName, rotateRepositoryName } from
  "@/lib/server/git/repository-name-content";

type Table = "project_git_links" | "pull_requests" | "pull_request_syncs" |
  "pr_comment_edits" | "forge_relay_link_mirror" | "forge_relay_claims";
type Row = { id?: string; instance_id?: string; external_repo_id?: string;
  provider?: string; repo_full_name?: string | null;
  repository_full_name?: string | null; repo_owner?: string | null;
  repo_name?: string | null; repo_previous_names?: string[] | null };

const COLUMNS: Record<Table,string> = {
  project_git_links:"id,provider,repo_full_name,repo_owner,repo_name,repo_previous_names",
  pull_requests:"id,provider,repo_full_name",
  pull_request_syncs:"provider,repo_full_name",
  pr_comment_edits:"id,provider,repo_full_name",
  forge_relay_link_mirror:"instance_id,provider,external_repo_id,repo_full_name",
  forge_relay_claims:"id,repository_full_name",
};

/** Convert each linked name and copy with a bounded, restartable CAS pass. */
export async function backfillForgeRepositoryNamesBatch(limit=30,
  signal?: AbortSignal) {
  if (!isContentEncryptionEnabled() ||
      process.env.MINDDY_FORGE_REPOSITORY_NAME_ENCRYPTION_ENABLED!=="true") {
    throw new Error("Forge repository name encryption is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit<1 || limit>100) {
    throw new Error("Invalid forge repository name batch size");
  }
  const service = getServiceClient();
  const result = { scanned:0,migrated:0,unchanged:0,conflicted:0,
    failed:0,interrupted:false };
  for (const table of Object.keys(COLUMNS) as Table[]) {
    const { data,error } = await service.from(table).select(COLUMNS[table])
      .order("repo_name_attempted_at",{ ascending:true,nullsFirst:true })
      .limit(limit);
    if (error) throw new Error(`Unable to scan ${table} repository identities`);
    for (const row of (data ?? []) as Row[]) {
      if (signal?.aborted) { result.interrupted=true; return result; }
      result.scanned++;
      try {
        const expected = table === "pull_request_syncs"
          ? { provider: row.provider, repo_full_name: row.repo_full_name }
          : table === "forge_relay_link_mirror"
          ? { instance_id: row.instance_id, provider: row.provider,
            external_repo_id: row.external_repo_id,
            repo_full_name: row.repo_full_name }
          : table === "forge_relay_claims"
          ? { id: row.id, repository_full_name: row.repository_full_name }
          : { id: row.id, provider: row.provider,
            repo_full_name: row.repo_full_name,
            ...(table === "project_git_links" ? {
              repo_owner: row.repo_owner, repo_name: row.repo_name,
              repo_previous_names: row.repo_previous_names } : {}) };
        if (!await recordBackfillAttempt(service, table,
          "repo_name_attempted_at", expected)) {
          result.conflicted++;
          continue;
        }
        const provider = table==="forge_relay_claims" ? "github" : row.provider;
        if (provider!=="github" && provider!=="gitlab") {
          throw new Error("Invalid forge repository provider");
        }
        const old = table==="forge_relay_claims"
          ? row.repository_full_name ?? null : row.repo_full_name ?? null;
        const owner = row.repo_owner ?? null;
        const repo = row.repo_name ?? null;
        const aliases = row.repo_previous_names ?? [];
        const source = old ?? (table==="project_git_links" && owner && repo
          ? `${owner}/${repo}` : null);
        if (table==="project_git_links" && !source && (owner || repo)) {
          throw new Error("Incomplete forge repository identity");
        }
        const clear = source ? await decodeRepositoryName(provider,source) : null;
        const token = clear ? await registerRepositoryName(provider,clear) : null;
        const encodedAliases = await Promise.all(aliases.map(async (alias) => {
          const name = await decodeRepositoryName(provider,alias);
          return registerRepositoryName(provider,name!);
        }));
        const id = table==="forge_relay_link_mirror" ? row.instance_id : row.id;
        const migrated = old!==token || table==="project_git_links" &&
          (owner!==null || repo!==null ||
            aliases.some((name,index) => name!==encodedAliases[index]));
        if (signal?.aborted) { result.interrupted=true; return result; }
        const write = await service.rpc("migrate_forge_repository_name",{
          p_table:table,p_id:id ?? null,p_provider:provider,
          p_old:old,p_new:token,p_old_aliases:table==="project_git_links"
            ? aliases:null,p_new_aliases:table==="project_git_links"
            ? encodedAliases:null,p_old_owner:owner,p_old_repo:repo,
          p_external_repo_id:row.external_repo_id ?? null,
        });
        if (write.error) throw new Error("Unable to migrate forge repository name");
        if (!write.data) result.conflicted++;
        else if (migrated) result.migrated++;
        else result.unchanged++;
      } catch { result.failed++; }
    }
  }
  const registry = await service.from("forge_repository_names")
    .select("provider,token")
    .order("encryption_attempted_at",{ ascending:true,nullsFirst:true })
    .order("token",{ ascending:true }).limit(limit);
  if (registry.error) throw new Error("Unable to scan forge repository registry");
  for (const row of registry.data ?? []) {
    if (signal?.aborted) { result.interrupted=true; return result; }
    result.scanned++;
    try {
      if (!await recordBackfillAttempt(service, "forge_repository_names",
        "encryption_attempted_at", { provider: row.provider, token: row.token })) {
        result.conflicted++;
        continue;
      }
      if (!isProtectedRepositoryName(row.token)) {
        throw new Error("Invalid forge repository token");
      }
      const state = await rotateRepositoryName(row.provider,row.token);
      result[state]++;
    } catch { result.failed++; }
  }
  return result;
}
