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

  it("never launches a code worker (MIN-721)", () => {
    const launchers = production
      .filter(({ contents }) => contents.includes("launchAgentRun("))
      .map(({ file }) => file);

    expect(launchers).toEqual([]);
  });

  it("routes every background trigger into a durable Numo intent", () => {
    const entrypoints = production
      .filter(({ contents }) => contents.includes("startNumoIntent({"))
      .map(({ file }) => file)
      .sort();

    expect(entrypoints).toEqual([
      "lib/server/agent/pr-actions.ts",
      "lib/server/assistant/comment-agent.ts",
      "lib/server/routine-occurrences.ts",
    ]);
  });

  it("keeps voluntary product actions on the shared composer contract", () => {
    for (const file of [
      "components/global-board.tsx",
      "components/home/home-numo-composer.tsx",
      "components/pages/page-task-surface.tsx",
    ]) {
      expect(source(file), file).toContain("openIntent({");
    }
  });

});
