import { describe, expect, it } from "vitest";
import { AGENT_APP_LINK_MAX_LENGTH, isAgentAppLink } from "@/lib/desktop/agent-app-links";
import { AGENT_TARGET_IDS, buildAgentDeepLink } from "@/lib/prompt-delivery";

describe("isAgentAppLink", () => {
  it.each(AGENT_TARGET_IDS)("accepts the link minddy builds for %s", (target) => {
    const link = buildAgentDeepLink(target, "Implement minddy issue MIN-42.\n<request>é & + ?</request>");
    expect(isAgentAppLink(link)).toBe(true);
  });

  it.each([
    ["another route of a known app", "claude://claude.ai/new?q=hello"],
    ["a settings route", "codex://settings"],
    ["a plugin install", "codex://plugins/install/evil?marketplace=x"],
    ["an MCP install", "cursor://anysphere.cursor-deeplink/mcp/install?name=x&config=e30="],
    ["a folder to open next to the prompt", "claude://code/new?q=hello&folder=/Users/me/.ssh"],
    ["a working directory next to the prompt", "codex://new?prompt=hello&path=/tmp"],
    ["the prompt under another parameter", "claude://code/new?prompt=hello"],
    ["no prompt at all", "codex://new?prompt="],
    ["the terminal scheme", "claude-cli://open?q=hello"],
    ["an unknown scheme", "opencode://new-session?prompt=hello"],
    ["a web page", "https://claude.ai/code?prompt=hello"],
    ["a local file", "file:///etc/passwd"],
    ["script", "javascript:alert(1)"],
    ["credentials in the link", "claude://user:pass@code/new?q=hello"],
    ["a fragment", "claude://code/new?q=hello#frag"],
    ["something unreadable", "not a url"],
  ])("refuses %s", (_name, link) => {
    expect(isAgentAppLink(link)).toBe(false);
  });

  it("refuses anything that is not a string or is oversized", () => {
    expect(isAgentAppLink(undefined)).toBe(false);
    expect(isAgentAppLink({ toString: () => "codex://new?prompt=x" })).toBe(false);
    expect(isAgentAppLink(`codex://new?prompt=${"x".repeat(AGENT_APP_LINK_MAX_LENGTH)}`)).toBe(false);
  });
});
