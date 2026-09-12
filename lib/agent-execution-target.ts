import {
  resolveAgentExecutionBackend,
  type AgentExecutionBackend,
  type CapabilityEnvironment,
} from "@/lib/capabilities";

export type AgentExecutionTarget = AgentExecutionBackend;

/**
 * Resolves where every Numo worker executes. Interactive sessions, routines,
 * automations, reviews, web clients, and desktop clients all use the server
 * sandbox backend selected by the deployment.
 */
export function resolveAgentExecutionTarget(
  env: CapabilityEnvironment,
): AgentExecutionTarget {
  return resolveAgentExecutionBackend(env);
}
