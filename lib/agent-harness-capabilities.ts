import type { LiveAgentEngine } from "./agent-engines";

/** Capabilities offered by Minddy's adapters, rather than vendor marketing claims. */
export function agentHarnessCapabilities(engine: LiveAgentEngine) {
  const native = engine !== "opencode";
  return {
    engine,
    funding: native ? "subscription" as const : "api" as const,
    modelSelection: native ? "native_account_model" as const : "account_api_model" as const,
    minddyTools: true,
    repositoryTools: native ? "guarded_minddy_mcp" as const : "guarded_integrated" as const,
    questions: "numo_mediation" as const,
    nativeBuiltinTools: !native,
    subagents: !native,
    imageInput: !native,
    hostedOnly: true,
    paidExecutionValidated: engine !== "claude_code",
  };
}

export function describeAgentHarnessCapabilities(engine: LiveAgentEngine): string {
  const capabilities = agentHarnessCapabilities(engine);
  if (capabilities.funding === "api") return "The worker uses OpenCode with the account's API model and reasoning preferences.";
  return `The worker uses ${engine === "codex" ? "Codex" : "Claude Code"} with its personal subscription and the model and reasoning effort frozen at launch (or the CLI default when no override was selected). Minddy supplies guarded repository and domain tools through MCP. Native built-in tools, images and subagents are unavailable; mediate questions and unsupported operations through Numo. Hosted compute and Numo still use Minddy usage.${engine === "claude_code" ? " Paid Claude execution has not been validated in this private preview." : ""}`;
}
