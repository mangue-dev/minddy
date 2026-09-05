import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { describe, expect, it } from "vitest";

import { processBirthMarker } from "./child-registry";
import { stopProcessTree } from "./stop-process-tree";

describe("OpenCode process cleanup", () => {
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
