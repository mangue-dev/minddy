import { describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "@/lib/server/encryption/store";

const key = Buffer.alloc(32, 37);
const store = new EncryptedStore({
  current: async () => ({ version: 1, bytes: Buffer.from(key) }),
  byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(key) }),
});
vi.mock("@/lib/server/encryption/registry", () => ({ getEncryptedStore: () => store }));
vi.mock("@/lib/server/encryption/audit", () => ({ auditDecryption: vi.fn() }));

const { decodeAgentPrUrl, decodeAgentPrUrlValue, encodeAgentPrUrl,
  encodeOrphanArtifactUrl } = await import("./run-pr-url-content");

describe("agent PR URL storage", () => {
  it("binds a run URL and its SQL artifact copy to the run", async () => {
    const url = "https://example.invalid/private/repo/pull/11";
    const stored = await encodeAgentPrUrl("project-1", "run-1", url);
    expect(stored).not.toContain("private/repo");
    expect((await decodeAgentPrUrl({ id: "run-1", project_id: "project-1",
      pr_url: stored })).pr_url).toBe(url);
    expect(await decodeAgentPrUrlValue("project-1", "run-1", "artifact-1",
      stored)).toBe(url);
    await expect(decodeAgentPrUrlValue("project-1", "run-2", "artifact-1",
      stored)).rejects.toThrow();
    await expect(decodeAgentPrUrlValue("project-2", "run-1", "artifact-1",
      stored)).rejects.toThrow();
  });

  it("recovers an artifact URL after the source run is deleted", async () => {
    const url = "https://example.invalid/private/repo/pull/12";
    const stored = await encodeOrphanArtifactUrl("project-1", "artifact-1", url);
    expect(await decodeAgentPrUrlValue("project-1", null, "artifact-1",
      stored)).toBe(url);
    await expect(decodeAgentPrUrlValue("project-1", null, "artifact-2",
      stored)).rejects.toThrow();
  });
});
