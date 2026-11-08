import { describe, expect, it } from "vitest";
import { LISTED_MCP_PRESETS, MCP_PRESETS, mcpPresetForUrl } from "./mcp-catalog";

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

  it("requests only the scopes Google's guide documents for its servers", () => {
    const google = MCP_PRESETS.filter((preset) => preset.setup === "googlePreview");
    expect(google.length).toBeGreaterThan(0);
    for (const preset of google) {
      expect(preset.scopes?.length, preset.id).toBeGreaterThan(0);
      for (const scope of preset.scopes ?? [])
        expect(scope, preset.id).toMatch(/^https:\/\/www\.googleapis\.com\/auth\//);
    }
    expect(mcpPresetForUrl("https://gmailmcp.googleapis.com/mcp/v1")?.scopes)
      .not.toContain("https://mail.google.com/");
  });

  it("offers no service the provider must validate first, except Vercel", () => {
    const listed = new Set(LISTED_MCP_PRESETS.map((preset) => preset.id));
    const hidden = MCP_PRESETS.filter((preset) => !listed.has(preset.id));
    expect(hidden.map((preset) => preset.id).sort()).toEqual(
      [
        "figma",
        "google-calendar",
        "google-chat",
        "google-docs",
        "google-drive",
        "google-gmail",
        "google-people",
        "google-sheets",
        "google-slides",
      ],
    );
    expect(listed.has("vercel")).toBe(true);
    for (const id of ["slack", "asana", "github", "notion"])
      expect(listed.has(id), id).toBe(true);
    // A hidden service is still recognized by URL, so existing and hand-added
    // connections keep their logo, setup note and scopes.
    for (const preset of hidden)
      expect(mcpPresetForUrl(preset.url)?.id).toBe(preset.id);
  });

  it("does not resolve an unrelated endpoint", () => {
    expect(mcpPresetForUrl("https://mcp.elsewhere.dev/mcp")).toBeUndefined();
    expect(mcpPresetForUrl("not a url")).toBeUndefined();
  });
});
