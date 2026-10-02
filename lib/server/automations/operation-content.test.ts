import { describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "@/lib/server/encryption/store";

const material = Buffer.alloc(32, 63);
vi.mock("@/lib/server/encryption/registry", () => ({
  getEncryptedStore: () => new EncryptedStore({
    current: async () => ({ version: 2, bytes: Buffer.from(material) }),
    byVersion: async (_scope: unknown, version: number) => {
      if (version !== 2) throw new Error("Unknown key version");
      return { version, bytes: Buffer.from(material) };
    },
  }),
}));

import { decodeOperationJson, decodeOperationText, encodeOperationJson,
  encodeOperationText, operationJsonState, operationTextState } from
  "./operation-content";

describe("durable Numo automation content", () => {
  it("hides prompts and outcome copies and binds project, chain, step and field", async () => {
    const project = "project-1", chain = "chain-1", step = 3;
    const prompt = await encodeOperationText(project, chain, step, "prompt",
      "Private issue title and plan");
    const context = await encodeOperationJson(project, chain, step, "context",
      { issue: { title: "Private issue title" } });
    const summary = await encodeOperationText(project, chain, step,
      "outcome_summary", "Private verdict");
    const blockers = await encodeOperationJson(project, chain, step,
      "outcome_blockers", ["Private blocker"]);
    const stored = JSON.stringify({ prompt, context, summary, blockers });
    for (const secret of ["Private issue title", "Private verdict", "Private blocker"]) {
      expect(stored).not.toContain(secret);
    }
    expect(operationTextState(prompt!)).toEqual({ version: 2, format: 3 });
    expect(operationJsonState(context)).toEqual({ version: 2, format: 3 });
    expect(await decodeOperationText(project, chain, step, "prompt", prompt))
      .toBe("Private issue title and plan");
    expect(await decodeOperationJson(project, chain, step, "context", context))
      .toEqual({ issue: { title: "Private issue title" } });
    expect(await decodeOperationText(project, chain, step, "outcome_summary", summary))
      .toBe("Private verdict");
    expect(await decodeOperationJson(project, chain, step,
      "outcome_blockers", blockers)).toEqual(["Private blocker"]);
    await expect(decodeOperationText("other", chain, step, "prompt", prompt))
      .rejects.toThrow();
    await expect(decodeOperationText(project, "other", step, "prompt", prompt))
      .rejects.toThrow();
    await expect(decodeOperationText(project, chain, step + 1, "prompt", prompt))
      .rejects.toThrow();
    await expect(decodeOperationJson(project, chain, step,
      "outcome_blockers", context)).rejects.toThrow();
  });
});
