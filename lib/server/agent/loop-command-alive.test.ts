import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  command: null as null | {
    exitCode: number | null;
    wait: (p?: { signal?: AbortSignal }) => Promise<unknown>;
  },
  status: "running",
  get: vi.fn(),
  getCommand: vi.fn(),
  runCommand: vi.fn(),
  // These SDK methods auto-resume; watchdogs must use the session instead.
  autoResumeGetCommand: vi.fn(),
  autoResumeRunCommand: vi.fn(),
}));

vi.mock("@vercel/sandbox", () => ({ Sandbox: { get: h.get } }));
const { isLoopCommandAlive } = await import("./sandbox");

const pendingUntilAbort = (p?: { signal?: AbortSignal }) =>
  new Promise<never>((_, reject) => {
    p?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  });

beforeEach(() => {
  vi.stubEnv("AGENT_EXECUTION_BACKEND", "vercel");
  vi.stubEnv("VERCEL", "1");
  vi.clearAllMocks();
  h.status = "running";
  h.command = { exitCode: null, wait: vi.fn(pendingUntilAbort) };
  h.get.mockImplementation(async () => ({
    status: h.status,
    getCommand: h.autoResumeGetCommand,
    runCommand: h.autoResumeRunCommand,
    currentSession: () => ({ getCommand: h.getCommand, runCommand: h.runCommand }),
  }));
  h.getCommand.mockImplementation(async () => h.command);
  h.runCommand.mockResolvedValue({ exitCode: 0 });
});
afterEach(() => {
  expect(h.autoResumeGetCommand).not.toHaveBeenCalled();
  expect(h.autoResumeRunCommand).not.toHaveBeenCalled();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("isLoopCommandAlive", () => {
  it("reconciles the missing exit code of a finished detached command", async () => {
    h.command!.wait = vi.fn(async () => ({ exitCode: 137 }));
    expect(await isLoopCommandAlive("agent-x", "cmd-1")).toBe(false);
    expect(h.command!.wait).toHaveBeenCalledOnce();
    expect(h.runCommand).not.toHaveBeenCalled();
  });

  it("uses an already reconciled exit code without waiting", async () => {
    h.command!.exitCode = 0;
    expect(await isLoopCommandAlive("agent-x", "cmd-1")).toBe(false);
    expect(h.command!.wait).not.toHaveBeenCalled();
  });

  it("confirms responsiveness before treating a timed-out wait as alive", async () => {
    vi.useFakeTimers();
    const verdict = isLoopCommandAlive("agent-x", "cmd-1");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await verdict).toBe(true);
    expect(h.get).toHaveBeenCalledWith(expect.objectContaining({ resume: false, signal: expect.any(AbortSignal) }));
    expect(h.runCommand).toHaveBeenCalledWith(expect.objectContaining({
      cmd: "/bin/true", cwd: "/tmp", timeoutMs: 1_000, signal: expect.any(AbortSignal),
    }));
  });

  it("does not call an unresponsive VM alive just because wait timed out", async () => {
    vi.useFakeTimers();
    h.runCommand.mockRejectedValue(new Error("sandbox unresponsive"));
    const verdict = isLoopCommandAlive("agent-x", "cmd-1");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await verdict).toBe(null);
  });

  it("requires a successful responsiveness command", async () => {
    vi.useFakeTimers();
    h.runCommand.mockResolvedValue({ exitCode: 1 });
    const verdict = isLoopCommandAlive("agent-x", "cmd-1");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await verdict).toBe(null);
  });

  it.each(["stopped", "failed", "aborted"])("recognizes a %s session without fetching its command or resuming it", async (status) => {
    h.status = status;
    expect(await isLoopCommandAlive("agent-x", "cmd-1")).toBe(false);
    expect(h.getCommand).not.toHaveBeenCalled();
    expect(h.runCommand).not.toHaveBeenCalled();
  });

  it.each(["pending", "stopping", "snapshotting"])("leaves a %s session untouched", async (status) => {
    h.status = status;
    expect(await isLoopCommandAlive("agent-x", "cmd-1")).toBe(null);
    expect(h.getCommand).not.toHaveBeenCalled();
  });

  it("returns unknown if the session stops between metadata and the command lookup", async () => {
    h.getCommand.mockRejectedValue(new Error("session stopped"));
    expect(await isLoopCommandAlive("agent-x", "cmd-1")).toBe(null);
  });

  it("returns unknown on an upstream wait error", async () => {
    h.command!.wait = vi.fn(async () => { throw new Error("upstream 503"); });
    expect(await isLoopCommandAlive("agent-x", "cmd-1")).toBe(null);
  });

  it("returns unknown when the sandbox or command is missing", async () => {
    h.get.mockRejectedValueOnce(new Error("sandbox not found"));
    expect(await isLoopCommandAlive("agent-x", "cmd-1")).toBe(null);
    h.command = null;
    expect(await isLoopCommandAlive("agent-x", "cmd-1")).toBe(null);
  });

  it.each(["metadata", "command", "responsiveness"])("bounds a hung %s request", async (stage) => {
    // AbortSignal.timeout uses native timers; keep this test short while
    // exercising the supplied signal rather than merely checking its presence.
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 10);
      return controller.signal;
    });
    vi.useFakeTimers();
    if (stage === "metadata") h.get.mockImplementation(pendingUntilAbort);
    if (stage === "command") h.getCommand.mockImplementation((_id, opts) => pendingUntilAbort(opts));
    if (stage === "responsiveness") h.runCommand.mockImplementation(pendingUntilAbort);
    try {
      const verdict = isLoopCommandAlive("agent-x", "cmd-1");
      await vi.advanceTimersByTimeAsync(5_020);
      expect(await verdict).toBe(null);
    } finally {
      timeout.mockRestore();
    }
  });
});
