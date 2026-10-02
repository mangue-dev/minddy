import { describe, expect, it } from "vitest";

import { agentSandboxStorage } from "../../../deploy/self-hosted/agent-runner-storage.mjs";

describe("self-hosted Agent storage", () => {
  it("keeps job, SQLite and WAL, tool output, logs and checkout off Docker volumes", () => {
    const hostConfig = agentSandboxStorage();
    expect(hostConfig).not.toHaveProperty("Mounts");
    expect(hostConfig.LogConfig).toEqual({ Type: "none" });
    expect(hostConfig.Tmpfs).toHaveProperty("/vercel");
    expect(hostConfig.Tmpfs).toHaveProperty("/tmp");
    expect(hostConfig.Tmpfs["/vercel"]).toContain("uid=10001");
    expect(hostConfig.Tmpfs["/vercel"]).toContain("gid=10001");
    expect(hostConfig.Tmpfs["/vercel"]).not.toContain("noexec");
  });
});
