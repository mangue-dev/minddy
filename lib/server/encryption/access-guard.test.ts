import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const script = path.resolve("scripts/check-encrypted-column-access.mjs");

function check(file: string, source: string) {
  const root = mkdtempSync(path.join(tmpdir(), "minddy-encrypted-access-"));
  try {
    execFileSync("git", ["init", "--quiet", root]);
    for (const directory of ["app", "lib", path.dirname(file)]) {
      mkdirSync(path.join(root, directory), { recursive: true });
    }
    writeFileSync(path.join(root, file), source);
    return spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("encrypted access CI guard", () => {
  it.each([
    ["app/api/unsafe.ts", 'service.rpc("create_project_invitation_guarded", params)'],
    ["lib/unsafe.ts", 'service.rpc("create_project_invitation_encrypted_guarded", params)'],
    ["components/unsafe.tsx", 'service.from("project_invitations").select("*")'],
    ["scripts/unsafe.mjs", 'service.from("project_invitations").update(patch)'],
    ["app/unsafe.ts", 'service.from("envelope_data_keys").select("*")'],
    ["lib/unsafe.ts", 'service.rpc("rotate_envelope_data_key", params)'],
  ])("rejects unreviewed access in %s", (file, source) => {
    const result = check(file, source);
    expect(result.status, result.stdout + result.stderr).toBe(1);
    expect(result.stderr).toContain(file);
  });

  it.each([
    ["lib/server/members.ts", 'service.rpc("create_project_invitation_guarded", params)'],
    ["lib/server/encryption/registry.ts", 'service.from("envelope_data_keys").select("*")'],
    ["app/safe.ts", 'service.from("projects").select("id")'],
  ])("allows reviewed access in %s", (file, source) => {
    const result = check(file, source);
    expect(result.status, result.stdout + result.stderr).toBe(0);
  });
});
