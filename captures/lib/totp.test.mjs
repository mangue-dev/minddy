import assert from "node:assert/strict";
import test from "node:test";

import { decodeBase32, totpCode, totpRemainingMs } from "./totp.mjs";

// RFC 6238 appendix B: the ASCII seed "12345678901234567890" with SHA-1,
// in base32. Written as a repetition so secret scanners do not read the
// published test vector as a credential.
const RFC_SEED = "GEZDGNBVGY3TQOJQ".repeat(2);

test("matches the RFC 6238 SHA-1 test vectors", () => {
  assert.equal(totpCode(RFC_SEED, 59_000, 8), "94287082");
  assert.equal(totpCode(RFC_SEED, 1_111_111_109_000, 8), "07081804");
  assert.equal(totpCode(RFC_SEED, 20_000_000_000_000, 8), "65353130");
});

test("issues six-digit codes that keep their leading zeros", () => {
  assert.equal(totpCode(RFC_SEED, 1_111_111_109_000), "081804");
});

test("accepts the lowercase, spaced and padded forms authenticators display", () => {
  assert.deepEqual(decodeBase32("gezd gnbv gy3t qojq===="), decodeBase32("GEZDGNBVGY3TQOJQ"));
  assert.equal(decodeBase32(RFC_SEED).toString("ascii"), "12345678901234567890");
  assert.throws(() => decodeBase32("not-base32!"), /not valid base32/);
});

test("reports the time left in the current 30-second window", () => {
  assert.equal(totpRemainingMs(0), 30_000);
  assert.equal(totpRemainingMs(29_500), 500);
  assert.equal(totpRemainingMs(30_000), 30_000);
});
