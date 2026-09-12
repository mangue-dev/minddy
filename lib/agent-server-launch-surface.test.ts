import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const read = (relative: string) =>
  readFileSync(join(__dirname, "..", relative), "utf8");

describe("server-only Numo launch surfaces", () => {
  it("does not expose an environment selector in any worker composer", () => {
    for (const file of [
      "components/agent/agent-conversation.tsx",
      "components/agents/session-compose.tsx",
      "components/pull-requests/pr-detail.tsx",
    ]) {
      const source = read(file);
      expect(source).not.toContain("EnvironmentCombobox");
      expect(source).not.toContain("localExec:");
      expect(source).not.toContain("localWorktree:");
    }
  });

  it("keeps historical local diffs visible while disabling continuation", () => {
    const source = read("components/agent/agent-conversation.tsx");
    expect(source).toContain("useAgentRunLocalDiff(");
    expect(source).toContain("const useLocalDiff = liveRun?.local_exec === true;");
    expect(source).toContain("localExecutionRetiredTransition");
  });

  it("does not start the desktop claim loop", () => {
    const source = read("desktop/src/main.ts");
    expect(source).not.toContain("startLocalClaimLoop(");
    expect(source).not.toContain("prewarmLocalAgent(");
    expect(existsSync(join(__dirname, "../desktop/src/launcher.ts"))).toBe(false);
    expect(existsSync(join(__dirname, "../desktop/src/opencode-install.ts"))).toBe(false);
    expect(existsSync(join(__dirname, "../app/api/desktop/harness/route.ts"))).toBe(false);
  });

  it("cannot manufacture a desktop assignment inside the worker executor", () => {
    const source = read("lib/server/agent/execute.ts");
    expect(source).not.toContain("onLocalAssignment");
    expect(source).not.toContain("const localTurn =");
    expect(source).toContain("allowLocal: false");
  });

  it("cancels active local rows without erasing their historical identity", () => {
    const migration = read(
      "supabase/migrations/20270106710000_retire_desktop_local_execution.sql",
    );
    expect(migration).toContain("WHERE local_exec = true");
    expect(migration).toContain("AND status IN ('queued', 'running')");
    expect(migration).toContain("BEFORE INSERT OR UPDATE OF local_exec");
    expect(migration).not.toContain("SET local_exec = false");
    expect(migration).not.toContain("checkpoint =");
    expect(migration).not.toContain("branch_name =");
  });
});
