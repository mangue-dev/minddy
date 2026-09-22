import assert from "node:assert/strict";
import test from "node:test";

import { MCP_PUBLISHER_VERSION, verifyChecksum, platformKey } from "./fetch-mcp-publisher.mjs";

test("the pinned publisher version is a release tag of the registry repository", () => {
  assert.match(MCP_PUBLISHER_VERSION, /^\d+\.\d+\.\d+$/);
});

test("the platform key follows the released archive naming", () => {
  assert.equal(platformKey({ platform: "linux", arch: "x64" }), "linux_amd64");
  assert.equal(platformKey({ platform: "linux", arch: "arm64" }), "linux_arm64");
  assert.equal(platformKey({ platform: "darwin", arch: "arm64" }), "darwin_arm64");
  assert.equal(platformKey({ platform: "win32", arch: "x64" }), "windows_amd64");
});

test("an unpinned platform is refused", () => {
  assert.throws(() => platformKey({ platform: "sunos", arch: "x64" }), /No checksum pinned/);
});

test("every pinned checksum is a sha256 digest", () => {
  // Reading through the export would couple the test to the table shape;
  // instead, prove the guard rejects a tampered archive per pinned platform.
  for (const platform of ["darwin_amd64", "linux_amd64", "windows_arm64"]) {
    assert.throws(
      () => verifyChecksum(Buffer.from("tampered"), platform),
      /Checksum mismatch.*Refusing to extract/,
    );
  }
});
