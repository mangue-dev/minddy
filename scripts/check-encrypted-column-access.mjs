import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

const allowedInvitationAccess = new Set([
  "app/api/projects/[id]/members/route.ts",
  "app/api/projects/invitations/route.ts",
  "lib/server/encryption/invitation-backfill.ts",
  "lib/server/invitation-token.ts",
  "lib/server/members.ts",
  "lib/server/retention.ts",
]);

const rules = [
  {
    access: /\.\s*from\s*\(\s*["'`]agent_run_events["'`]\s*\)/,
    allowed: new Set(["lib/server/agent/runs.ts",
      "lib/server/agent/run-event-store.ts",
      "app/api/pull-requests/route.ts", "lib/server/retention.ts"]),
  },
  {
    access: /\.\s*from\s*\(\s*["'`]agent_run_journal["'`]\s*\)/,
    allowed: new Set(["lib/server/agent/runs.ts",
      "lib/server/encryption/agent-journal-backfill.ts",
      "lib/server/retention.ts"]),
  },
  {
    access: /\.\s*(?:from\s*\(\s*["'`]agent_journal_encryption_scopes["'`]|rpc\s*\(\s*["'`]migrate_agent_journal_ciphertext["'`])/,
    allowed: new Set(["lib/server/agent/encrypted-journal.ts",
      "lib/server/encryption/agent-journal-backfill.ts"]),
  },
  {
    access: /\.\s*rpc\s*\(\s*["'`]agent_journal_legacy_batch_exists["'`]/,
    allowed: new Set(["lib/server/agent/runs.ts"]),
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
      "app/api/issues/[id]/route.ts", "lib/server/assistant/comment-agent.ts",
      "lib/server/agent/control-plane.ts", "lib/server/agent/vm-rest.ts",
      "lib/server/cycles.ts", "lib/server/recurrence.ts", "lib/server/smart-assign.ts",
      "captures/world/seed/002-projet-aurora.mjs", "captures/world/seed/003-projet-beacon.mjs",
      "captures/world/seed/004-cycle.mjs", "captures/world/seed/006-numo.mjs",
      "captures/world/seed/008-agent.mjs", "captures/world/seed/009-densite-aurora.mjs",
      "captures/world/seed/014-pages-aurora.mjs", "captures/world/seed/015-current-cycle-completed.mjs",
      "captures/world/seed/017-cycle-recal.mjs", "captures/world/seed/_issues.mjs",
    ]),
  },
  {
    access: /\.\s*(?:from\s*\(\s*["'`]issue_encryption_scopes["'`]|rpc\s*\(\s*["'`]migrate_issue_ciphertext["'`])/,
    allowed: new Set(["lib/server/issue-store.ts", "lib/server/encryption/issue-backfill.ts",
      "captures/world/seed/_issues.mjs"]),
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
      "lib/server/account-import.ts", "lib/server/encryption/objective-backfill.ts"]),
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
    access: /\.\s*from\s*\(\s*["'`]stat_events["'`]\s*\)/,
    allowed: new Set(["lib/server/stat-events.ts", "lib/server/encryption/stat-events-backfill.ts"]),
  },
  {
    access: /\.\s*from\s*\(\s*["'`]user_scratchpad["'`]\s*\)/,
    allowed: new Set(["lib/server/scratchpad.ts", "lib/server/encryption/scratchpad-backfill.ts", "captures/world/seed/005-carnet.mjs"]),
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
    access: /\.\s*(?:from\s*\(\s*["'`]envelope_data_keys["'`]|rpc\s*\(\s*["'`](?:create_envelope_data_key_if_absent|rotate_envelope_data_key)["'`])/,
    allowed: new Set(["lib/server/encryption/registry.ts"]),
  },
];

// Include components, tools, scripts and deployment code, plus untracked local changes.
const files = [...new Set(execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"])
  .toString().split("\0"))].filter((file) => /\.[cm]?[jt]sx?$/.test(file) &&
    !/\.(test|spec)\.[cm]?[jt]sx?$/.test(file));

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
  if (normalized === "app/api/project-drafts/[id]/route.ts" &&
      /\.\s*from\s*\(\s*["'`]project_drafts["'`]\s*\)(?!\s*\.\s*delete\s*\(\s*\))/.test(source)) {
    violations.push(normalized);
  }
  // The demo seed only checks existence. Its constant demo fixture is not a user-content reader.
  if (normalized === "captures/world/seed/005-carnet.mjs" &&
      /\.\s*from\s*\(\s*["'`]user_scratchpad["'`]\s*\)(?!\s*\.\s*select\s*\(\s*["'`]user_id["'`]\s*\))/.test(source)) {
    violations.push(normalized);
  }
  if (normalized === "app/api/pull-requests/route.ts" &&
      /\.\s*from\s*\(\s*["'`]agent_run_events["'`]\s*\)(?!\s*\.\s*select\s*\(\s*["'`]run_id["'`]\s*\))/.test(source)) {
    violations.push(normalized);
  }
  if (normalized === "lib/server/retention.ts" &&
      /\.\s*from\s*\(\s*["'`]agent_run_(?:events|journal)["'`]\s*\)(?!\s*\.\s*delete\s*\()/.test(source)) {
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
