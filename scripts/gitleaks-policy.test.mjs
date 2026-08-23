import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = new URL("..", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("Gitleaks extends maintained rules and adds publication-specific markers", () => {
  const policy = read(".gitleaks.toml");
  assert.match(policy, /useDefault\s*=\s*true/);
  assert.match(policy, /id\s*=\s*"minddy-internal-network-url"/);
  assert.match(policy, /id\s*=\s*"minddy-personal-email-marker"/);
  assert.doesNotMatch(policy, /(?:^|\n)paths\s*=/);
});

test("CI scans all Git history with the checked-in policy and redacts findings", () => {
  const workflow = read(".github/workflows/ci.yml");
  assert.match(workflow, /ghcr\.io\/gitleaks\/gitleaks:8\.30\.1/);
  assert.match(workflow, /--config \/repo\/\.gitleaks\.toml/);
  assert.match(workflow, /--log-opts="--all"/);
  assert.match(workflow, /--redact=100/);
});
