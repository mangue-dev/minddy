import { isLiveAgentEngine } from "@/lib/agent-engines";
import { agentHarnessCapabilities, describeAgentHarnessCapabilities } from "@/lib/agent-harness-capabilities";

/** Describe the frozen worker, never the account's potentially changed selection. */
export function workerHarnessContext(run: { agent_engine?: unknown; model?: string | null; native_reasoning_effort?: string | null }) {
  if (!isLiveAgentEngine(run.agent_engine)) {
    return {
      engine: run.agent_engine === "loop" ? "loop" : null,
      engine_name: run.agent_engine === "loop" ? "Legacy Minddy worker" : null,
      harness_capabilities: null,
      harness_description: "This worker's harness is unavailable. Do not infer support for tools, images or subagents.",
    };
  }
  return {
    engine: run.agent_engine,
    model: run.model ?? null,
    native_reasoning_effort: run.native_reasoning_effort ?? null,
    engine_name: run.agent_engine === "codex" ? "Codex" : run.agent_engine === "claude_code" ? "Claude Code" : "OpenCode",
    harness_capabilities: agentHarnessCapabilities(run.agent_engine),
    harness_description: describeAgentHarnessCapabilities(run.agent_engine),
  };
}
