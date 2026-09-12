import type { AssistantToolCall } from "@/lib/assistant-types";
import type { AiFeature, AiUsageBillTo } from "@/lib/server/ai-usage-shape";

import type { AgentFileChangeStatus } from "@/lib/agent-api";

/**
 * THE VOCABULARY OF HARNESS, AND NOTHING ELSE (MIN-286).
 *
 * These guys lived in `agent-loop.ts`, with the house loop. The loop is
 * part; they remain, because they did not belong to it: these are the words
 * that the opencode supervisor, the control plane, the thread and the
 * ledger say to each other. An event, a usage line, a direct load, a plan step.
 *
 * Module WITHOUT outgoing dependency — neither base, nor network, nor provider. It is this
 * which allows it to enter the microVM bundle without bringing a
 * Supabase client with it (see `vm-bundle-secrets.test.ts`).
 */

/** A part of content, in OpenAI/OpenRouter content parts format. */
export type AgentContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

/**
 * An image returned by a tool, ready to become a game `image_url`.
 * `url` is a DATA URL (`data:image/png;base64,…`), never a signed URL:
 * it is replayed hours later, when the signed URL has expired for
 * a long time.
 */
export interface AgentToolImage {
  url: string;
  /** File name — for traces and events, never sent to the model. */
  name?: string;
}

/**
 * A file touched, announced to the wire DURING the turn.
 *
 * The `status` is only CERTAIN where the tool carries it. Elsewhere we announce
 * `modified`, and the end-of-turn event `files_changed`, derived from
 * `git diff --name-status`, corrects: the thread shows PROVISIONAL while waiting for
 * the authority.
 */
export type AgentLiveEdit = {
  path: string;
  status: AgentFileChangeStatus;
  previousPath?: string;
};

/**
 * Exact Git statistics for the current round. They travel with direct when
 * the repository lives on the user's machine: the server cannot read it
 * in its place, so the diff route cannot produce the counters `+ / −`.
 */
export type AgentLiveFileStat = AgentLiveEdit & {
  additions: number;
  deletions: number;
};

/** Local patch in the form of forge files, but produced by Git on the
 * machine running the trick. Bounded before crossing the control plane. */
export interface AgentLiveDiffFile {
  filename: string;
  status: "added" | "removed" | "renamed" | "modified";
  additions: number;
  deletions: number;
  patch?: string;
  previous_filename?: string;
}

export interface AgentLiveDiff {
  files: AgentLiveDiffFile[];
  truncated: boolean;
  /** Complete snapshot of the session (current deposit), not delta of the round. */
  snapshot?: boolean;
}

/**
 * A message from the OpenRouter chat protocol. `content` accepts an ARRAY OF PARTS
 * (text + image, MIN-111): this is what allows a model attached to the ticket
 * to arrive in the eyes of the model.
 *
 * Only serves TWO purposes since the loop was removed: the start of the
 * turn, which the function assembles before drawing the opencode prompt, and the
 * rereading of the old checkpoints (`AgentCheckpoint.messages`), of which no one
 * knows how to replay the conversation anymore — cf. `priorConversationLost` in execute.ts.
 */
export interface AgentChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | AgentContentPart[] | null;
  tool_calls?: AssistantToolCall[];
  tool_call_id?: string;
  name?: string;
}

export type AgentEventType =
  | "status"
  | "thinking"
  | "tool_call"
  | "tool_result"
  | "commit"
  | "pr_opened"
  | "error"
  | "summary"
  | "user_message"
  | "plan_update"
  | "files_changed"
  | "question"
  /** Monthly usage budget exhausted during the run: the session stops and the thread
 * displays the possible outcomes (upgrade plan, wait, switch to BYOK). */
  | "quota_exhausted";

export type EmitAgentEvent = (
  type: AgentEventType,
  payload: Record<string, unknown>,
) => Promise<void> | void;

/**
 * The execution of a domain tool, such as the bridge is used for opencode.
 *
 * `callId` ATTACHES what the tool generates to its thread line: the events of a
 * child session carry the `parent_call_id` of the delegation which opened it, and
 * the thread folds them underneath instead of opening a bubble by event.
 */
export type ExecuteAgentTool = (
  name: string,
  args: Record<string, unknown>,
  callId?: string,
) => Promise<{
  result: unknown;
  success: boolean;
  /** Failure label, reported as is on the `tool_result` event: a refusal
 * of the harness must be ACCOUNTABLE in base, not only readable in the preview
 * (see `forbidden_command` of the git guardrail, MIN-108). */
  reason?: string;
  /** Images to SHOW to the model (MIN-111) — the bytes travel here and NEVER in
 * `result`: this is serialized, capped and copied into the event `tool_result`,
 * where a data URL would have nothing to do. */
  images?: AgentToolImage[];
  /**
 * What the harness has LONG to say about this call (MIN-247). The `result` of a
 * tool is elided IN ITS MIDDLE beyond a template - perfect for an output of
 * command whose verdict is in the queue, ruinous for a document that is given to
 * READ IN ENTIRETY. The only use to date is the `create_pr` gate, which makes
 * the diff of the turn: a diff cut out of its middle does not reread, and this is
 * precisely the rereading that we are trying to make take place.
 */
  followUp?: string;
}>;

/** Round state BEING written, pushed to the open thread (never persisted). */
export interface AgentLiveProgress {
  /** Model response as written so far (FULL text, not a delta). */
  text: string;
  /** Tool calls already started in this round: >0 ⇒ the text is from the
 * narration, the round continues. 0 ⇒ this may be the final answer. */
  tools: number;
  /**
 * The model is reasoning (MIN-122): the thread displays a compact
 * indicator + a counter. The TEXT of the reasoning does not travel here — it is not
 * streamed to the screen, only persisted folded at the end of the round.
 */
  reasoningActive: boolean;
  /** Milliseconds of reflection accumulated in this round (0 if no reasoning). */
  reasoningMs: number;
  /**
 * Files touched so far by the round, PROVISIONAL (MIN-248 bis): they are
 * carried by each charge of the live, not only by that of the edition —
 * a charge is a complete snapshot, and what it silences, the thread erases.
 * The event `files_changed`, derived from git, takes over.
 */
  files?: AgentLiveEdit[];
  /** The list has been bounded (`CHANGED_FILES_CAP`): the thread says this rather than
 * letting a truncated list be read as a complete list. */
  filesTruncated?: boolean;
  /** Exact Git counters of tour files, when the harness can read them. */
  fileStats?: AgentLiveFileStat[];
}

export type EmitAgentLive = (progress: AgentLiveProgress) => void;

/**
 * A ledger line, such as the harness produces it — the SAME form
 * as `AiUsageInput`, repeated here so that this module does not depend on who
 * writes (see the header).
 */
export interface AgentUsageLine {
  runId: string;
  seq: number;
  feature: AiFeature;
  billTo: AiUsageBillTo;
  model?: string | null;
  generationId?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  /** Prompt caching (MIN-242): tokens read back to the cache, tokens written there. */
  cachedTokens?: number | null;
  cacheWriteTokens?: number | null;
  cost?: number | null;
  estimated?: boolean;
  projectId?: string | null;
}

/**
 * Where does a ledger line start. Injected, and MANDATORY: this is what makes the
 * harness not know the path to the base (MIN-224). Two implementations —
 * `recordAiUsage` in the function, `POST /api/agent-vm/usage` in the microVM.
 *
 * Best-effort on both sides: it should never fail a round.
 */
export type RecordAgentUsage = (line: AgentUsageLine) => Promise<void>;

/** Current wire/storage version for a Numo-owned code-worker handoff. */
export const AGENT_DELEGATION_CONTRACT_VERSION = 1 as const;

export const AGENT_DELEGATION_SOURCE_KINDS = [
  "issue",
  "plan",
  "page",
  "pull_request",
  "conversation",
  "attachment",
  "url",
  "other",
] as const;
export type AgentDelegationSourceKind =
  (typeof AGENT_DELEGATION_SOURCE_KINDS)[number];

export const AGENT_DELEGATION_AUTHORIZATIONS = [
  "read_repository",
  "modify_repository",
  "run_verification",
  "commit_changes",
  "manage_pull_request",
  "update_issue_plan",
] as const;
export type AgentDelegationAuthorization =
  (typeof AGENT_DELEGATION_AUTHORIZATIONS)[number];

export interface AgentDelegationSourceReference {
  kind: AgentDelegationSourceKind;
  label: string;
  id?: string;
  url?: string;
  version?: string;
}

/** Immutable task brief recorded before a code worker can be queued. */
export interface AgentDelegationBrief {
  version: typeof AGENT_DELEGATION_CONTRACT_VERSION;
  correlation: {
    parentConversationId: string;
    parentTurnId: string;
    toolCallId: string;
  };
  targetRepository: {
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
  expectedOutput: string[];
}

export type AgentDelegationResultStatus =
  | "completed"
  | "partial"
  | "failed"
  | "needs_input";

export interface AgentDelegationVerification {
  command: string;
  status: "passed" | "failed" | "unknown";
}

export interface AgentDelegationArtifact {
  kind: "branch" | "commit" | "pull_request" | "other";
  ref: string;
  url?: string;
}

/** Validated terminal handoff interpreted by Numo in the parent conversation. */
export interface AgentDelegationResult {
  version: typeof AGENT_DELEGATION_CONTRACT_VERSION;
  status: AgentDelegationResultStatus;
  summary: string;
  changedFiles: string[];
  verificationPerformed: AgentDelegationVerification[];
  artifacts: AgentDelegationArtifact[];
  unresolvedDecisions: string[];
}

function contractRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function contractString(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim().slice(0, max);
}

function contractStrings(value: unknown, label: string, maxItems = 50): string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.slice(0, maxItems).map((item, index) =>
    contractString(item, `${label}[${index}]`, 1_000)
  );
}

/** Parse an untrusted persisted brief and reject unsupported contract versions. */
export function parseAgentDelegationBrief(raw: unknown): AgentDelegationBrief {
  const value = contractRecord(raw, "delegation brief");
  if (value.version !== AGENT_DELEGATION_CONTRACT_VERSION) {
    throw new Error("Unsupported delegation brief version");
  }
  const correlation = contractRecord(value.correlation, "delegation correlation");
  const repository = contractRecord(value.targetRepository, "target repository");
  const sourceKinds = new Set<string>(AGENT_DELEGATION_SOURCE_KINDS);
  const authorizations = new Set<string>(AGENT_DELEGATION_AUTHORIZATIONS);
  if (!Array.isArray(value.sourceReferences)) {
    throw new Error("sourceReferences must be an array");
  }
  const sourceReferences = value.sourceReferences.slice(0, 50).map((rawSource, index) => {
    const source = contractRecord(rawSource, `sourceReferences[${index}]`);
    const kind = contractString(source.kind, `sourceReferences[${index}].kind`, 40);
    if (!sourceKinds.has(kind)) throw new Error(`Unsupported source reference kind: ${kind}`);
    return {
      kind: kind as AgentDelegationSourceKind,
      label: contractString(source.label, `sourceReferences[${index}].label`, 300),
      ...(typeof source.id === "string" && source.id.trim()
        ? { id: source.id.trim().slice(0, 300) }
        : {}),
      ...(typeof source.url === "string" && source.url.trim()
        ? { url: source.url.trim().slice(0, 2_000) }
        : {}),
      ...(typeof source.version === "string" && source.version.trim()
        ? { version: source.version.trim().slice(0, 100) }
        : {}),
    };
  });
  const authorizedWork = contractStrings(value.authorizedWork, "authorizedWork", 20)
    .map((authorization) => {
      if (!authorizations.has(authorization)) {
        throw new Error(`Unsupported delegated authorization: ${authorization}`);
      }
      return authorization as AgentDelegationAuthorization;
    });
  if (authorizedWork.length === 0) {
    throw new Error("authorizedWork must contain at least one authorization");
  }
  const expectedOutput = contractStrings(value.expectedOutput, "expectedOutput");
  if (expectedOutput.length === 0) {
    throw new Error("expectedOutput must contain at least one requirement");
  }
  return {
    version: AGENT_DELEGATION_CONTRACT_VERSION,
    correlation: {
      parentConversationId: contractString(
        correlation.parentConversationId,
        "correlation.parentConversationId",
        100,
      ),
      parentTurnId: contractString(correlation.parentTurnId, "correlation.parentTurnId", 100),
      toolCallId: contractString(correlation.toolCallId, "correlation.toolCallId", 300),
    },
    targetRepository: {
      projectId: contractString(repository.projectId, "targetRepository.projectId", 100),
      provider: contractString(repository.provider, "targetRepository.provider", 40),
      externalId: contractString(repository.externalId, "targetRepository.externalId", 300),
      fullName: contractString(repository.fullName, "targetRepository.fullName", 500),
      defaultBranch: typeof repository.defaultBranch === "string"
        ? repository.defaultBranch.trim().slice(0, 300) || null
        : null,
    },
    objective: contractString(value.objective, "objective", 8_000),
    sourceReferences,
    constraints: contractStrings(value.constraints, "constraints"),
    authorizedWork,
    expectedOutput,
  };
}

/** Parse the worker adapter output before it is persisted or shown to Numo. */
export function parseAgentDelegationResult(raw: unknown): AgentDelegationResult {
  const value = contractRecord(raw, "delegation result");
  if (value.version !== AGENT_DELEGATION_CONTRACT_VERSION) {
    throw new Error("Unsupported delegation result version");
  }
  const statuses = new Set<AgentDelegationResultStatus>([
    "completed", "partial", "failed", "needs_input",
  ]);
  const status = contractString(value.status, "status", 40) as AgentDelegationResultStatus;
  if (!statuses.has(status)) throw new Error(`Unsupported delegation result status: ${status}`);
  if (!Array.isArray(value.verificationPerformed)) {
    throw new Error("verificationPerformed must be an array");
  }
  if (!Array.isArray(value.artifacts)) throw new Error("artifacts must be an array");
  const verificationStatuses = new Set(["passed", "failed", "unknown"]);
  const artifactKinds = new Set(["branch", "commit", "pull_request", "other"]);
  return {
    version: AGENT_DELEGATION_CONTRACT_VERSION,
    status,
    summary: contractString(value.summary, "summary", 8_000),
    changedFiles: contractStrings(value.changedFiles, "changedFiles", 500),
    verificationPerformed: value.verificationPerformed.slice(0, 100).map((rawCheck, index) => {
      const check = contractRecord(rawCheck, `verificationPerformed[${index}]`);
      const checkStatus = contractString(check.status, `verificationPerformed[${index}].status`, 20);
      if (!verificationStatuses.has(checkStatus)) {
        throw new Error(`Unsupported verification status: ${checkStatus}`);
      }
      return {
        command: contractString(check.command, `verificationPerformed[${index}].command`, 1_000),
        status: checkStatus as AgentDelegationVerification["status"],
      };
    }),
    artifacts: value.artifacts.slice(0, 100).map((rawArtifact, index) => {
      const artifact = contractRecord(rawArtifact, `artifacts[${index}]`);
      const kind = contractString(artifact.kind, `artifacts[${index}].kind`, 30);
      if (!artifactKinds.has(kind)) throw new Error(`Unsupported artifact kind: ${kind}`);
      return {
        kind: kind as AgentDelegationArtifact["kind"],
        ref: contractString(artifact.ref, `artifacts[${index}].ref`, 500),
        ...(typeof artifact.url === "string" && artifact.url.trim()
          ? { url: artifact.url.trim().slice(0, 2_000) }
          : {}),
      };
    }),
    unresolvedDecisions: contractStrings(value.unresolvedDecisions, "unresolvedDecisions"),
  };
}

export type PlanStepStatus = "pending" | "in_progress" | "completed" | "cancelled";
export interface PlanStep {
  step: string;
  status: PlanStepStatus;
}

const PLAN_STATUSES = new Set<PlanStepStatus>(["pending", "in_progress", "completed", "cancelled"]);

/** Normalizes the `plan` argument of tool update_plan into valid steps (bounded). */
export function normalizePlan(raw: unknown): PlanStep[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 40)
    .map((it) => {
      const o = (it && typeof it === "object" ? it : {}) as Record<string, unknown>;
      const step = String(o.step ?? o.text ?? "").slice(0, 300);
      const s = String(o.status ?? "pending");
      const status = PLAN_STATUSES.has(s as PlanStepStatus) ? (s as PlanStepStatus) : "pending";
      return { step, status };
    })
    .filter((s) => s.step.trim().length > 0);
}

/**
 * A PLATFORM tool, executed outside the repository: ticket, notebook, pull request,
 * scratchpad. The microVM bridge serves it by a POST to the control plane,
 * which routes it by NAME and by ANCHOR (`runPlatformTool`, MIN-326).
 */
export type PlatformToolHandler = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{
  result: unknown;
  success: boolean;
  images?: AgentToolImage[];
  /** What the harness has LONG to say about this call — served after the round, where
 * where a `result` would be elided in the middle. Today: plan control
 * hooked to `write_issue_plan` (`gateWritePlan`). */
  followUp?: string;
}>;
