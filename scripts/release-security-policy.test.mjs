import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assertSecurityRelease,
  SECURITY_CHECKLIST_VERSION,
} from "./release-security-policy.mjs";

const valid = {
  checklistVersion: SECURITY_CHECKLIST_VERSION,
  reviewRef: "minddy-cloud-ops#123",
  residualRisks: "none",
  pentest: "not-required",
};

test("accepts a current review with no residual risk or required pentest", () => {
  assert.deepEqual(assertSecurityRelease(valid), valid);
});

test("accepts documented risks and a completed pentest", () => {
  assert.deepEqual(
    assertSecurityRelease({
      ...valid,
      reviewRef: "https://github.com/mangue-dev/minddy-cloud-ops/issues/123",
      residualRisks: "documented",
      pentest: "completed",
    }),
    {
      ...valid,
      reviewRef: "https://github.com/mangue-dev/minddy-cloud-ops/issues/123",
      residualRisks: "documented",
      pentest: "completed",
    },
  );
});

test("rejects an old checklist or missing evidence", () => {
  assert.throws(() => assertSecurityRelease({ ...valid, checklistVersion: "0.9" }), /version 1\.0/);
  assert.throws(() => assertSecurityRelease({ ...valid, reviewRef: " " }), /required/);
  assert.throws(
    () => assertSecurityRelease({ ...valid, reviewRef: "review;echo-pwned" }),
    /unauthorized characters/,
  );
});

test("rejects promotion when the required pentest is not complete", () => {
  assert.throws(
    () => assertSecurityRelease({ ...valid, pentest: "required-not-completed" }),
    /Promotion rejected/,
  );
});

test("rejects ambiguous statuses", () => {
  assert.throws(
    () => assertSecurityRelease({ ...valid, residualRisks: "unknown" }),
    /none or documented/,
  );
  assert.throws(() => assertSecurityRelease({ ...valid, pentest: "planned" }), /not-required/);
});

test("the deployment and workflow require the current version and three attestations", () => {
  const workflow = readFileSync(
    new URL("../.github/workflows/promote-production.yml", import.meta.url),
    "utf8",
  );
  const deploy = readFileSync(new URL("../deploy.sh", import.meta.url), "utf8");
  const checklist = readFileSync(
    new URL("../docs/security-release-checklist.md", import.meta.url),
    "utf8",
  );

  for (const source of [workflow, deploy, checklist]) {
    assert.match(
      source,
      new RegExp(`version[^\\n]*${SECURITY_CHECKLIST_VERSION.replace(".", "\\.")}`, "i"),
    );
    assert.match(source, /security_review_ref|SECURITY_REVIEW_REF/);
    assert.match(source, /residual_risks|RESIDUAL_RISKS/);
    assert.match(source, /pentest_status|PENTEST_STATUS/);
  }
  assert.match(workflow, /required-not-completed\).*exit 1/);

  const authenticatedRemote = workflow.indexOf(
    'git remote set-url origin "https://x-access-token:$GH_TOKEN@github.com/$GITHUB_REPOSITORY.git"',
  );
  const protectedFetch = workflow.indexOf("git fetch origin main production");
  assert.ok(
    authenticatedRemote !== -1 && authenticatedRemote < protectedFetch,
    "the protected promotion authenticates before fetching private refs",
  );

  const preparation = deploy.indexOf('npm run release:prepare -- "$TARGET_VERSION"');
  const securityGate = deploy.indexOf("node scripts/release-security-policy.mjs");
  const push = deploy.indexOf("git push origin main");
  assert.ok(preparation !== -1 && preparation < securityGate, "the review covers the prepared commit");
  assert.ok(securityGate < push, "the review blocks before pushing the candidate");
});
