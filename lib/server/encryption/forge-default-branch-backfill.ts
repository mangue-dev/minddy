import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { recordBackfillAttempt } from "./backfill-attempt";
import { decodeDefaultBranch,defaultBranchState,
  encodeDefaultBranch,isEncryptedDefaultBranch } from
  "@/lib/server/git/default-branch-content";
import { isContentEncryptionEnabled } from "./content-config";
import { getContentKeys } from "./registry";

/** Rotate private default branches in bounded compare-and-swap batches. */
export async function backfillForgeDefaultBranchesBatch(limit=30,
  signal?:AbortSignal) {
  if (!isContentEncryptionEnabled()) {
    throw new Error("Forge default branch encryption is not enabled");
  }
  if (!Number.isSafeInteger(limit) || limit<1 || limit>100) {
    throw new Error("Invalid forge default branch batch size");
  }
  const service=getServiceClient();
  const result={ scanned:0,migrated:0,unchanged:0,conflicted:0,
    failed:0,interrupted:false };
  const { data,error } = await service.from("project_git_links")
    .select("project_id,default_branch")
    .not("default_branch","is",null)
    .order("default_branch_attempted_at",{ ascending:true,nullsFirst:true })
    .order("project_id",{ ascending:true }).limit(limit);
  if (error) throw new Error("Unable to scan forge default branches");
  for (const row of data ?? []) {
    if (signal?.aborted) { result.interrupted=true;break; }
    result.scanned++;
    try {
      if (!await recordBackfillAttempt(service, "project_git_links",
        "default_branch_attempted_at", { project_id: row.project_id, default_branch: row.default_branch })) {
        result.conflicted++;
        continue;
      }
      if (!row.project_id || !row.default_branch) {
        throw new Error("Missing forge default branch scope");
      }
      const clear=await decodeDefaultBranch(row.project_id,row.default_branch);
      if (!clear) throw new Error("Missing forge default branch");
      const current=await getContentKeys().current({ kind:"project",
        id:row.project_id });
      const version=current.version;
      current.bytes.fill(0);
      const fresh=isEncryptedDefaultBranch(row.default_branch) &&
        defaultBranchState(row.default_branch).version===version &&
        defaultBranchState(row.default_branch).format===3;
      const replacement=fresh ? row.default_branch
        : await encodeDefaultBranch(row.project_id,clear);
      if (await decodeDefaultBranch(row.project_id,replacement)!==clear) {
        throw new Error("Forge default branch conversion mismatch");
      }
      if (signal?.aborted) { result.interrupted=true;break; }
      const write=await service.rpc("migrate_forge_default_branch",{
        p_project_id:row.project_id,p_old:row.default_branch,
        p_new:fresh?null:replacement });
      if (write.error) throw new Error("Unable to migrate forge default branch");
      if (!write.data) result.conflicted++;
      else if (fresh) result.unchanged++;
      else result.migrated++;
    } catch { result.failed++; }
  }
  return result;
}
