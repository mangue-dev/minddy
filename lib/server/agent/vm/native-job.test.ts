import { describe, expect, it } from "vitest";
import { cloudLayout } from "../harness-layout";
import { nativeWorkerPaths } from "@/lib/native-agent-worker";
import { parseVmJob, VM_PROTOCOL_VERSION } from "./protocol";

function nativeJob(engine: "codex" | "claude_code") {
  const layout = cloudLayout();
  const { privateRoot, profileRoot, profileExportPath } = nativeWorkerPaths(layout);
  return { protocolVersion: VM_PROTOCOL_VERSION, layout, runId: "fixture-run", repoMode: "clone",
    workBranch: "minddy/fixture", appOrigin: "https://minddy.example", committer: { name: "Fixture", email: "fixture@example.test" },
    engine, nativeAgent: { engine, privateRoot, profileRoot, profileExportPath, history: [{ role: "user", text: "Earlier request" }] } };
}

describe("native worker launch contract", () => {
  for (const engine of ["codex", "claude_code"] as const) {
    it(`${engine} accepts only the fixed private paths and portable conversation`, () => {
      expect(parseVmJob(nativeJob(engine)).nativeAgent?.engine).toBe(engine);
      for (const field of ["privateRoot", "profileRoot", "profileExportPath"] as const) {
        const job = nativeJob(engine);
        job.nativeAgent[field] = `${job.layout.repoDir}/auth.json`;
        expect(() => parseVmJob(job)).toThrow();
      }
      const injected = nativeJob(engine);
      Object.assign(injected.nativeAgent, { credentials: "submitted-private-content" });
      expect(() => parseVmJob(injected)).toThrow();
    });
    it(`${engine} rejects local, mismatched and credential-bearing memory`, () => {
      expect(() => parseVmJob({ ...nativeJob(engine), controlToken: "fixture-token" })).toThrow();
      expect(() => parseVmJob({ ...nativeJob(engine), executionEnvironment: "server" })).toThrow();
      expect(() => parseVmJob({ ...nativeJob(engine), repoMode: "current" })).toThrow();
      expect(() => parseVmJob({ ...nativeJob(engine), nativeAgent: { ...nativeJob(engine).nativeAgent, engine: "other" } })).toThrow();
      const poisoned = nativeJob(engine);
      Object.assign(poisoned.nativeAgent.history[0], { refresh_token: "private-fixture" });
      expect(() => parseVmJob(poisoned)).toThrow();
      expect(() => parseVmJob({ ...nativeJob(engine), engine: "opencode" })).toThrow();
    });
  }
});
