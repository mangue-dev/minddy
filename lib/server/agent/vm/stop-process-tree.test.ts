import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { describe, expect, it, vi } from "vitest";

import { processBirthMarker } from "./child-registry";
import { stopProcessTree } from "./stop-process-tree";

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, execFileSync: vi.fn(actual.execFileSync) };
});

describe("OpenCode process cleanup", () => {
  it.each([
    { failure: "missing ps", error: { code: "ENOENT" }, ignoreTerm: false },
    { failure: "nonzero ps exit", error: { status: 1 }, ignoreTerm: false },
    { failure: "ps timeout", error: { code: "ETIMEDOUT" }, ignoreTerm: true },
  ])("terminates the server despite $failure", async ({ error, ignoreTerm }) => {
    const server = spawn(process.execPath, ["-e", `
      ${ignoreTerm ? 'process.on("SIGTERM", () => {});' : ""}
      console.log("ready");
      setInterval(() => {}, 1000);
    `], { stdio: ["ignore", "pipe", "pipe"] });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await once(server.stdout!, "data");
      const failure = Object.assign(new Error("process enumeration failed"), error);
      vi.mocked(execFileSync).mockImplementationOnce(() => { throw failure; });

      await expect(stopProcessTree(server)).resolves.toBeUndefined();
      expect(server.signalCode).toBe(ignoreTerm ? "SIGKILL" : "SIGTERM");
      expect(warning).toHaveBeenCalledWith(
        "[opencode] Could not enumerate descendants; stopping the server only:",
        failure,
      );
      await expect(stopProcessTree(server)).resolves.toBeUndefined();
    } finally {
      warning.mockRestore();
      vi.mocked(execFileSync).mockReset();
      server.kill("SIGKILL");
    }
  });

  it("kills a detached tool that ignores SIGTERM after its server exits", async () => {
    const toolScript = 'process.on("SIGTERM", () => {}); console.log(process.pid); setInterval(() => {}, 1000)';
    const server = spawn(process.execPath, ["-e", `
      const { spawn } = require("node:child_process");
      spawn(process.execPath, ["-e", ${JSON.stringify(toolScript)}], {
        detached: true, stdio: ["ignore", "inherit", "inherit"]
      });
      setInterval(() => {}, 1000);
    `], { stdio: ["ignore", "pipe", "pipe"] });
    let toolPid: number | undefined;
    let birth: string | null = null;
    try {
      const [output] = await once(server.stdout!, "data");
      toolPid = Number(String(output).trim());
      expect(toolPid).toBeGreaterThan(1);
      birth = processBirthMarker(toolPid);
      expect(birth).not.toBeNull();
      await stopProcessTree(server);
      expect(server.signalCode).not.toBeNull();
      await expect.poll(() => {
        if (processBirthMarker(toolPid!) !== birth) return true;
        // A container's PID 1 may reap an orphan later. A zombie has stopped
        // executing and must not make this termination test fail on Linux.
        return execFileSync("ps", ["-o", "stat=", "-p", String(toolPid)], {
          encoding: "utf8",
        }).trim().startsWith("Z");
      }, { timeout: 2_000 }).toBe(true);
      // Final cleanup can run again without signaling a recycled PID.
      await stopProcessTree(server);
    } finally {
      if (toolPid && birth && processBirthMarker(toolPid) === birth) {
        process.kill(toolPid, "SIGKILL");
      }
      server.kill("SIGKILL");
    }
  });
});
