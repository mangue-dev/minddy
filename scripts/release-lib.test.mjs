import assert from "node:assert/strict";
import test from "node:test";
import {
  assertOfficialSupabaseImages,
  assertReleaseCompatibility,
  assertVersion,
  isVersionAtLeast,
} from "./release-lib.mjs";

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
    supabase: { completeOfficial: { release: "self-hosted/v0.8.3" } },
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

test("release compatibility refuses an official Supabase release with vulnerable Storage or Realtime", () => {
  const publish = (release) => assertReleaseCompatibility(
    { schemaVersion: 1, entries: [compatibilityEntry({ supabase: { completeOfficial: { release } } })] },
    "1.2.3",
  );
  assert.doesNotThrow(() => publish("self-hosted/v0.8.3"));
  assert.doesNotThrow(() => publish("self-hosted/v0.10.0"));
  assert.throws(() => publish("self-hosted/v0.7.2"), /self-hosted\/v0\.8\.3 or later, not self-hosted\/v0\.7\.2/);
  assert.throws(() => publish("v0.8.3"), /self-hosted\/v0\.8\.3 or later/);
  assert.throws(
    () => assertReleaseCompatibility({ schemaVersion: 1, entries: [compatibilityEntry({ supabase: undefined })] }, "1.2.3"),
    /not nothing/,
  );
});

test("version floors compare numerically and reject unparseable tags", () => {
  assert.equal(isVersionAtLeast("v1.80.2", "1.80.2"), true);
  assert.equal(isVersionAtLeast("1.81.0", "1.80.2"), true);
  assert.equal(isVersionAtLeast("v1.80.10", "1.80.2"), true);
  assert.equal(isVersionAtLeast("v1.60.4", "1.80.2"), false);
  assert.equal(isVersionAtLeast("latest", "1.80.2"), false);
});

test("the pinned upstream Compose file must ship patched Realtime and Storage images", () => {
  const compose = (realtime, storage) =>
    `services:\n  realtime:\n    image: supabase/realtime:${realtime}\n  storage:\n    image: supabase/storage-api:${storage}\n`;
  assert.doesNotThrow(() => assertOfficialSupabaseImages(compose("v2.143.3", "v1.81.0")));
  assert.throws(
    () => assertOfficialSupabaseImages(compose("v2.102.3", "v1.81.0")),
    /supabase\/realtime:v2\.102\.3; 2\.137\.15 or later/,
  );
  assert.throws(
    () => assertOfficialSupabaseImages(compose("v2.143.3", "v1.60.4")),
    /supabase\/storage-api:v1\.60\.4; 1\.80\.2 or later/,
  );
  assert.throws(
    () => assertOfficialSupabaseImages("services:\n  realtime:\n    image: supabase/realtime:v2.143.3\n"),
    /does not declare supabase\/storage-api/,
  );
});
