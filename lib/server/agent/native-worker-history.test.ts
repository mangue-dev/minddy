import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentRun } from "./runs";
const h = vi.hoisted(() => ({ get: vi.fn(), decode: vi.fn() }));
vi.mock("./runs", () => ({ getRun: h.get }));
vi.mock("./run-checkpoint-content", () => ({ decodeAgentCheckpoint: h.decode }));
const { nativeWorkerHistory } = await import("./native-worker-history");
const history = [{ role: "assistant" as const, text: "Previous implementation context" }];
const run = { id: "new", continued_from_run_id: "old", created_by: "owner", project_id: "project",
  conversation_id: "conversation", repo_link_id: "link", repo_provider: "github", repo_external_id: "repo",
  agent_engine: "codex", model: "codex/model", native_reasoning_effort: "high" } as AgentRun;
beforeEach(() => {
  vi.resetAllMocks(); h.get.mockResolvedValue({ ...run, id: "old", checkpoint: null, checkpoint_ciphertext: "encrypted" });
  h.decode.mockResolvedValue({ checkpoint: { native: { engine: "codex", history } } });
});
describe("private native continuation context", () => {
  it("decrypts only matching owner/repository/frozen-engine history for the native job", async () => {
    expect(await nativeWorkerHistory(run)).toEqual(history);
    expect(h.get).toHaveBeenCalledWith("old", { decode: false });
    expect(h.decode).toHaveBeenCalledWith(expect.objectContaining({ id: "old", checkpoint_ciphertext: "encrypted" }), "owner");
  });
  it("prefers the current checkpoint without reading the previous run again", async () => {
    expect(await nativeWorkerHistory({ ...run, checkpoint: { native: { engine: "codex", history } } } as AgentRun)).toEqual(history);
    expect(h.get).not.toHaveBeenCalled();
  });
  it.each(["created_by", "project_id", "conversation_id", "repo_link_id", "repo_provider", "repo_external_id", "agent_engine", "model", "native_reasoning_effort"])("does not decrypt a previous run with a different %s", async (field) => {
    h.get.mockResolvedValue({ ...run, id: "old", [field]: "different" });
    expect(await nativeWorkerHistory(run)).toEqual([]); expect(h.decode).not.toHaveBeenCalled();
  });
  it("does not claim portable context when it is missing or cannot be decrypted", async () => {
    h.get.mockResolvedValue(null); expect(await nativeWorkerHistory(run)).toEqual([]);
    h.get.mockResolvedValue({ ...run, id: "old" }); h.decode.mockRejectedValue(new Error("Invalid checkpoint"));
    await expect(nativeWorkerHistory(run)).rejects.toThrow("Invalid checkpoint");
  });
});
