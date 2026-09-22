import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const allowedInvitationAccess = new Set([
  "app/api/projects/[id]/members/route.ts",
  "app/api/projects/invitations/route.ts",
  "lib/server/encryption/invitation-backfill.ts",
  "lib/server/invitation-token.ts",
  "lib/server/members.ts",
  "lib/server/retention.ts",
]);

const invitationTableAccess = /\.from\s*\(\s*["'`]project_invitations["'`]\s*\)/;

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const next = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesIn(next));
    else if (/\.[cm]?[jt]sx?$/.test(entry.name) &&
      !/\.(test|spec)\.[cm]?[jt]sx?$/.test(entry.name)) files.push(next);
  }
  return files;
}

const violations = [];
for (const file of [...await filesIn("app"), ...await filesIn("lib")]) {
  const normalized = file.split(path.sep).join("/");
  if (allowedInvitationAccess.has(normalized)) continue;
  if (invitationTableAccess.test(await readFile(file, "utf8"))) {
    violations.push(normalized);
  }
}

if (violations.length > 0) {
  console.error("Direct invitation table access is limited to the reviewed server paths:");
  for (const file of violations) console.error(`  ${file}`);
  process.exitCode = 1;
} else {
  console.log("Encrypted column access check passed.");
}
