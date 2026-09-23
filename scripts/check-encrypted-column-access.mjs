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
