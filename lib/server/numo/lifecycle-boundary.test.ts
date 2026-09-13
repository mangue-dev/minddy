import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const REPO = path.resolve(__dirname, "../../..");

function source(relativePath: string): string {
  return readFileSync(path.join(REPO, relativePath), "utf8");
}

function productionSources(root: string): Array<{ file: string; contents: string }> {
  const found: Array<{ file: string; contents: string }> = [];
  const visit = (relative: string) => {
    for (const entry of readdirSync(path.join(REPO, relative), { withFileTypes: true })) {
      const file = `${relative}/${entry.name}`;
      if (entry.isDirectory()) visit(file);
      else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts")) {
        found.push({ file, contents: source(file) });
      }
    }
  };
  visit(root);
  return found;
}

describe("unified Numo lifecycle boundary", () => {
  const production = [
    ...productionSources("app"),
    ...productionSources("components"),
    ...productionSources("lib"),
  ];

  it("launches a new code worker only from Numo's internal delegation tool", () => {
    const launchers = production
      .filter(({ contents }) => contents.includes("launchAgentRun({"))
      .map(({ file }) => file)
      .sort();

    expect(launchers).toEqual(["lib/server/assistant/execute-tool.ts"]);
  });

  it("routes every background trigger into a durable Numo intent", () => {
    const entrypoints = production
      .filter(({ contents }) => contents.includes("startNumoIntent({"))
      .map(({ file }) => file)
      .sort();

    expect(entrypoints).toEqual([
      "lib/server/agent/pr-actions.ts",
      "lib/server/assistant/comment-agent.ts",
      "lib/server/automations/actions.ts",
      "lib/server/routine-occurrences.ts",
    ]);
  });

  it("keeps voluntary product actions on the shared composer contract", () => {
    for (const file of [
      "components/feedback/feedback-setup-wizard.tsx",
      "components/global-board.tsx",
      "components/home/home-numo-composer.tsx",
      "components/integrations/create-integration-wizard.tsx",
      "components/issue-card.tsx",
      "components/issue-side-panel.tsx",
      "components/pages/page-task-surface.tsx",
      "components/pull-requests/pr-detail.tsx",
      "components/scratchpad/use-launch-agent-note.ts",
    ]) {
      expect(source(file), file).toContain("openIntent({");
    }
  });

  it("retains historical worker adapters without a launch composer", () => {
    expect(source("app/(app)/agents/page.tsx")).toContain("usesLegacyAgentSurface");
    expect(source("app/api/agent-runs/route.ts")).toContain(
      '.is("parent_numo_turn_id", null)',
    );
    expect(source("app/api/issues/[id]/agent/route.ts")).toContain(
      "parent_numo_turn_id == null",
    );
    expect(source("components/agent/agent-conversation.tsx")).toContain(
      "useAgentRunLocalDiff(",
    );
    expect(production.some(({ file }) => file.endsWith("session-compose.tsx"))).toBe(false);
    expect(production.some(({ file }) => file.endsWith("agent-compose-draft.ts"))).toBe(false);
  });
});
