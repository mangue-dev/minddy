import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("..", import.meta.url));
const reader = "lib/server/project-working-set-readers.ts";
const source = readFileSync(join(root, reader), "utf8");
const checker = join(root, "scripts/check-encrypted-column-access.mjs");

function check(files) {
  const directory = mkdtempSync(join(tmpdir(), "minddy-encrypted-reader-"));
  try {
    execFileSync("git", ["init", "--quiet", directory]);
    for (const [file, content] of Object.entries(files)) {
      const target = join(directory, file);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
    return spawnSync(process.execPath, [checker], { cwd: directory, encoding: "utf8" });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("accepts the exact reviewed complete invitation reader", () => {
  const result = check({ [reader]: source });
  assert.equal(result.status, 0, result.stderr);
});

test("rejects missing invitation decoding or encrypted projection in the reviewed reader", () => {
  for (const changed of [source.replace("await decryptInvitationEmail(row", "await unreviewedDecode(row"),
    source.replace("invited_email_ciphertext", "unreviewed_email")]) {
    assert.notEqual(changed, source);
    const result = check({ [reader]: changed });
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes(reader));
  }
});

test("the invitation registration does not authorize raw issue or objective readers", () => {
  for (const table of ["issues", "objectives"]) {
    const result = check({ [reader]: `${source}\nauth.supabase.from("${table}").select("*");\n` });
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes(reader));
  }
});

test("rejects invitation access outside the reviewed path", () => {
  const file = "lib/server/unreviewed-invitations.ts";
  const result = check({ [file]: 'service.from("project_invitations").select("*");' });
  assert.equal(result.status, 1);
  assert.ok(result.stderr.includes(file));
});
