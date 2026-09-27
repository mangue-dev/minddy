import "server-only";

import { getServiceClient } from "@/lib/supabase-service";

const ATTEMPT_COLUMNS = {
  github_issue_comment_syncs: ["html_url_encryption_attempted_at"],
  views: ["encryption_attempted_at"],
  project_git_links: ["default_branch_attempted_at", "repo_name_attempted_at"],
  attachments: ["content_encryption_attempted_at"],
  page_files: ["content_encryption_attempted_at"],
  forge_relay_audit: ["detail_attempted_at"],
  pull_requests: ["repo_name_attempted_at"],
  pull_request_syncs: ["repo_name_attempted_at"],
  pr_comment_edits: ["repo_name_attempted_at", "body_encryption_attempted_at"],
  forge_relay_link_mirror: ["repo_name_attempted_at"],
  forge_relay_claims: ["repo_name_attempted_at"],
  forge_repository_names: ["encryption_attempted_at"],
  projects: ["encryption_attempted_at", "icon_attempted_at"],
  pages: ["encryption_attempted_at"],
  saved_views: ["encryption_attempted_at"],
  forge_relay_deliveries: ["content_encryption_attempted_at"],
  view_shares: ["content_encryption_attempted_at"],
  github_issue_sync_metadata: ["content_encryption_attempted_at"],
} as const;

type Table = keyof typeof ATTEMPT_COLUMNS;
type Column<T extends Table> = (typeof ATTEMPT_COLUMNS)[T][number];

/** Move a row behind the rest of its bounded queue without claiming verification. */
export async function recordBackfillAttempt<T extends Table>(
  service: ReturnType<typeof getServiceClient>, table: T,
  column: Column<T>, expected: Record<string, unknown>) {
  if (!(ATTEMPT_COLUMNS[table] as readonly string[]).includes(column)) {
    throw new Error("Unsupported backfill attempt column");
  }
  const { data, error } = await service.rpc("record_encryption_backfill_progress", {
    p_table: table, p_attempt_column: column, p_expected: expected,
    p_verified: false,
  });
  if (error) throw new Error("Unable to record backfill attempt");
  return data === true;
}
