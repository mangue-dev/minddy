import { describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { EncryptedStore } from "@/lib/server/encryption/store";

const bytes = randomBytes(32);
const store = new EncryptedStore({
  current: async () => ({ version: 2, bytes: Buffer.from(bytes) }),
  byVersion: async (_scope, version) => ({ version,
    bytes: Buffer.from(bytes) }),
});
vi.mock("@/lib/server/encryption/registry", () => ({
  getEncryptedStore: () => store,
}));

const { prepareDecisionEvaluation, decodeDecisionEvaluation } =
  await import("./evaluation-content");

describe("shadow decision evaluation content", () => {
  it("seals both answer maps and the subject while retaining weekly counters", async () => {
    const row = { use_case: "smart_fill", subject_id: "private-issue-id",
      jev_answers: { priority: { value: "secret" } },
      llm_answers: { priority: { value: "secret" } },
      jev_confidence: 0.9, llm_confidence: null, agree: true,
      jev_latency_ms: 100, llm_latency_ms: 200, llm_cost: 0.002 };
    const sealed = await prepareDecisionEvaluation(row, true);
    expect(sealed).toMatchObject({ subject_id: null, jev_answers: null,
      llm_answers: null, replay_succeeded: true, agree: true,
      encryption_version: 2 });
    expect(JSON.stringify(sealed)).not.toContain("private-issue-id");
    expect(JSON.stringify(sealed)).not.toContain("secret");
    expect(await decodeDecisionEvaluation(sealed as never)).toMatchObject(row);
    expect(await prepareDecisionEvaluation(row, false)).toBe(row);
  });
});
