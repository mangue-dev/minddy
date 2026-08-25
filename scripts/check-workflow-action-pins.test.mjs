import assert from "node:assert/strict";
import test from "node:test";

import { findMutableActionReferences } from "./check-workflow-action-pins.mjs";

test("workflow action policy rejects mutable external references", () => {
  const findings = findMutableActionReferences(`
steps:
  - uses: actions/checkout@v5
  - uses: owner/action@main
`);

  assert.deepEqual(
    findings.map(({ line, reference }) => ({ line, reference })),
    [
      { line: 3, reference: "actions/checkout@v5" },
      { line: 4, reference: "owner/action@main" },
    ],
  );
});

test("workflow action policy accepts immutable, local, and container references", () => {
  const findings = findMutableActionReferences(`
steps:
  - uses: "actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09" # v5.1.0
  - uses: ./github/actions/local
  - uses: docker://alpine:3.22
`);

  assert.deepEqual(findings, []);
});
