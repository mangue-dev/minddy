import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { prepareFreshSandbox } from "./vm-launch";
import type { AgentSandbox } from "./sandbox";

vi.mock("./harness-bundle", () => ({ harnessBundleSource: async () => "fixture bundle" }));
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
};
const sandbox = () => ({
  mkDir: vi.fn(async () => {}), writeFiles: vi.fn(async () => {}),
  runCommand: vi.fn(async () => ({ exitCode: 0 })),
});
afterEach(() => { vi.unstubAllEnvs(); });
beforeEach(() => { vi.stubEnv("AGENT_EXECUTION_BACKEND", "vercel"); });

it.each(["codex", "claude_code"] as const)("prepares %s before repository cloning finishes", async (engine) => {
  const vm = sandbox(); const clone = deferred(); const cli = deferred(); const started = deferred();
  vm.runCommand.mockImplementation(async () => {
    started.resolve(); await cli.promise; return { exitCode: 0 };
  });
  let ready = false;
  const task = prepareFreshSandbox(vm as unknown as AgentSandbox, engine, () => clone.promise)
    .then(() => { ready = true; });
  await started.promise;
  expect(ready).toBe(false);
  expect(vm.runCommand).toHaveBeenCalledWith(expect.objectContaining({
    args: ["/vercel/sandbox/harness/main.js", "--prepare-native-cli", engine],
    timeoutMs: 180_000, env: expect.objectContaining({ GOMEMLIMIT: "2048MiB" }),
  }));
  expect(vm.writeFiles.mock.calls).toHaveLength(1);
  cli.resolve(); await Promise.resolve(); expect(ready).toBe(false);
  clone.resolve(); await task; expect(ready).toBe(true);
});

it("joins CLI preparation before propagating a clone failure to allocation cleanup", async () => {
  const vm = sandbox(); const cli = deferred(); const started = deferred();
  vm.runCommand.mockImplementation(async () => {
    started.resolve(); await cli.promise; return { exitCode: 0 };
  });
  let settled = false;
  const task = prepareFreshSandbox(vm as unknown as AgentSandbox, "codex", async () => {
    throw new Error("clone failed");
  }).catch((error) => { settled = true; return error; });
  await started.promise; expect(settled).toBe(false);
  cli.resolve(); expect(await task).toMatchObject({ message: "clone failed" });
});

it("joins cloning before surfacing a CLI installation failure", async () => {
  const vm = sandbox(); const clone = deferred(); const started = deferred();
  vm.runCommand.mockImplementation(async () => { started.resolve(); return { exitCode: 1 }; });
  let settled = false;
  const task = prepareFreshSandbox(vm as unknown as AgentSandbox, "codex", () => clone.promise)
    .catch((error) => { settled = true; return error; });
  await started.promise; await Promise.resolve(); expect(settled).toBe(false);
  clone.resolve(); expect(await task).toMatchObject({ message: "Native CLI bootstrap failed" });
});

it("keeps OpenCode repository preparation free of native installation", async () => {
  const vm = sandbox(); const clone = vi.fn(async () => {});
  await prepareFreshSandbox(vm as unknown as AgentSandbox, null, clone);
  expect(clone).toHaveBeenCalledOnce(); expect(vm.runCommand).not.toHaveBeenCalled();
  expect(vm.writeFiles).not.toHaveBeenCalled();
});
