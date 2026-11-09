import { describe, expect, it } from "vitest";
import {
  buildAgentDeepLink,
  connectedAgentTargets,
  PROMPT_SEND_AGENT_META_KEY,
  PROMPT_SEND_META_KEY,
  resolvePromptDelivery,
} from "@/lib/prompt-delivery";

const sending = (agent?: string) => ({
  [PROMPT_SEND_META_KEY]: true,
  ...(agent ? { [PROMPT_SEND_AGENT_META_KEY]: agent } : {}),
});

describe("resolvePromptDelivery", () => {
  it("keeps long, copied prompts for an account without an MCP connection", () => {
    expect(resolvePromptDelivery({ meta: sending("cursor"), agents: [], mobile: false }))
      .toEqual({ short: false, target: null });
  });

  it("shortens prompts as soon as any agent is connected, known or not", () => {
    expect(resolvePromptDelivery({ meta: {}, agents: [null], mobile: false }))
      .toEqual({ short: true, target: null });
  });

  it("opens prompts in the chosen app once the account asked for it", () => {
    expect(resolvePromptDelivery({ meta: sending("codex"), agents: ["claude", "codex"], mobile: false }))
      .toEqual({ short: true, target: "codex" });
  });

  it("falls back to a connected app when the chosen one was revoked or never set", () => {
    expect(resolvePromptDelivery({ meta: sending("codex"), agents: ["cursor"], mobile: false }).target)
      .toBe("cursor");
    expect(resolvePromptDelivery({ meta: sending(), agents: ["gemini", "claude-desktop"], mobile: false }).target)
      .toBe("claude");
  });

  it("copies when no connected agent has an app to open", () => {
    expect(resolvePromptDelivery({ meta: sending(), agents: ["gemini", "opencode"], mobile: false }))
      .toEqual({ short: true, target: null });
  });

  it("copies on mobile, where the apps do not exist, and still shortens", () => {
    expect(resolvePromptDelivery({ meta: sending("claude"), agents: ["claude"], mobile: true }))
      .toEqual({ short: true, target: null });
  });

  it("ignores a preference that is not exactly on", () => {
    expect(resolvePromptDelivery({
      meta: { [PROMPT_SEND_META_KEY]: "true" }, agents: ["claude"], mobile: false,
    }).target).toBeNull();
  });
});

describe("connectedAgentTargets", () => {
  it("lists each app once, whichever Claude client is connected", () => {
    expect(connectedAgentTargets(["cursor", "claude-desktop", "claude", null, "windsurf"]))
      .toEqual(["claude", "cursor"]);
  });
});

describe("buildAgentDeepLink", () => {
  const prompt = "Implement minddy issue MIN-42.\nÉtape 1 & 2 + « fin »";

  it.each([
    ["claude", "claude://code/new?q="],
    ["codex", "codex://new?prompt="],
    ["cursor", "cursor://anysphere.cursor-deeplink/prompt?text="],
  ] as const)("opens %s with the prompt intact", (target, prefix) => {
    const link = buildAgentDeepLink(target, prompt)!;
    expect(link.startsWith(prefix)).toBe(true);
    expect(decodeURIComponent(link.slice(prefix.length))).toBe(prompt);
  });

  it("encodes spaces as %20 and never leaves a separator in the prompt", () => {
    const link = buildAgentDeepLink("cursor", "a b&c=d+e")!;
    expect(link).toContain("a%20b%26c%3Dd%2Be");
  });

  it("refuses a prompt the app would truncate", () => {
    expect(buildAgentDeepLink("claude", "x".repeat(14_000))).not.toBeNull();
    expect(buildAgentDeepLink("claude", "x".repeat(14_001))).toBeNull();
  });

  it("measures Cursor's limit on the encoded link", () => {
    expect(buildAgentDeepLink("cursor", "x".repeat(7_000))).not.toBeNull();
    expect(buildAgentDeepLink("cursor", "é".repeat(2_000))).toBeNull();
  });

  it("has nothing to open for an empty prompt", () => {
    expect(buildAgentDeepLink("codex", "")).toBeNull();
  });
});
