import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "components/mcp-agent-logo.tsx"),
  "utf8",
);

describe("MCP agent logo", () => {
  it("renders distinct packaged marks for Claude Code and Codex", () => {
    expect(source).toContain("claude: ClaudeCode.Color");
    expect(source).toContain("codex: Codex");
  });

  it("keeps a generic fallback for unknown clients", () => {
    expect(source).toContain("if (Logo)");
    expect(source).toContain("<Bot");
  });

  it("uses the Gemini brand instead of the CLI terminal mark", () => {
    expect(source).toContain("gemini: Gemini.Color");
    expect(source).not.toContain("GeminiCLI");
  });

  it("uses the official stable VS Code artwork", () => {
    expect(source).toContain('agent === "vscode"');
    expect(source).toContain('VSCODE_LOGO = "/agents/vscode.svg"');
    expect(source).not.toContain("<Braces");
  });
});
