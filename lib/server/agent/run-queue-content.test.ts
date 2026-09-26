import { describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "@/lib/server/encryption/store";
import type { StoredQueueMessage } from "./run-queue-content";

const key = Buffer.alloc(32, 27);
const store = new EncryptedStore({
  current: async () => ({ version: 1, bytes: Buffer.from(key) }),
  byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(key) }),
});
vi.mock("@/lib/server/encryption/registry", () => ({ getEncryptedStore: () => store }));
vi.mock("@/lib/server/encryption/audit", () => ({ auditDecryption: vi.fn() }));

const { encodeQueueMessage, decodeQueueMessage, hydrateAgentQueueCopies } =
  await import("./run-queue-content");

describe("agent queue content", () => {
  it("keeps steering text and mention labels out of the queue and SQL copy", async () => {
    const encoded = await encodeQueueMessage("project-1", "message-1", {
      content: "Private steering request",
      mentions: [{ type: "issue", id: "issue-1", label: "Private mention" }],
    });
    const source: StoredQueueMessage & { run: { project_id: string } } = {
      id: "message-1", run_id: "run-1", ...encoded,
      run: { project_id: "project-1" } };
    const copy = { id: "copy-1", run_id: "run-1", source: "agent",
      worker_source: "steering", legacy_queue_message_id: "message-1",
      content: encoded.content };
    expect(JSON.stringify([source, copy])).not.toContain("Private");
    expect((await decodeQueueMessage("project-1", source)).mentions?.[0].label)
      .toBe("Private mention");
    await expect(decodeQueueMessage("project-2", source)).rejects.toThrow();
    await expect(decodeQueueMessage("project-1", { ...source, id: "message-2" }))
      .rejects.toThrow();
    const client = { from: () => ({ select: () => ({ in: async () =>
      ({ data: [source], error: null }) }) }) };
    const hydrated = await hydrateAgentQueueCopies(client as never, [copy], null, "project-1");
    expect(hydrated[0].content).toBe("Private steering request");
    await expect(hydrateAgentQueueCopies(client as never,
      [{ ...copy, content: "Private clear copy" }], null, "project-1"))
      .rejects.toThrow("not authorized");
    await expect(hydrateAgentQueueCopies(client as never, [copy], null, "project-2"))
      .rejects.toThrow("not authorized");
  });
});
