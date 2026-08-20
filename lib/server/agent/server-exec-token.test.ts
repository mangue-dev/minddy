import { describe, expect, it } from "vitest";

import { admitServerExecCaller, signServerExecToken } from "./server-exec-token";

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const SECRET = "test-secret";
const NOW = 1_800_000_000;

describe("server execution tokens", () => {
  it("admits the server sandbox for its signed run", () => {
    const token = signServerExecToken(RUN_ID, SECRET, NOW);
    expect(admitServerExecCaller(`Bearer ${token}`, SECRET, NOW + 60)).toEqual({ ok: true, runId: RUN_ID });
  });

  it("rejects another secret and an expired token", () => {
    const token = signServerExecToken(RUN_ID, SECRET, NOW);
    expect(admitServerExecCaller(`Bearer ${token}`, "wrong", NOW + 60).ok).toBe(false);
    expect(admitServerExecCaller(`Bearer ${token}`, SECRET, NOW + 86_400).ok).toBe(false);
  });
});
