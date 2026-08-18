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

test("accepte une revue courante sans risque résiduel ni pentest requis", () => {
  assert.deepEqual(assertSecurityRelease(valid), valid);
});

test("accepte les risques consignés et un pentest terminé", () => {
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

test("refuse une ancienne checklist ou une preuve absente", () => {
  assert.throws(() => assertSecurityRelease({ ...valid, checklistVersion: "0.9" }), /version 1\.0/);
  assert.throws(() => assertSecurityRelease({ ...valid, reviewRef: " " }), /obligatoire/);
  assert.throws(
    () => assertSecurityRelease({ ...valid, reviewRef: "review;echo-pwned" }),
    /caractères non autorisés/,
  );
});

test("refuse de promouvoir quand le pentest requis n'est pas terminé", () => {
  assert.throws(
    () => assertSecurityRelease({ ...valid, pentest: "required-not-completed" }),
    /Promotion refusée/,
  );
});

test("refuse les statuts ambigus", () => {
  assert.throws(
    () => assertSecurityRelease({ ...valid, residualRisks: "unknown" }),
    /none ou documented/,
  );
  assert.throws(() => assertSecurityRelease({ ...valid, pentest: "planned" }), /not-required/);
});

test("le déploiement et le workflow exigent la version courante et les trois attestations", () => {
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

  const preparation = deploy.indexOf('npm run release:prepare -- "$TARGET_VERSION"');
  const securityGate = deploy.indexOf("node scripts/release-security-policy.mjs");
  const push = deploy.indexOf("git push origin main");
  assert.ok(preparation !== -1 && preparation < securityGate, "la revue porte sur le commit préparé");
  assert.ok(securityGate < push, "la revue bloque avant tout push du candidat");
});
