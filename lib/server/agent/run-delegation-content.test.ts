import { describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "@/lib/server/encryption/store";
import { parseAgentDelegationBrief } from "./agent-contract";

const key = Buffer.alloc(32, 37);
const store = new EncryptedStore({
  current: async () => ({ version: 1, bytes: Buffer.from(key) }),
  byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(key) }),
});
vi.mock("@/lib/server/encryption/registry", () => ({ getEncryptedStore: () => store }));
vi.mock("@/lib/server/encryption/audit", () => ({ auditDecryption: vi.fn() }));

const { encodeAgentDelegationInput, decodeAgentDelegationInput } =
  await import("./run-delegation-content");

describe("agent delegation input", () => {
  it("binds the brief and attachments to one run and removes their clear columns", async () => {
    const brief = parseAgentDelegationBrief({
      version: 1,
      correlation: { parentConversationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        parentTurnId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", toolCallId: "tool-1" },
      targetRepository: { projectId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        provider: "github", externalId: "123", fullName: "mangue-dev/minddy",
        defaultBranch: "main" },
      objective: "Private delegated objective", sourceReferences: [], constraints: [],
      authorizedWork: ["read_repository"], expectedOutput: ["summary"],
    });
    const attachments = [{ name: "Private file", url: "https://example.test/file" }] as never;
    const encoded = await encodeAgentDelegationInput(
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc", "run-1",
      { delegation_brief: brief, delegation_attachments: attachments });
    expect(JSON.stringify(encoded)).not.toContain("Private");
    const row = { id: "run-1", project_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      ...encoded };
    await expect(decodeAgentDelegationInput(row)).resolves.toMatchObject({
      delegation_brief: brief, delegation_attachments: attachments,
    });
    await expect(decodeAgentDelegationInput({ ...row, id: "run-2" })).rejects.toThrow();
    await expect(decodeAgentDelegationInput({ ...row, project_id: "other" })).rejects.toThrow();
  });
});
