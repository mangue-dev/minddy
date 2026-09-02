import { describe, expect, it } from "vitest";

import { CANONICAL_AGENT_TOOL_NAMES, agentToolsFor } from "./tools";

const anchors = ["issue", "notebook", "pr"] as const;
const triggers = ["button", "chat", "mention", "automation", "routine"] as const;
const environments = ["cloud", "worktree", "local"] as const;

describe("canonical OpenCode capability manifest", () => {
  it("keeps one effective catalog for every anchor, trigger and environment", () => {
    const canonical = [...CANONICAL_AGENT_TOOL_NAMES];
    const sources = [];

    for (const anchor of anchors) {
      for (const trigger of triggers) {
        for (const environment of environments) {
          const tools = agentToolsFor({
            anchor,
            webSearch: true,
            interactive: trigger !== "routine",
            chain: trigger === "automation",
            local: environment !== "cloud",
          })
            .map((tool) => tool.function.name)
            .sort();
          expect(tools).toEqual(canonical);
          sources.push({ source: `${anchor}/${trigger}/${environment}`, tools: tools.length });
        }
      }
    }

    expect({ catalog: canonical, sources }).toMatchSnapshot();
  });
});
