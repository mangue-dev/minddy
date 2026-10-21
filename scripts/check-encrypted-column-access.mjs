import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

const allowedInvitationAccess = new Set([
  "app/api/projects/[id]/members/route.ts",
  "app/api/projects/invitations/route.ts",
  "lib/server/encryption/invitation-backfill.ts",
  "lib/server/invitation-token.ts",
  "lib/server/members.ts",
  "lib/server/project-working-set-readers.ts",
  "lib/server/retention.ts",
]);

const rules = [
  {
    access: /process\s*\.\s*env\s*(?:\.\s*MINDDY_(?!CONTENT_ENCRYPTION_ENABLED\b)[A-Z_]*(?:ENCRYPTION|CLEANUP|SCRUB)_ENABLED|\[\s*["']MINDDY_(?!CONTENT_ENCRYPTION_ENABLED["'])[A-Z_]*(?:ENCRYPTION|CLEANUP|SCRUB)_ENABLED["']\s*\])/,
    allowed: new Set(),
  },
  {
    access: /process\s*\.\s*env\s*(?:\.\s*MINDDY_[A-Z_]*(?:ENCRYPTION|CLEANUP|SCRUB)_ENABLED|\[\s*["']MINDDY_[A-Z_]*(?:ENCRYPTION|CLEANUP|SCRUB)_ENABLED["']\s*\])/,
    allowed: new Set(["lib/server/encryption/content-config.ts"]),
  },
  {
    access: /\.\s*from\s*\(\s*["'`]push_subscriptions["'`]\s*\)/,
    allowed: new Set([
      "app/api/account/push-subscriptions/route.ts",
      "app/api/account/push-subscriptions/[id]/route.ts",
      "app/api/account/push-subscriptions/test/route.ts",
      "lib/server/push/send.ts", "lib/server/account-export.ts",
      "lib/server/encryption/push-backfill.ts",
      "lib/server/encryption/critical-backfill-readiness.ts",
    ]),
  },
  {
    access: /\.\s*from\s*\(\s*["'`]integrations["'`]\s*\)/,
    allowed: new Set(["lib/server/integrations.ts",
      "lib/server/integration-auth.ts", "lib/server/webhooks.ts",
      "lib/server/assistant/execute-tool.ts", "lib/server/mcp/tools.ts",
      "lib/server/smart-fill.ts", "app/api/me/board/route.ts",
      "lib/server/encryption/integration-backfill.ts",
      "lib/server/encryption/critical-backfill-readiness.ts"]),
  },
  {
    access: /\bintegration:integrations\([^\r\n)]*\)/,
    allowed: new Set(["lib/server/issue-event-store.ts"]),
  },
  {
    access: /\bapi_keys(?:![\w]+)?\([^\r\n)]*\b(?:name|agent)\b/,
    allowed: new Set(["lib/server/oauth/grants.ts"]),
  },
  {
    access: /\.\s*from\s*\(\s*["'`]api_keys["'`]\s*\)/,
    allowed: new Set(["lib/server/oauth/grants.ts",
      "lib/server/api-key-actors.ts", "lib/server/account-export.ts",
      "lib/server/inbox.ts", "lib/server/notifications.ts",
      "lib/server/smart-fill.ts", "lib/server/encryption/api-key-backfill.ts",
      "app/api/oauth/token/route.ts",
      "lib/server/encryption/critical-backfill-readiness.ts"]),
  },
  {
    access: /\.\s*from\s*\(\s*["'`]managed_ai_keys["'`]\s*\)/,
    allowed: new Set(["lib/server/managed-ai-key.ts"]),
  },
  {
    access: /\.\s*from\s*\(\s*["'`]oauth_authorization_codes["'`]\s*\)/,
    allowed: new Set(["lib/server/oauth/codes.ts",
      "lib/server/encryption/oauth-code-backfill.ts",
      "lib/server/retention.ts",
      "lib/server/encryption/critical-backfill-readiness.ts"]),
  },
  {
    access: /\.\s*from\s*\(\s*["'`]oauth_clients["'`]\s*\)/,
    allowed: new Set(["lib/server/oauth/clients.ts",
      "lib/server/oauth/grants.ts",
      "lib/server/encryption/oauth-client-backfill.ts",
      "lib/server/encryption/critical-backfill-readiness.ts"]),
  },
  {
    access: /\boauth_clients\([^\r\n)]*\)/,
    allowed: new Set(["lib/server/oauth/grants.ts"]),
  },
  {
    access: /\bissues(?:![\w]+)?\([^\r\n)]*\b(?:title|description|plan|remote_url|automation_override)\b/,
    allowed: new Set(),
  },
  {
    access: /\.\s*from\s*\(\s*["'`]issues["'`]\s*\)/,
    allowed: new Set([
      "lib/server/issue-store.ts", "lib/server/encryption/issue-backfill.ts",
      "lib/server/create-issue.ts", "lib/server/update-issue.ts",
      "lib/server/import-issues.ts", "lib/server/issue-reads.ts",
      "lib/server/git/issue-sync.ts",
      "lib/server/comment-store.ts", "app/api/issues/[id]/comments/route.ts",
      "app/api/issues/[id]/route.ts", "lib/server/assistant/comment-agent.ts",
      // Parent checks of editor documents (MIN-728): id, project and
      // encryption version only, never content.
      "lib/server/rich-documents.ts", "app/api/documents/[kind]/[id]/route.ts",
      "lib/server/cycles.ts", "lib/server/recurrence.ts", "lib/server/smart-assign.ts",
      "captures/world/seed/002-projet-aurora.mjs", "captures/world/seed/003-projet-beacon.mjs",
      "captures/world/seed/004-cycle.mjs", "captures/world/seed/006-numo.mjs",
      "captures/world/seed/008-agent.mjs", "captures/world/seed/009-densite-aurora.mjs",
      "captures/world/seed/014-pages-aurora.mjs", "captures/world/seed/015-current-cycle-completed.mjs",
      "captures/world/seed/017-cycle-recal.mjs", "captures/world/seed/_issues.mjs",
      // Statistics seed (MIN-737): ids, statuses, people and dates, no content.
      "captures/world/seed/018-statistiques.mjs",
    ]),
  },
  {
    access: /\.\s*from\s*\(\s*["'`]github_issue_sync_metadata["'`]\s*\)/,
    allowed: new Set(["lib/server/git/issue-sync.ts",
      "lib/server/issue-reads.ts", "app/api/issues/[id]/route.ts",
      "lib/server/encryption/github-issue-metadata-backfill.ts"]),
  },
  {
    access: /\.\s*from\s*\(\s*["'`]github_issue_comment_syncs["'`]\s*\)/,
    allowed: new Set(["lib/server/comment-store.ts", "lib/server/git/issue-sync.ts",
      "lib/server/issue-reads.ts", "app/api/issues/[id]/comments/route.ts",
      "lib/server/encryption/github-comment-url-backfill.ts"]),
  },
  {
    access: /\.\s*(?:from\s*\(\s*["'`]github_issue_comment_url_encryption_scopes["'`]|rpc\s*\(\s*["'`](?:migrate_github_comment_url|sync_github_issue_comment_encrypted_url)["'`])/,
    allowed: new Set(["lib/server/git/comment-sync-url-content.ts",
      "lib/server/comment-store.ts",
      "lib/server/encryption/github-comment-url-backfill.ts"]),
  },
  {
    access: /\.\s*(?:from\s*\(\s*["'`]github_issue_metadata_encryption_scopes["'`]|rpc\s*\(\s*["'`](?:migrate_github_issue_metadata|sync_github_issue_metadata_encrypted)["'`])/,
    allowed: new Set(["lib/server/git/issue-sync-content.ts",
      "lib/server/git/issue-sync.ts",
      "lib/server/encryption/github-issue-metadata-backfill.ts"]),
  },
  {
    access: /\.\s*(?:from\s*\(\s*["'`]issue_encryption_scopes["'`]|rpc\s*\(\s*["'`]migrate_issue_ciphertext["'`])/,
    allowed: new Set(["lib/server/issue-store.ts", "lib/server/encryption/issue-backfill.ts",
      "lib/server/issue-embedding-store.ts", "captures/world/seed/_issues.mjs"]),
  },
  {
    // Editor documents of descriptions and the notebook (MIN-728) are
    // encrypted content: only their repository reads or writes the table.
    access: /\.\s*(?:from\s*\(\s*["'`]rich_documents["'`]\s*\)|rpc\s*\(\s*["'`]purge_clear_rich_documents["'`])/,
    allowed: new Set(["lib/server/rich-documents.ts"]),
  },
  {
    // Issue vectors and their content fingerprints (MIN-717) are encrypted
    // derived content: only their repository reads or writes the table.
    access: /\.\s*from\s*\(\s*["'`]issue_embeddings["'`]\s*\)/,
    allowed: new Set(["lib/server/issue-embedding-store.ts"]),
  },
  {
    access: /\.\s*from\s*\(\s*["'`]feedback_posts["'`]\s*\)/,
    allowed: new Set([
      "lib/server/feedback-post-store.ts", "lib/server/encryption/feedback-post-backfill.ts",
      "lib/server/feedback/posts.ts", "lib/server/feedback/review.ts",
      "lib/server/feedback/queries.ts", "lib/server/feedback/promote.ts",
      "lib/server/feedback/merge.ts", "lib/server/feedback/status-sync.ts",
      "lib/server/feedback/comments.ts", "lib/server/feedback/votes.ts",
      "lib/server/add-comment.ts", "lib/server/assistant/comment-agent.ts",
      "app/api/cron/feedback-analysis/route.ts", "app/api/me/triage-counts/route.ts",
      "app/api/projects/[id]/feedback/counts/route.ts", "app/api/v1/feedback/[id]/vote/route.ts",
      "captures/world/seed/007-feedback.mjs",
    ]),
  },
  {
    access: /\.\s*from\s*\(\s*["'`]project_drafts["'`]\s*\)/,
    allowed: new Set(["lib/server/project-draft-store.ts",
      "lib/server/encryption/project-draft-backfill.ts", "app/api/project-drafts/[id]/route.ts"]),
  },
  {
    access: /\.\s*rpc\s*\(\s*["'`](?:save_project_draft_guarded|migrate_project_draft_ciphertext)["'`]/,
    allowed: new Set(["lib/server/project-draft-store.ts", "lib/server/encryption/project-draft-backfill.ts"]),
  },
  {
    access: /\.\s*from\s*\(\s*["'`]categories["'`]\s*\)/,
    allowed: new Set(["lib/server/category-store.ts", "lib/server/categories.ts",
      "lib/server/encryption/category-backfill.ts", "lib/server/account-import.ts",
      "lib/server/create-issue.ts", "lib/server/set-issue-categories.ts",
      "lib/server/feedback/set-post-categories.ts", "app/api/categories/[id]/route.ts",
      "app/api/v1/issues/route.ts", "captures/world/seed/013-categories-en.mjs",
      "captures/world/seed/_categories.mjs"]),
  },
  {
    access: /\.\s*rpc\s*\(\s*["'`]delete_category_guarded["'`]/,
    allowed: new Set(["app/api/categories/[id]/route.ts"]),
  },
  {
    access: /\.\s*from\s*\(\s*["'`]objectives["'`]\s*\)/,
    allowed: new Set(["lib/server/objective-store.ts", "lib/server/objectives.ts",
      "lib/server/account-import.ts", "lib/server/encryption/objective-backfill.ts",
      // Parent checks of editor documents (MIN-728): metadata only.
      "lib/server/rich-documents.ts", "app/api/documents/[kind]/[id]/route.ts"]),
  },
  {
    access: /\.\s*from\s*\(\s*["'`](?:comments|page_comments)["'`]\s*\)/,
    allowed: new Set(["lib/server/comment-store.ts"]),
  },
  {
    access: /\.\s*rpc\s*\(\s*["'`]sync_github_issue_comment_atomic["'`]/,
    allowed: new Set(["lib/server/comment-store.ts"]),
  },
  {
    access: /\.\s*from\s*\(\s*["'`]issue_events["'`]\s*\)/,
    allowed: new Set(["lib/server/issue-event-store.ts"]),
  },
  {
    access: /\.\s*from\s*\(\s*["'`]page_versions["'`]\s*\)/,
    allowed: new Set(["lib/server/page-version-store.ts", "lib/server/retention.ts"]),
  },
  {
    // The live collaboration journal (MIN-688) holds page text, deleted text
    // included: only its store reads or writes it, or runs the RPCs that
    // journal it and write its projection, after access checks.
    access: /\.\s*from\s*\(\s*["'`]page_collaboration_batches["'`]\s*\)|\.\s*rpc\s*\(\s*["'`](?:(?:append|commit|materialize|reset)_page_collaboration|read_page_collaboration_journal)["'`]/,
    allowed: new Set(["lib/server/page-collaboration.ts"]),
  },
  {
    access: /\.\s*from\s*\(\s*["'`]stat_events["'`]\s*\)/,
    allowed: new Set(["lib/server/stat-events.ts", "lib/server/encryption/stat-events-backfill.ts",
      // Demo statistics seed (MIN-737): reads only `kind` and `issue_id`, and
      // inserts rows whose snapshot texts (project name, issue title, task
      // text) stay null, so no content needs the row codec.
      "captures/world/seed/018-statistiques.mjs"]),
  },
  {
    access: /\.\s*from\s*\(\s*["'`]user_scratchpad["'`]\s*\)/,
    allowed: new Set(["lib/server/scratchpad.ts", "lib/server/encryption/scratchpad-backfill.ts", "captures/world/seed/005-carnet.mjs",
      // The notebook document's parent check (MIN-728): encryption version only.
      "lib/server/rich-documents.ts"]),
  },
  {
    access: /\.\s*from\s*\(\s*["'`]project_invitations["'`]\s*\)/,
    allowed: allowedInvitationAccess,
  },
  {
    access: /\.\s*rpc\s*\(\s*["'`]create_project_invitation_(?:encrypted_)?guarded["'`]/,
    allowed: new Set(["lib/server/members.ts"]),
  },
  {
    access: /\.\s*from\s*\(\s*["'`]envelope_data_keys["'`]\s*\)/,
    allowed: new Set(["lib/server/encryption/registry.ts",
      "lib/server/encryption/forge-attachment-readiness.ts"]),
  },
  {
    access: /\.\s*rpc\s*\(\s*["'`](?:create_envelope_data_key_if_absent|rotate_envelope_data_key)["'`]/,
    allowed: new Set(["lib/server/encryption/registry.ts"]),
  },
];

// Include components, tools, scripts and deployment code, plus untracked local changes.
const files = [...new Set(execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"])
  .toString().split("\0"))].filter((file) => /\.[cm]?[jt]sx?$/.test(file) &&
    !/\.(test|spec)\.[cm]?[jt]sx?$/.test(file));

const dynamicConsumers = await readFile("docs/security/encryption/consumers.json", "utf8")
  .then((value) => JSON.parse(value))
  .catch(() => []);
const reviewedDynamicReaders = new Set(dynamicConsumers
  .filter((call) => call.operation === "from" && call.resource === null && !call.storage)
  .map((call) => call.file));
const protectedReaderContracts = new Map([
  ["lib/server/trash.ts", ["decodeIssue", "decodeObjective", "decodePageProjection"]],
  ["lib/server/app-tab-metadata.ts", ["decodeIssue", "decodeObjective",
    "decodePageProjection", "decodePullRequestContentRow"]],
  ["lib/server/page-backlinks.ts", ["decodeIssue", "decodeObjective",
    "decodePageProjection"]],
  // Mention targets (MIN-734): page titles and project names, decoded for an
  // access-checked reader.
  ["lib/server/mention-access.ts", ["decodePageProjection", "decodeProjectName"]],
]);

const violations = [];
for (const file of files) {
  const normalized = file.split(path.sep).join("/");
  const source = await readFile(file, "utf8").catch((error) => {
    if (error.code === "ENOENT") return ""; // A tracked file can be deleted locally.
    throw error;
  });
  if (rules.some(({ access, allowed }) => !allowed.has(normalized) && access.test(source))) {
    violations.push(normalized);
  }
  if (normalized.startsWith("lib/server/") &&
      /\b(?:client|service|supabase|userSupabase)\s*\.\s*from\s*\(\s*[A-Za-z_$][\w$]*(?:\[[^\]]+\])?\s*\)/.test(source) &&
      !reviewedDynamicReaders.has(normalized)) {
    violations.push(normalized);
  }
  const requiredDecoders = protectedReaderContracts.get(normalized);
  if (normalized === "lib/server/project-working-set-readers.ts" &&
      (!/await\s+decryptInvitationEmail\s*\(/.test(source) ||
        !/invited_email_ciphertext/.test(source))) {
    violations.push(normalized);
  }
  if (requiredDecoders && (requiredDecoders.some((name) =>
      !new RegExp(`\\b${name}\\s*\\(`).test(source)) ||
      !/encrypted_content\s*,\s*encryption_version/.test(source))) {
    violations.push(normalized);
  }
  if (normalized === "lib/server/encryption/forge-attachment-readiness.ts" &&
      (!/from\s*\(\s*["']envelope_data_keys["']\s*\)\s*\.select\s*\(\s*["']version["']\s*\)/.test(source) ||
        !/await\s+decodeAttachmentObject\s*\(/.test(source) ||
        !/createHash\s*\(\s*["']sha256["']\s*\)/.test(source) ||
        /(?:\.from\s*\([^;]*?\)\s*\.|\bquery\.)(?:insert|update|upsert|delete)\s*\(/.test(source))) {
    violations.push(normalized);
  }
  if (normalized === "app/api/project-drafts/[id]/route.ts" &&
      /\.\s*from\s*\(\s*["'`]project_drafts["'`]\s*\)(?!\s*\.\s*delete\s*\(\s*\))/.test(source)) {
    violations.push(normalized);
  }
  // The demo seed only checks existence. Its constant demo fixture is not a user-content reader.
  if (normalized === "captures/world/seed/005-carnet.mjs" &&
      /\.\s*from\s*\(\s*["'`]user_scratchpad["'`]\s*\)(?!\s*\.\s*select\s*\(\s*["'`]user_id["'`]\s*\))/.test(source)) {
    violations.push(normalized);
  }
}

if (violations.length > 0) {
  console.error("Encrypted table and RPC access is limited to the reviewed server paths:");
  for (const file of violations) console.error(`  ${file}`);
  process.exitCode = 1;
} else {
  console.log("Encrypted column access check passed.");
}
