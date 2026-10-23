import assert from "node:assert/strict";
import test from "node:test";

import { protectedWriteMode } from "./encrypted-content.mjs";

const DEMO = "11111111-1111-4111-8111-111111111111";
const demoProjectIds = new Set([DEMO]);

test("encrypts a demo row only with the project's existing key", () => {
  assert.equal(protectedWriteMode({ table: "objectives", projectId: DEMO, demoProjectIds, hasCurrentKey: true }), "encrypt");
  // Without a key the row stays plaintext: encrypting would create the key.
  assert.equal(protectedWriteMode({ table: "objectives", projectId: DEMO, demoProjectIds, hasCurrentKey: false }), "plaintext");
});

test("refuses rows outside the demo projects and tables without a codec", () => {
  assert.throws(
    () => protectedWriteMode({ table: "objectives", projectId: "22222222-2222-4222-8222-222222222222", demoProjectIds, hasCurrentKey: true }),
    /outside the demo projects/,
  );
  assert.throws(
    () => protectedWriteMode({ table: "objectives", projectId: undefined, demoProjectIds, hasCurrentKey: true }),
    /outside the demo projects/,
  );
  assert.throws(
    () => protectedWriteMode({ table: "issues", projectId: DEMO, demoProjectIds, hasCurrentKey: true }),
    /no content codec/,
  );
});
