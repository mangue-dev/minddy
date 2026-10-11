import "server-only";
import { isNativeAgentEngine } from "@/lib/agent-engines";
import type { NativeWorkerMessage } from "@/lib/native-agent-worker";
import { getRun, type AgentRun } from "./runs";
import { decodeAgentCheckpoint } from "./run-checkpoint-content";

/** Replay context privately; the visible launch prompt remains the user's new request. */
export async function nativeWorkerHistory(run: AgentRun): Promise<NativeWorkerMessage[]> {
  if (!isNativeAgentEngine(run.agent_engine)) return [];
  if (run.checkpoint?.native?.engine === run.agent_engine) return run.checkpoint.native.history;
  if (!run.continued_from_run_id || !run.created_by) return [];
  const previous = await getRun(run.continued_from_run_id, { decode: false });
  if (!previous || previous.created_by !== run.created_by || previous.project_id !== run.project_id ||
      previous.conversation_id !== run.conversation_id || previous.repo_link_id !== run.repo_link_id ||
      previous.repo_provider !== run.repo_provider || previous.repo_external_id !== run.repo_external_id ||
      previous.agent_engine !== run.agent_engine || previous.model !== run.model ||
      (previous.native_reasoning_effort ?? null) !== (run.native_reasoning_effort ?? null)) return [];
  const decoded = await decodeAgentCheckpoint(previous, run.created_by);
  return decoded.checkpoint?.native?.engine === run.agent_engine ? decoded.checkpoint.native.history : [];
}
