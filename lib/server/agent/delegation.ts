import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  AGENT_DELEGATION_CONTRACT_VERSION,
  parseAgentDelegationBrief,
  parseAgentDelegationResult,
  type AgentDelegationArtifact,
  type AgentDelegationAuthorization,
  type AgentDelegationBrief,
  type AgentDelegationResult,
  type AgentDelegationSourceReference,
  type AgentDelegationVerification,
} from "./agent-contract";
import type { AgentRun } from "./runs";
import { parseAskUserQuestions } from "@/lib/ask-user";

const EXPECTED_DELEGATION_OUTPUT = [
  "A concise completion summary, including partial work or failure.",
  "Every changed file.",
  "Verification commands performed and their outcomes.",
  "Branch, commit and pull-request artifacts or links.",
  "Any unresolved decision or blocker that Numo must take back to the user.",
] as const;

export function buildAgentDelegationBrief(input: {
  parentConversationId: string;
  parentTurnId: string;
  toolCallId: string;
  repository: {
    projectId: string;
    provider: string;
    externalId: string;
    fullName: string;
    defaultBranch: string | null;
  };
  objective: string;
  sourceReferences: AgentDelegationSourceReference[];
  constraints: string[];
  authorizedWork: AgentDelegationAuthorization[];
  expectedOutput?: string[];
}): AgentDelegationBrief {
  return parseAgentDelegationBrief({
    version: AGENT_DELEGATION_CONTRACT_VERSION,
    correlation: {
      parentConversationId: input.parentConversationId,
      parentTurnId: input.parentTurnId,
      toolCallId: input.toolCallId,
    },
    targetRepository: input.repository,
    objective: input.objective,
    sourceReferences: input.sourceReferences,
    constraints: input.constraints,
    authorizedWork: input.authorizedWork,
    expectedOutput: input.expectedOutput?.length
      ? input.expectedOutput
      : [...EXPECTED_DELEGATION_OUTPUT],
  });
}

/** Render the durable brief as a worker instruction without replacing its harness prompt. */
export function formatAgentDelegationPrompt(
  brief: AgentDelegationBrief,
  nativeInstruction?: string | null,
): string {
  const sources = brief.sourceReferences.length
    ? brief.sourceReferences.map((source) =>
        `- [${source.kind}] ${source.label}${source.id ? ` (id: ${source.id})` : ""}${
          source.version ? ` (version: ${source.version})` : ""
        }${source.url ? ` — ${source.url}` : ""}`
      ).join("\n")
    : "- No external source was declared; use the parent objective and repository state.";
  const constraints = brief.constraints.length
    ? brief.constraints.map((constraint) => `- ${constraint}`).join("\n")
    : "- No additional constraint beyond repository instructions and platform guardrails.";
  const authorized = brief.authorizedWork.map((authorization) => `- ${authorization}`).join("\n");
  const expected = brief.expectedOutput.map((item) => `- ${item}`).join("\n");
  return `${nativeInstruction?.trim() ? `${nativeInstruction.trim()}\n\n` : ""}<numo-delegation version="1">
Objective:
${brief.objective}

Target repository:
- ${brief.targetRepository.provider}:${brief.targetRepository.fullName}
- Default branch: ${brief.targetRepository.defaultBranch ?? "unknown"}

Source references:
${sources}

Constraints:
${constraints}

Authorized work:
${authorized || "- read_repository"}

Expected handoff to Numo:
${expected}

Complete only the authorized work. In your final answer, report the expected handoff facts accurately; Numo will validate them against the durable run, repository events and artifacts before replying to the user.
</numo-delegation>`;
}

type RunEvent = {
  type: string;
  payload: Record<string, unknown> | null;
  seq: number;
};

function eventString(payload: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function collectChangedFiles(events: RunEvent[]): string[] {
  const paths = new Set<string>();
  for (const event of events) {
    if (event.type !== "files_changed" || !Array.isArray(event.payload?.files)) continue;
    for (const raw of event.payload.files) {
      if (typeof raw === "string" && raw.trim()) paths.add(raw.trim());
      else if (raw && typeof raw === "object") {
        const file = raw as Record<string, unknown>;
        const path = eventString(file, "filename", "path");
        if (path) paths.add(path);
      }
    }
  }
  return [...paths].slice(0, 500);
}

function collectVerification(events: RunEvent[]): AgentDelegationVerification[] {
  const commands = new Map<string, string>();
  const results = new Map<string, AgentDelegationVerification["status"]>();
  for (const event of events) {
    const payload = event.payload ?? {};
    const id = eventString(payload, "id");
    const name = eventString(payload, "name");
    if (!id) continue;
    if (event.type === "tool_call" && (name === "run_command" || name === "validate_changes")) {
      commands.set(id, eventString(payload, "command") ?? name);
    }
    if (event.type === "tool_result" && commands.has(id)) {
      if (typeof payload.exit_code === "number" && Number.isFinite(payload.exit_code)) {
        results.set(id, payload.exit_code === 0 ? "passed" : "failed");
      } else if (typeof payload.success === "boolean") {
        results.set(id, payload.success ? "passed" : "failed");
      }
    }
  }
  return [...commands].map(([id, command]) => ({
    command,
    status: results.get(id) ?? "unknown",
  }));
}

function collectUnresolvedDecisions(run: AgentRun, events: RunEvent[]): string[] {
  const unresolved = new Set<string>();
  for (const event of events) {
    if (event.type !== "question" && event.type !== "needs_input") continue;
    const payload = event.payload ?? {};
    const questions = parseAskUserQuestions({ questions: payload.questions });
    for (const question of questions) unresolved.add(question.question);
    const fallback = eventString(payload, "question", "message", "text");
    if (fallback) unresolved.add(fallback);
  }
  if ((run.status === "failed" || run.status === "canceled") && run.error_message?.trim()) {
    unresolved.add(run.error_message.trim());
  }
  if (run.awaiting_input && run.outcome?.trim()) unresolved.add(run.outcome.trim());
  return [...unresolved].slice(0, 50);
}

function collectInputRequest(run: AgentRun, events: RunEvent[]) {
  if (!run.awaiting_input || !run.parent_numo_turn_id) return undefined;
  const event = [...events].reverse().find((candidate) =>
    candidate.type === "needs_input"
  );
  const payload = event?.payload ?? null;
  if (!payload) return undefined;
  const questions = parseAskUserQuestions({ questions: payload.questions });
  const questionId = eventString(payload, "question_id");
  const callId = eventString(payload, "call_id", "id");
  if (!questionId || !callId || questions.length === 0) return undefined;
  return {
    parentTurnId: run.parent_numo_turn_id,
    runId: run.id,
    questionId,
    callId,
    questions,
  };
}

function addArtifact(
  artifacts: AgentDelegationArtifact[],
  seen: Set<string>,
  artifact: AgentDelegationArtifact,
) {
  const key = `${artifact.kind}:${artifact.ref}`;
  if (seen.has(key)) return;
  seen.add(key);
  artifacts.push(artifact);
}

/** Build and persist the authoritative result consumed by the parent Numo turn. */
export async function finalizeAgentDelegationResult(
  service: SupabaseClient,
  run: AgentRun,
): Promise<AgentDelegationResult | null> {
  if (!run.delegation_brief || !run.parent_numo_turn_id) return null;
  const [eventsResult, artifactsResult] = await Promise.all([
    service.from("agent_run_events")
      .select("seq, type, payload")
      .eq("run_id", run.id)
      .in("type", ["files_changed", "tool_call", "tool_result", "commit", "pr_opened", "question", "needs_input", "error"])
      .order("seq", { ascending: true }),
    service.from("agent_artifacts")
      .select("kind, ref, url")
      .eq("run_id", run.id)
      .order("created_at", { ascending: true }),
  ]);
  if (eventsResult.error) {
    throw new Error(`Delegation event read failed: ${eventsResult.error.message}`);
  }
  if (artifactsResult.error) {
    throw new Error(`Delegation artifact read failed: ${artifactsResult.error.message}`);
  }
  const result = buildAgentDelegationResult({
    run,
    events: (eventsResult.data ?? []) as RunEvent[],
    artifactRows: (artifactsResult.data ?? []) as Array<{ kind?: unknown; ref?: unknown; url?: unknown }>,
  });
  const { error } = await service.from("agent_runs")
    .update({ delegation_result: result })
    .eq("id", run.id)
    .is("delegation_result", null);
  if (error) throw new Error(`Delegation result persistence failed: ${error.message}`);
  return result;
}

/** Pure output adapter: durable worker facts in, validated handoff contract out. */
export function buildAgentDelegationResult(input: {
  run: AgentRun;
  events: RunEvent[];
  artifactRows?: Array<{ kind?: unknown; ref?: unknown; url?: unknown }>;
}): AgentDelegationResult {
  const { run, events } = input;
  const brief = parseAgentDelegationBrief(run.delegation_brief);
  const artifacts: AgentDelegationArtifact[] = [];
  const seenArtifacts = new Set<string>();
  if (run.branch_name) addArtifact(artifacts, seenArtifacts, { kind: "branch", ref: run.branch_name });
  if (run.pr_number != null || run.pr_url) {
    addArtifact(artifacts, seenArtifacts, {
      kind: "pull_request",
      ref: run.pr_number != null ? `#${run.pr_number}` : run.pr_url!,
      ...(run.pr_url ? { url: run.pr_url } : {}),
    });
  }
  for (const artifact of input.artifactRows ?? []) {
    if (typeof artifact.ref !== "string" || !artifact.ref.trim()) continue;
    const kind = artifact.kind === "branch" || artifact.kind === "pull_request"
      ? artifact.kind
      : "other";
    addArtifact(artifacts, seenArtifacts, {
      kind,
      ref: artifact.ref.trim(),
      ...(typeof artifact.url === "string" && artifact.url.trim()
        ? { url: artifact.url.trim() }
        : {}),
    });
  }
  for (const event of events) {
    if (event.type !== "commit") continue;
    const payload = event.payload ?? {};
    const ref = eventString(payload, "sha", "commit", "ref");
    if (ref) addArtifact(artifacts, seenArtifacts, {
      kind: "commit",
      ref,
      ...(eventString(payload, "url") ? { url: eventString(payload, "url")! } : {}),
    });
  }
  const failed = run.status === "failed" || run.status === "canceled";
  const inputRequest = collectInputRequest(run, events);
  const status = failed
    ? "failed"
    : run.awaiting_input
      ? "needs_input"
      : run.error_message?.trim()
        ? "partial"
        : "completed";
  return parseAgentDelegationResult({
    version: AGENT_DELEGATION_CONTRACT_VERSION,
    status,
    summary: run.outcome?.trim()
      || run.error_message?.trim()
      || (failed
        ? `The code worker failed before completing: ${brief.objective}`
        : `The code worker completed: ${brief.objective}`),
    changedFiles: collectChangedFiles(events),
    verificationPerformed: collectVerification(events),
    artifacts,
    unresolvedDecisions: collectUnresolvedDecisions(run, events),
    ...(inputRequest ? { inputRequest } : {}),
  });
}
