import { describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "@/lib/server/encryption/store";

const key = Buffer.alloc(32, 31);
const store = new EncryptedStore({
  current: async () => ({ version: 1, bytes: Buffer.from(key) }),
  byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(key) }),
});
vi.mock("@/lib/server/encryption/registry", () => ({ getEncryptedStore: () => store }));
vi.mock("@/lib/server/encryption/audit", () => ({ auditDecryption: vi.fn() }));

const { decodeRunSummary, decodeTurnSummaryValue, encodeRunSummary,
  encodeTurnSummary } = await import("./run-summary-content");

describe("agent summary storage", () => {
  it("protects run outcomes and errors with distinct authenticated bindings", async () => {
    const outcome = await encodeRunSummary("project-1", "run-1", "outcome",
      "Private run outcome");
    const error = await encodeRunSummary("project-1", "run-1", "error_message",
      "Private run error");
    expect(JSON.stringify({ outcome, error })).not.toContain("Private run");
    expect(await decodeRunSummary({ id: "run-1", project_id: "project-1",
      outcome, error_message: error })).toMatchObject({
      outcome: "Private run outcome", error_message: "Private run error",
    });
    await expect(decodeRunSummary({ id: "run-2", project_id: "project-1",
      outcome, error_message: error })).rejects.toThrow();
    await expect(decodeRunSummary({ id: "run-1", project_id: "project-2",
      outcome, error_message: error })).rejects.toThrow();
    await expect(decodeRunSummary({ id: "run-1", project_id: "project-1",
      outcome: error, error_message: outcome })).rejects.toThrow();
  });

  it("retains archived imported turns without a run parent", async () => {
    const stored = await encodeTurnSummary("project-1", "turn-1", null,
      "outcome", "Private imported outcome");
    expect(stored).not.toContain("Private imported outcome");
    expect(await decodeTurnSummaryValue("project-1", "turn-1", null,
      "outcome", stored)).toBe("Private imported outcome");
    await expect(decodeTurnSummaryValue("project-1", "turn-2", null,
      "outcome", stored)).rejects.toThrow();
    await expect(decodeTurnSummaryValue("project-1", "turn-1", "run-1",
      "outcome", stored)).rejects.toThrow();
  });
});
