import { describe, expect, it, vi } from "vitest";
import { EncryptedStore } from "@/lib/server/encryption/store";

const key = Buffer.alloc(32, 37);
const store = new EncryptedStore({
  current: async () => ({ version: 1, bytes: Buffer.from(key) }),
  byVersion: async (_scope, version) => ({ version, bytes: Buffer.from(key) }),
});
vi.mock("@/lib/server/encryption/registry", () => ({ getEncryptedStore: () => store }));
vi.mock("@/lib/server/encryption/audit", () => ({ auditDecryption: vi.fn() }));

const { encodeAgentInputAnswer, decodeAgentInputAnswer } =
  await import("./run-input-answer-content");
const { encodeWorkerParentMessage, decodeWorkerParentMessage,
  hydrateWorkerParentCopies } = await import("./worker-parent-content");

describe("worker answer copies", () => {
  it("binds the answer and parent content to separate row identities", async () => {
    const answer = await encodeAgentInputAnswer("project-1", "request-1", "Private answer");
    const parent = await encodeWorkerParentMessage("project-1", "message-1", {
      content: "Private parent text",
      context: { page: "Private page" },
      metadata: { attachments: [{ name: "Private file" }] },
    });
    const row = { id: "message-1", ...parent,
      context: null, metadata: { worker_input: { run_id: "run-1" } } };
    expect(JSON.stringify([answer, row])).not.toContain("Private");
    await expect(decodeAgentInputAnswer("project-1", {
      id: "request-1", ...answer })).resolves.toMatchObject({ answer: "Private answer" });
    await expect(decodeAgentInputAnswer("project-1", {
      id: "request-2", ...answer })).rejects.toThrow();
    await expect(decodeWorkerParentMessage("project-2", row)).rejects.toThrow();
    const queries = {
      assistant_messages: [row], agent_runs: [{ id: "run-1", project_id: "project-1" }],
    };
    const client = { from: (table: keyof typeof queries) => ({
      select: () => ({ in: async () => ({ data: queries[table], error: null }) }),
    }) };
    const copy = { id: "message-1", source: "assistant", content: parent.content,
      metadata: { worker_input: { run_id: "run-1" } } };
    const hydrated = await hydrateWorkerParentCopies(client as never, [copy]);
    expect(hydrated[0]).toMatchObject({ content: "Private parent text",
      context: { page: "Private page" },
      metadata: { attachments: [{ name: "Private file" }] } });
    await expect(hydrateWorkerParentCopies(client as never,
      [{ ...copy, content: "Private clear copy" }])).rejects.toThrow("not authorized");
  });
});
