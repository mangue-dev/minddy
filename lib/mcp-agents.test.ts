import { describe, expect, it } from "vitest";

import {
  MCP_AGENTS,
  MCP_SERVER_NAME,
  getMcpAgent,
  isMcpAgentId,
  mapClientNameToAgent,
  mcpActorLabel,
} from "./mcp-agents";

describe("MCP agent registry", () => {
  it("registers OpenCode as a paste-in config agent", () => {
    expect(isMcpAgentId("opencode")).toBe(true);
    const agent = getMcpAgent("opencode");
    expect(agent.label).toBe("OpenCode");
    expect(agent.kind).toBe("config");
    expect(agent.hint).toBe("mcpHintOpencode");
  });

  it("builds a standalone-valid opencode.json block for the minddy server", () => {
    const agent = getMcpAgent("opencode");
    const artifact = agent.build("https://minddy.app/api/mcp");
    const parsed = JSON.parse(artifact) as {
      $schema?: string;
      mcp?: Record<string, { type?: string; url?: string; enabled?: boolean }>;
    };
    expect(parsed.$schema).toBe("https://opencode.ai/config.json");
    expect(parsed.mcp?.[MCP_SERVER_NAME]).toEqual({
      type: "remote",
      url: "https://minddy.app/api/mcp",
      enabled: true,
    });
    // Exactly one server, keyed by the canonical server name.
    expect(Object.keys(parsed.mcp ?? {})).toEqual([MCP_SERVER_NAME]);
  });

  it("keeps every registered agent hint and id in sync with the picker grid", () => {
    const ids = MCP_AGENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const agent of MCP_AGENTS) {
      expect(isMcpAgentId(agent.id)).toBe(true);
      expect(getMcpAgent(agent.id).label).toBe(agent.label);
    }
  });
});

describe("OAuth client_name attribution", () => {
  it("maps opencode's DCR client_name to the opencode agent", () => {
    expect(mapClientNameToAgent("OpenCode")).toBe("opencode");
    expect(mapClientNameToAgent("opencode (somewhere)")).toBe("opencode");
  });

  it("keeps the openai family mapped to Codex, even spelled around opencode", () => {
    expect(mapClientNameToAgent("OpenAI Codex")).toBe("codex");
    expect(mapClientNameToAgent("ChatGPT")).toBe("codex");
  });

  it("falls back to null for unknown clients", () => {
    expect(mapClientNameToAgent("MCP Inspector")).toBeNull();
    expect(mapClientNameToAgent("")).toBeNull();
  });

  it("prefers the canonical agent label over the raw key name in timelines", () => {
    expect(mcpActorLabel("opencode", "OpenCode (acme/repo)", "Someone")).toBe(
      "OpenCode"
    );
    expect(mcpActorLabel(null, "some key (proj)", "Someone")).toBe("some key");
  });
});
