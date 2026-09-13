import {
  parseFilesChangedPayload,
  type AgentRunEvent,
  type AgentRunStatus,
} from "./agent-api";

export function isDelegatedWorkToolCall(item: { name: string }): boolean {
  return item.name === "launch_code_agent";
}

export type DelegatedWorkState =
  | "starting"
  | "queued"
  | "running"
  | "waiting_input"
  | "completed"
  | "failed"
  | "canceled";

const PROGRESS_EVENTS = new Set<AgentRunEvent["type"]>([
  "tool_result",
  "commit",
  "pr_opened",
  "plan_update",
  "files_changed",
  "question",
  "summary",
  "error",
]);

export function delegatedWorkState(
  call: { status: "running" | "complete"; success?: boolean },
  run: { status: AgentRunStatus; awaiting_input: boolean } | null,
): DelegatedWorkState {
  if (call.status === "complete" && call.success === false) return "failed";
  if (!run) return call.status === "running" ? "starting" : "queued";
  if (run.awaiting_input) return "waiting_input";
  return run.status;
}

export function delegatedWorkProgress(events: AgentRunEvent[]): {
  activityCount: number;
  changedFileCount: number;
} {
  const paths = new Set<string>();
  let activityCount = 0;
  for (const event of events) {
    if (PROGRESS_EVENTS.has(event.type)) activityCount++;
    if (event.type !== "files_changed") continue;
    for (const file of parseFilesChangedPayload(event.payload).files) {
      paths.add(file.path);
    }
  }
  return { activityCount, changedFileCount: paths.size };
}

/** Active worker questions are rendered by Numo in the parent conversation. */
export function delegatedWorkHiddenQuestion(
  events: AgentRunEvent[],
  waiting: boolean,
): string | null {
  if (!waiting) return null;
  const ordered = [...events].sort((a, b) => b.seq - a.seq);
  for (const event of ordered) {
    if (event.type === "user_message" || event.type === "summary") return null;
    if (event.type === "question") return event.id;
  }
  return null;
}
