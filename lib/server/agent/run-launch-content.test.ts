import { describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "@/lib/server/encryption/store";

const key = Buffer.alloc(32, 17);
const store = new EncryptedStore({
  current: async () => ({ version: 1, bytes: Buffer.from(key) }),
  byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(key) }),
});
vi.mock("@/lib/server/encryption/registry", () => ({ getEncryptedStore: () => store }));
vi.mock("@/lib/server/encryption/audit", () => ({ auditDecryption: vi.fn() }));

const { encodeAgentLaunch, decodeAgentLaunch, hydrateAgentLaunchCopies,
  encodeImportedAgentMessage, hydrateImportedAgentMessages } =
  await import("./run-launch-content");

describe("agent launch content", () => {
  it("protects prompt and mentions in the run and its initial-message copy", async () => {
    const encrypted = await encodeAgentLaunch("project-1", "run-1", {
      prompt: "Private launch request",
      prompt_mentions: [{ type: "issue", id: "issue-1", label: "Private mention" }],
    });
    const row = { id: "run-1", project_id: "project-1", ...encrypted };
    expect(JSON.stringify(row)).not.toContain("Private launch request");
    expect(JSON.stringify(row)).not.toContain("Private mention");
    await expect(decodeAgentLaunch(row)).resolves.toMatchObject({
      prompt: "Private launch request", prompt_mentions: [{ label: "Private mention" }],
    });
    await expect(decodeAgentLaunch({ ...row, project_id: "project-2" })).rejects.toThrow();
    await expect(decodeAgentLaunch({ ...row, id: "run-2" })).rejects.toThrow();
    const client = { from: () => ({ select: () => ({ in: async () =>
      ({ data: [row], error: null }) }) }) };
    const copies = await hydrateAgentLaunchCopies(client as never, [{
      id: "message-1", run_id: "run-1", source: "agent", worker_source: "initial_prompt",
      content: encrypted.encrypted_launch_content,
    }]);
    expect(copies[0].content).toBe("Private launch request");
    await expect(hydrateAgentLaunchCopies(client as never, [{
      id: "message-1", run_id: "run-1", source: "agent", worker_source: "initial_prompt",
      content: "Private clear copy",
    }])).rejects.toThrow("mismatch");
  });

  it("keeps imported transcript messages encrypted without a source run", async () => {
    const encoded = await encodeImportedAgentMessage("project-1", "message-2",
      "Private imported message");
    expect(encoded.content).not.toContain("Private imported message");
    const client = { from: () => ({ select: () => ({ in: async () => ({
      data: [{ id: "message-2", ...encoded, conversation: { project_id: "project-1" } }],
      error: null,
    }) }) }) };
    const copies = await hydrateImportedAgentMessages(client as never, [{
      id: "message-2", run_id: null, legacy_event_id: null,
      source: "agent", content: encoded.content,
    }], null, "project-1");
    expect(copies[0].content).toBe("Private imported message");
    await expect(hydrateImportedAgentMessages(client as never, [{
      id: "message-2", run_id: null, legacy_event_id: null,
      source: "agent", content: encoded.content,
    }], null, "project-2")).rejects.toThrow("not authorized");
  });
});
