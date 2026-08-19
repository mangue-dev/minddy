import assert from "node:assert/strict";
import test from "node:test";
import { assertVersion } from "./release-lib.mjs";

test("assertVersion accepts SemVer and rejects ambiguous versions", () => {
  assert.equal(assertVersion("1.2.3"), "1.2.3");
  assert.equal(assertVersion("1.2.3-rc.1"), "1.2.3-rc.1");
  assert.throws(() => assertVersion("v1.2.3"), /invalid SemVer/);
  assert.throws(() => assertVersion("1.2"), /invalid SemVer/);
  assert.throws(() => assertVersion("1.2.3.4"), /invalid SemVer/);
});
