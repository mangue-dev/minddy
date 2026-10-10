/** Frozen worker harness identities, including historical runs. */
export const AGENT_ENGINES = ["loop", "opencode", "codex", "claude_code"] as const;
export type AgentEngine = (typeof AGENT_ENGINES)[number];
export const LIVE_AGENT_ENGINES = ["opencode", "codex", "claude_code"] as const satisfies readonly AgentEngine[];
export type LiveAgentEngine = (typeof LIVE_AGENT_ENGINES)[number];
/** API workers retain OpenCode unless the account deliberately selects native execution. */
export const AGENT_ENGINE: AgentEngine = "opencode";
export function isLiveAgentEngine(value: unknown): value is LiveAgentEngine {
  return typeof value === "string" && LIVE_AGENT_ENGINES.includes(value as LiveAgentEngine);
}
export function isNativeAgentEngine(value: unknown): value is "codex" | "claude_code" {
  return value === "codex" || value === "claude_code";
}
