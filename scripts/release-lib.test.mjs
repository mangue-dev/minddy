import assert from "node:assert/strict";
import test from "node:test";
import { assertReleaseCompatibility, assertVersion } from "./release-lib.mjs";

test("assertVersion accepts SemVer and rejects ambiguous versions", () => {
  assert.equal(assertVersion("1.2.3"), "1.2.3");
  assert.equal(assertVersion("1.2.3-rc.1"), "1.2.3-rc.1");
  assert.throws(() => assertVersion("v1.2.3"), /invalid SemVer/);
  assert.throws(() => assertVersion("1.2"), /invalid SemVer/);
  assert.throws(() => assertVersion("1.2.3.4"), /invalid SemVer/);
});

function compatibilityEntry(overrides = {}) {
  return {
    minddyRelease: "1.2.3",
    tag: "v1.2.3",
    supportedTopologies: ["simple-managed-supabase", "complete-official-supabase"],
    referenceCompose: { minddyImage: "ghcr.io/mangue-dev/minddy:v1.2.3" },
    ...overrides,
  };
}

test("release compatibility requires one exact row for the version being published", () => {
  const row = compatibilityEntry();
  assert.equal(
    assertReleaseCompatibility({ schemaVersion: 1, entries: [row] }, "1.2.3"),
    row,
  );
  assert.throws(
    () => assertReleaseCompatibility({ schemaVersion: 1, entries: [] }, "1.2.3"),
    /exactly one row/,
  );
  assert.throws(
    () => assertReleaseCompatibility({ schemaVersion: 1, entries: [row, row] }, "1.2.3"),
    /exactly one row/,
  );
  assert.throws(
    () => assertReleaseCompatibility(
      { schemaVersion: 1, entries: [compatibilityEntry({ tag: "v1.2.4" })] },
      "1.2.3",
    ),
    /pair 1\.2\.3 with v1\.2\.3/,
  );
});

test("release compatibility pins the official image and both supported topologies", () => {
  assert.throws(
    () => assertReleaseCompatibility(
      {
        schemaVersion: 1,
        entries: [compatibilityEntry({
          referenceCompose: { minddyImage: "ghcr.io/mangue-dev/minddy:v1.2" },
        })],
      },
      "1.2.3",
    ),
    /ghcr\.io\/mangue-dev\/minddy:v1\.2\.3/,
  );
  assert.throws(
    () => assertReleaseCompatibility(
      {
        schemaVersion: 1,
        entries: [compatibilityEntry({ supportedTopologies: ["simple-managed-supabase"] })],
      },
      "1.2.3",
    ),
    /complete-official-supabase/,
  );
});
