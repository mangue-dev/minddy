import {
  resolveAgentExecutionBackend,
  type AgentExecutionBackend,
  type CapabilityEnvironment,
} from "@/lib/capabilities";

export type AgentExecutionTarget = "desktop" | AgentExecutionBackend;

/**
 * Resolves where one agent run executes. The run's feature source is absent on
 * purpose: an interactive Numo session and a routine use the same server
 * sandbox backend. Only an explicit desktop-local run bypasses it.
 */
export function resolveAgentExecutionTarget(
  run: { localExec: boolean },
  env: CapabilityEnvironment,
): AgentExecutionTarget {
  return run.localExec ? "desktop" : resolveAgentExecutionBackend(env);
}
