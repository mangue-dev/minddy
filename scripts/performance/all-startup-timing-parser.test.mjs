import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { parseAllStartupTiming, verifyBoardResponse } from "./all-startup-timing-parser.mjs";

test("parses the exact fixed quoted comma and preserves repeated invocation counts", () => {
  assert.deepEqual(parseAllStartupTiming('all_total;dur=125.4, all_issues_db;dur=100.2;desc="calls:3,start:12.1", all_auth;dur=11.0;desc="calls:1,start:0.1"'), {
    totalMs: 125.4, phases: { issues_db: { durationMs: 100.2, calls: 3, firstStartOffsetMs: 12.1 }, auth: { durationMs: 11, calls: 1, firstStartOffsetMs: 0.1 } },
  });
});
test("does not require disabled cycles or assume settlement order is invocation order", () => {
  const result = parseAllStartupTiming('all_json;dur=2.0;desc="calls:1,start:100.0", all_auth;dur=10.0;desc="calls:1,start:0.0", all_total;dur=102.0');
  assert.equal(result.phases.cycles, undefined);
  assert.equal(result.phases.auth.firstStartOffsetMs, 0);
});
test("rejects unknown metrics, arbitrary descriptions, extra parameters, duplicate phases and nonfinite numeric fields", () => {
  const valid = 'all_total;dur=1.0, all_auth;dur=1.0;desc="calls:1,start:0.0"';
  for (const value of [null, "", 'all_total;dur=1.0', valid + ', private;dur=1.0', valid.replace('all_auth', 'all_cookie'),
    valid.replace('calls:1,start:0.0', 'account:private'), valid + ';private=value', valid + ', all_auth;dur=0.0;desc="calls:1,start:0.0"',
    valid + ', all_total;dur=1.0', valid.replace('calls:1', 'calls:0'), valid.replace('dur=1.0', 'dur=NaN'), valid + "x", "x".repeat(8193)]) {
    assert.throws(() => parseAllStartupTiming(value), { message: "Invalid fixed All-startup timing metadata" });
  }
});
const fingerprint = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
test("accepts every complete identity regardless of response order without exporting body data", () => {
  const issues = [{ id: "a", status: "todo", description: "fixture body" }, { id: "b", status: "triage", description: "other body" }];
  const expected = { sourceIssues: 2, cards: 1, cardIds: ["a"], contentFingerprint: fingerprint(issues) };
  const proof = verifyBoardResponse({ issues: [...issues].reverse() }, expected, fingerprint);
  assert.deepEqual(proof, { completeIssueSource: true, sourceIssues: 2, kanbanCards: 1, uniqueIssues: 2, contentFingerprint: fingerprint(issues) });
  assert.ok(!JSON.stringify(proof).includes("fixture body"));
  for (const rows of [issues.slice(0, 1), [issues[0], issues[0]], issues.map((issue) => ({ ...issue, description: "changed" }))]) {
    assert.throws(() => verifyBoardResponse({ issues: rows }, expected, fingerprint));
  }
});
