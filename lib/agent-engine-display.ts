import type { McpAgentId } from "@/lib/mcp-agents";

/** Display frozen execution identity without inferring it from a model or account preference. */
export function agentEngineDisplay(engine: unknown): { name: string | null; logo: McpAgentId | null } {
  switch (engine) {
    case "codex": return { name: "Codex", logo: "codex" };
    case "claude_code": return { name: "Claude Code", logo: "claude" };
    case "opencode": return { name: "OpenCode", logo: "opencode" };
    default: return { name: null, logo: null };
  }
}
