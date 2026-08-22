import assert from "node:assert/strict";
import test from "node:test";

import {
  LINUX_SIGNING_KEY_HEADING,
  normalizeLinuxSigningFingerprint,
  withLinuxSigningKeyReleaseNotes,
} from "./linux-release-notes.mjs";

const fingerprint = "33AEB4A30A1FFA650402CDA2B7D7AC0724CA7535";

test("adds the Linux signing key to a release body", () => {
  const notes = withLinuxSigningKeyReleaseNotes("## Changes\n\n- A release", fingerprint);

  assert.equal(
    notes,
    "## Changes\n\n- A release\n\n## Linux package signing key\n\n" +
      "Linux artifacts are signed with the public key attached to this release as `minddy-linux-release-key.asc`. " +
      "Verify its fingerprint before installing a package:\n\n" +
      "`33AEB4A30A1FFA650402CDA2B7D7AC0724CA7535`\n"
  );
});

test("replaces an existing Linux signing-key section without duplicating it", () => {
  const notes = withLinuxSigningKeyReleaseNotes(
    "## Changes\n\n- A release\n\n## Linux package signing key\n\n`OLD`\n\n## Checks\n\n- Done\n",
    fingerprint
  );

  assert.equal((notes.match(new RegExp(LINUX_SIGNING_KEY_HEADING, "g")) ?? []).length, 1);
  assert.match(notes, /## Changes[\s\S]*## Checks[\s\S]*## Linux package signing key/);
  assert.match(notes, new RegExp(fingerprint));
});

test("rejects a fingerprint that cannot identify a GPG signing key", () => {
  assert.equal(normalizeLinuxSigningFingerprint(fingerprint.toLowerCase()), fingerprint);
  assert.throws(() => normalizeLinuxSigningFingerprint("not-a-fingerprint"), /40- or 64-character/);
});
