import { describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "@/lib/server/encryption/store";

const contentKey = Buffer.alloc(32, 41);
const indexKey = Buffer.alloc(32, 43);
const store = new EncryptedStore({
  current: async () => ({ version: 1, bytes: Buffer.from(contentKey) }),
  byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(contentKey) }),
});
vi.mock("@/lib/server/encryption/registry", () => ({
  getEncryptedStore: () => store,
  getBlindIndexKeys: () => ({ current: async () =>
    ({ version: 1, bytes: Buffer.from(indexKey) }) }),
}));
vi.mock("@/lib/server/encryption/audit", () => ({ auditDecryption: vi.fn() }));

const { decodeAgentDeploymentUrl, deploymentLookupPrefix, encodeAgentDeploymentUrl } =
  await import("./run-deployment-content");

describe("agent deployment affinity storage", () => {
  it("keeps the routing prefix stable while authenticating the run and project", async () => {
    const url = "private-preview.vercel.app";
    const encoded = await encodeAgentDeploymentUrl("project-1", "run-1", url);
    expect(encoded).toMatch(/^mdye3:[a-f0-9]{64}:1:[A-Za-z0-9_-]+$/);
    expect(encoded).not.toContain(url);
    expect(encoded.startsWith(await deploymentLookupPrefix(url))).toBe(true);
    const row = { id: "run-1", project_id: "project-1", deployment_url: encoded };
    await expect(decodeAgentDeploymentUrl(row)).resolves.toMatchObject({ deployment_url: url });
    await expect(decodeAgentDeploymentUrl({ ...row, id: "run-2" })).rejects.toThrow();
    await expect(decodeAgentDeploymentUrl({ ...row, project_id: "project-2" }))
      .rejects.toThrow();
    await expect(decodeAgentDeploymentUrl({ ...row,
      deployment_url: encoded.replace(/^mdye3:[a-f0-9]{64}/, `mdye3:${"0".repeat(64)}`) }))
      .rejects.toThrow();
  });
});
