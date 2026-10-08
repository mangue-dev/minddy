import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = new URL("..", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

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


test("documentation exceptions detect changed values and values outside their exact paths", (context) => {
  const probe = spawnSync("gitleaks", ["version"], { encoding: "utf8" });
  if (probe.error?.code === "ENOENT") {
    context.skip("Gitleaks is unavailable; CI runs the pinned history scanner separately.");
    return;
  }
  assert.equal(probe.status, 0);
  const directory = mkdtempSync(join(tmpdir(), "minddy-documentation-secret-policy-"));
  const fixtures = new Map();
  const add = (path, content) => fixtures.set(path, content);
  const address = ["demo", "example.invalid"].join("@");
  const sentinel = ["scheduler-test-", "secret-with-32-characters"].join("");
  const counterexample = ["min664-synthetic-", "k9RwB72P5nMxQ38v"].join("");
  const origin = "http://" + [192, 168, 1, 50].join(".");
  const changedOrigin = "http://" + [192, 168, 1, 51].join(".");
  const changedEmail = ["another", "fixture.invalid"].join("@");
  add("captures/shots/documentation-auth/shot.mjs", `const email = "${address}";\nconst other = "${changedEmail}";`);
  add("scripts/self-hosted-scheduler.test.mjs", `const secret = "${sentinel}";\nconst other_secret = "${counterexample}";`);
  for (const locale of ["en", "fr", "de", "es", "it", "pt-BR"]) {
    add(`content/documentation/${locale}/install-a-server.md`, `${origin}\n${changedOrigin}`);
  }
  for (const name of ["public-wizard-published-parser-check", "public-wizard-release-boundary-2026-10-08"]) {
    add(`content/documentation/reviews/${name}.json`, JSON.stringify({
      origin,
      callback: `${origin}/auth/callback,`,
      health: `${origin}/api/health,`,
      nextStep: `${origin}/auth/callback\n\n2. Prepare Auth.`,
      changedAddress: changedOrigin,
      undocumentedPath: `${origin}/private-records`,
    }, null, 2));
  }
  add("docs/unrelated-publication-probe.txt", `const email = "${address}";\nconst secret = "${sentinel}";\n${origin}`);
  for (const [path, content] of fixtures) {
    const target = join(directory, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  const report = join(directory, "redacted-report.json");
  const result = spawnSync("gitleaks", [
    "dir", directory, "--config", new URL(".gitleaks.toml", root).pathname,
    "--no-banner", "--redact=100", "--report-format", "json", "--report-path", report,
  ], { encoding: "utf8" });
  assert.equal(result.status, 1, "The scanner must reject the counterexamples.");
  const findings = JSON.parse(readFileSync(report, "utf8"));
  assert.equal(findings.length, 15);
  const counts = new Map();
  for (const finding of findings) {
    assert.equal(finding.Secret, "REDACTED");
    const path = [...fixtures.keys()].find((candidate) => finding.File.endsWith(candidate));
    assert.ok(path, "Every finding belongs to a deliberate counterexample.");
    counts.set(path, (counts.get(path) ?? 0) + 1);
  }
  for (const path of fixtures.keys()) {
    const expected = path.endsWith(".json") ? 2 : path.endsWith(".txt") ? 3 : 1;
    assert.equal(counts.get(path), expected, path);
  }
});
