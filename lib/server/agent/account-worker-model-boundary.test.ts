import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("account worker model boundary", () => {
  it("funnels chat, routine, automation, and PR workers through the shared launcher", () => {
    const launch = source("lib/server/agent/launch.ts");
    expect(launch).toContain("const resolved = await resolveAgentModel(input.userId);");
    expect(launch).toContain("const reasoningLevel = await resolveReasoningLevel(input.userId);");

    for (const file of [
      "lib/server/assistant/execute-tool.ts",
      "app/api/cron/routines/route.ts",
      "lib/server/automations/actions.ts",
      "lib/server/agent/pr-actions.ts",
    ]) {
      expect(source(file), file).toContain("launchAgentRun({");
    }
  });

  it("rejects forged worker overrides at public and internal boundaries", () => {
    for (const file of [
      "lib/server/agent/launch.ts",
      "lib/server/assistant/execute-tool.ts",
      "lib/server/agent/issue-tools.ts",
      "app/api/agent-runs/route.ts",
      "app/api/issues/[id]/agent/route.ts",
      "app/api/pull-requests/[prId]/route.ts",
      "app/api/routines/route.ts",
      "app/api/routines/[id]/route.ts",
    ]) {
      expect(source(file), file).toContain("workerConfigurationManagedInSettings");
    }

    const settings = source("lib/server/account-settings.ts");
    expect(settings).toContain('"default_model" in input || "default_reasoning_level" in input');
  });

  it("retires per-trigger choices without rewriting frozen runs", () => {
    const migration = source(
      "supabase/migrations/20270106700000_account_worker_model_source.sql",
    );
    expect(migration).toContain("add column if not exists default_model_provider text");
    expect(migration).toContain("add column if not exists worker_model_source text");
    expect(migration).toContain("add column if not exists worker_model_provider text");
    expect(migration).toContain("drop column if exists pr_review_model");
    expect(migration).toContain("drop column if exists model");
    expect(migration).toContain("drop column if exists reasoning_level");
    expect(migration).toContain("- 'automation_models'");
    expect(migration).not.toMatch(/update\s+public\.agent_runs/i);
  });

  it("persists the account source through managed budget reservations", () => {
    const migration = source(
      "supabase/migrations/20270106700000_account_worker_model_source.sql",
    );
    expect(migration).toContain(
      "p_values->>'worker_model_source' is distinct from 'account'",
    );
    expect(migration).toMatch(
      /reasoning_level, key_mode, worker_model_source, worker_model_provider/,
    );
    expect(migration).toMatch(
      /p_values->>'reasoning_level',[\s\S]*p_values->>'key_mode',[\s\S]*p_values->>'worker_model_source',[\s\S]*p_values->>'worker_model_provider'/,
    );
  });

  it("keeps legacy review capabilities and directs PR launch errors to settings", () => {
    const compatibilityRoute = source("app/api/agent/review-models/route.ts");
    expect(compatibilityRoute).toContain("cloudExecutionConfigured:");
    expect(compatibilityRoute).toContain("executionBackend:");

    const pullRequestDetail = source("components/pull-requests/pr-detail.tsx");
    expect(pullRequestDetail).toContain("const agentErrorMessage = useAgentErrorMessage();");
    expect(pullRequestDetail.match(/toast\.error\(agentErrorMessage\(err\)\);/g)).toHaveLength(
      2,
    );
  });
});
