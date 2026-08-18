import assert from "node:assert/strict";
import test from "node:test";
import { assertVersion, changelogSection, updateChangelog } from "./release-lib.mjs";

const changelog = `# Changelog\n\n## [Unreleased]\n\n### Added\n\n- A new feature.\n\n## [0.9.5] - 2026-08-15\n\n- Old.\n\n[Unreleased]: old\n`;

test("assertVersion accepts SemVer and rejects ambiguous versions", () => {
  assert.equal(assertVersion("1.2.3"), "1.2.3");
  assert.equal(assertVersion("1.2.3-rc.1"), "1.2.3-rc.1");
  assert.throws(() => assertVersion("v1.2.3"), /invalid SemVer/);
  assert.throws(() => assertVersion("1.2"), /invalid SemVer/);
});

test("updateChangelog turns Unreleased into a dated version", () => {
  const updated = updateChangelog(changelog, "0.10.0", "2026-08-17");
  assert.match(updated, /## \[Unreleased\]\n\n## \[0\.10\.0\] - 2026-08-17/);
  assert.equal(changelogSection(updated, "0.10.0"), "### Added\n\n- A new feature.");
  assert.match(updated, /compare\/v0\.10\.0\.\.\.HEAD/);
});

test("changelogSection requires non-empty notes", () => {
  assert.throws(() => changelogSection(changelog, "2.0.0"), /does not contain/);
});
