import assert from "node:assert/strict";
import test from "node:test";
import { assertVersion, changelogSection, updateChangelog } from "./release-lib.mjs";

const changelog = `# Changelog\n\n## [Unreleased]\n\n### Added\n\n- Une nouveauté.\n\n## [0.9.5] - 2026-08-15\n\n- Ancien.\n\n[Unreleased]: old\n`;

test("assertVersion accepte SemVer et refuse les versions ambiguës", () => {
  assert.equal(assertVersion("1.2.3"), "1.2.3");
  assert.equal(assertVersion("1.2.3-rc.1"), "1.2.3-rc.1");
  assert.throws(() => assertVersion("v1.2.3"), /SemVer invalide/);
  assert.throws(() => assertVersion("1.2"), /SemVer invalide/);
});

test("updateChangelog transforme Unreleased en version datée", () => {
  const updated = updateChangelog(changelog, "0.10.0", "2026-08-17");
  assert.match(updated, /## \[Unreleased\]\n\n## \[0\.10\.0\] - 2026-08-17/);
  assert.equal(changelogSection(updated, "0.10.0"), "### Added\n\n- Une nouveauté.");
  assert.match(updated, /compare\/v0\.10\.0\.\.\.HEAD/);
});

test("changelogSection exige des notes non vides", () => {
  assert.throws(() => changelogSection(changelog, "2.0.0"), /ne contient pas/);
});
