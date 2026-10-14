import assert from "node:assert/strict";
import test from "node:test";
import { executableCacheMetadata } from "./executable-startup-readiness.mjs";

test("records absent optional persistence without inventing a sealed cache", () => {
  assert.deepEqual(executableCacheMetadata(null, "fixture"), { present: false, envelopePresent: false, state: "absent" });
  assert.equal(executableCacheMetadata("invalid", "fixture").state, "malformed-envelope");
  assert.equal(executableCacheMetadata('{"format":"plaintext"}', "fixture").present, false);
});
test("publishes only scoped envelope metadata and never its encrypted content", () => {
  const raw = JSON.stringify({ format: "minddy-local-v1", owner: "fixture", ciphertext: "private-ciphertext", secret: "private-extra" });
  const metadata = executableCacheMetadata(raw, "fixture");
  assert.equal(metadata.present, true);
  assert.equal(metadata.ownerMatches, true);
  assert.equal(metadata.state, "recognized-owner-envelope");
  assert.equal(metadata.serializedCharacters, raw.length);
  assert.ok(!JSON.stringify(metadata).includes("private"));
  const other = executableCacheMetadata(raw, "other");
  assert.equal(other.present, false);
  assert.equal(other.state, "different-owner-envelope");
});
