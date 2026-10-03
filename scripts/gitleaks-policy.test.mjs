import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("..", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("The MIN-614 evidence exception is restricted to its exact source checksum and manifest", () => {
  const policy = read(".gitleaks.toml");
  const digest = createHash("sha256").update(read("lib/realtime-keys.ts")).digest("hex");
  const block = policy.split("[[allowlists]]").find((entry) => entry.includes("MIN-614 pass-3b source fingerprint"));
  assert.ok(block);
  assert.match(block, /targetRules = \["generic-api-key"\]/);
  assert.match(block, /condition = "AND"/);
  assert.ok(block.includes("docs/audits/desktop-perf-min-614-pass-3b-results\\.json$"));
  assert.ok(block.includes(`^${digest}$`));
});

test("Gitleaks extends maintained rules and adds publication-specific markers", () => {
  const policy = read(".gitleaks.toml");
  assert.match(policy, /useDefault\s*=\s*true/);
  assert.match(policy, /id\s*=\s*"minddy-internal-network-url"/);
  assert.match(policy, /id\s*=\s*"minddy-personal-email-marker"/);
  assert.match(policy, /targetRules\s*=\s*\["private-key"\]/);
  assert.doesNotMatch(policy, /paths\s*=\s*\[[^\]]*(?:\*\*|fixtures\?)/s);
  assert.doesNotMatch(policy, /paths\s*=\s*\[\s*'''(?:\.\*|\(\?:\^\|\/\)\.\*)/s);
});

test("CI scans all Git history with the checked-in policy and redacts findings", () => {
  const workflow = read(".github/workflows/ci.yml");
  assert.match(
    workflow,
    /ghcr\.io\/gitleaks\/gitleaks:v8\.30\.1@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f/,
  );
  assert.match(workflow, /--config \/repo\/\.gitleaks\.toml/);
  assert.match(workflow, /--log-opts="--all"/);
  assert.match(workflow, /--redact=100/);
});
