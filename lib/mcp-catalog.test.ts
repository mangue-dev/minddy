import { describe, expect, it } from "vitest";
import { MCP_PRESETS, mcpPresetForUrl } from "./mcp-catalog";

describe("the MCP preset catalog", () => {
  it("stays a curated list with unique ids and endpoints", () => {
    expect(MCP_PRESETS.length).toBeGreaterThanOrEqual(30);
    const ids = new Set(MCP_PRESETS.map((preset) => preset.id));
    expect(ids.size).toBe(MCP_PRESETS.length);
    const endpoints = new Set(
      MCP_PRESETS.map((preset) => mcpPresetForUrl(preset.url)?.id),
    );
    expect(endpoints.size).toBe(MCP_PRESETS.length);
  });

  it("only carries public HTTPS endpoints, docs and known auth modes", () => {
    for (const preset of MCP_PRESETS) {
      expect(preset.url, preset.id).toMatch(/^https:\/\//);
      expect(preset.docs, preset.id).toMatch(/^https:\/\//);
      expect(["oauth", "bearer", "none"]).toContain(preset.auth);
      expect([
        "standard",
        "apiKey",
        "oauthApp",
        "googlePreview",
        "approvedClient",
        "slackApp",
      ]).toContain(preset.setup);
    }
  });

  it("recognizes its own endpoints regardless of slashes or query parameters", () => {
    for (const preset of MCP_PRESETS) {
      const bare = new URL(preset.url);
      expect(mcpPresetForUrl(preset.url)?.id).toBe(preset.id);
      expect(mcpPresetForUrl(`${bare.origin}${bare.pathname}/`)?.id).toBe(
        preset.id,
      );
      expect(mcpPresetForUrl(`${preset.url}?team=1`)?.id).toBe(preset.id);
    }
  });

  it("does not resolve an unrelated endpoint", () => {
    expect(mcpPresetForUrl("https://mcp.elsewhere.dev/mcp")).toBeUndefined();
    expect(mcpPresetForUrl("not a url")).toBeUndefined();
  });
});
