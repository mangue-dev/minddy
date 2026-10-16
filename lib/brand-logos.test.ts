import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Only the mangue-ui barrel is stubbed. The brand marks are real: importing a
// variant module must not reach the @lobehub/icons barrel or a brand index,
// whose Avatar variant loads @lobehub/ui and the emoji-mart catalog.
vi.mock("mangue-ui", () => ({
  cn: (...parts: unknown[]) => parts.filter(Boolean).join(" "),
}));

import { ProviderLogo } from "@/components/model-logo";
import { McpAgentLogo } from "@/components/mcp-agent-logo";

/** Provider slug → the brand title its mark renders (as spelled by the package). */
const PROVIDER_TITLES: Record<string, string> = {
  ai21: "AI21",
  "aion-labs": "AionLabs",
  anthropic: "Claude",
  "arcee-ai": "Arcee",
  bedrock: "Bedrock",
  "bytedance-seed": "ByteDance",
  cohere: "Cohere",
  deepseek: "DeepSeek",
  gemini: "Gemini",
  google: "Gemini",
  "ibm-granite": "IBM",
  inception: "Inception",
  kwaipilot: "Kwaipilot",
  liquid: "Liquid",
  meituan: "LongCat",
  meta: "Meta",
  minimax: "Minimax",
  mistral: "Mistral",
  moonshot: "MoonshotAI",
  nvidia: "Nvidia",
  openai: "OpenAI",
  "opencode-go": "opencode",
  "opencode-zen": "opencode",
  openrouter: "OpenRouter",
  perplexity: "Perplexity",
  poolside: "Poolside",
  qwen: "Qwen",
  relace: "Relace",
  stepfun: "StepFun",
  tencent: "Tencent",
  upstage: "Upsate",
  xai: "Grok",
  xiaomi: "XiaomiMiMo",
  zhipu: "Zhipu",
};

const AGENT_TITLES: Record<string, string> = {
  claude: "Claude Code",
  "claude-desktop": "Claude",
  codex: "Codex",
  cursor: "Cursor",
  gemini: "Gemini",
  opencode: "opencode",
  windsurf: "Windsurf",
};

function title(markup: string): string | undefined {
  return markup.match(/<title>([^<]*)<\/title>/)?.[1];
}

describe("brand logos", () => {
  it.each(Object.entries(PROVIDER_TITLES))("renders the %s provider mark", (provider, brand) => {
    const markup = renderToStaticMarkup(createElement(ProviderLogo, { provider, size: 14 }));
    expect(markup.startsWith("<svg")).toBe(true);
    expect(title(markup)).toBe(brand);
  });

  it.each(Object.entries(AGENT_TITLES))("renders the %s agent mark", (agent, brand) => {
    const markup = renderToStaticMarkup(createElement(McpAgentLogo, { agent, size: 16 }));
    expect(markup.startsWith("<svg")).toBe(true);
    expect(title(markup)).toBe(brand);
  });

  it("keeps the generic fallback for an unknown provider", () => {
    const markup = renderToStaticMarkup(createElement(ProviderLogo, { provider: "unknown" }));
    expect(markup.startsWith("<svg")).toBe(true);
    expect(title(markup)).toBeUndefined();
  });
});
