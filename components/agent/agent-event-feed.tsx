"use client";

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { Button, cn } from "mangue-ui";
import {
  AlertTriangle,
  ArrowDown,
  Brain,
  CircleSlash,
  Cloud,
  CloudOff,
  GitCommit,
} from "lucide-react";
import { ChatMessage } from "@/components/assistant/chat-message";
import { WorkAccordion } from "@/components/assistant/work-accordion";
import { NumoIcon } from "@/components/numo-icon";
import { ChangedFilesBlock } from "./changed-files-block";
import { ReasoningBlock } from "./reasoning-block";
import { SubagentBlock } from "./subagent-block";
import { QuotaExhaustedCard } from "./quota-exhausted-card";
import { coerceBillingPlanId, type BillingPlanId } from "@/lib/billing-plans";
import type { MessageKey } from "@/lib/i18n-keys";
import { useScrollFade } from "@/lib/use-scroll-fade";
import { unechoedMessages } from "@/lib/agent-pending";
import { buildBlocks, type TurnCloser } from "@/lib/agent-feed-blocks";
import { useAgentRunEventsQuery } from "@/lib/use-agent-runs";
import { useAgentRunLive } from "@/lib/use-agent-run-live";
import {
  isAgentRunWorking,
  parseFilesChangedPayload,
  type AgentFileChange,
  type AgentRunEvent,
  type AgentRunStatus,
} from "@/lib/agent-api";
import { mergeLiveFileStats, type LiveDiffStat } from "@/lib/agent-changed-files";
import type { AssistantMessage, AssistantToolCall, AssistantMention } from "@/lib/assistant-types";
import type { AttachmentInput } from "@/lib/types";

/**
 * Activity flow of an agent run (MIN-46), rendered in EXACT PARITY with the chat
 * Numo: we rebuild the events (`thinking`/`summary`/`tool_call`/`tool_result`)
 * in `AssistantMessage[]` format then we return them with the SAME `<ChatMessage>`.
 *
 * Codex style: as soon as a TURN ends (the agent issues its final response, event
 * `summary`), its entire process (reflections, tool-calls, plan updates) folds
 * in an accordion “Worked for X min Y s” — only the answer remains
 * visible below. User messages separate rounds and remain
 * visible; the CURRENT round remains unfolded.
 */

type ToolResult = { status: "running" | "complete"; result?: unknown; success?: boolean };

export type MessageItem = {
  kind: "message";
  message: AssistantMessage;
  /** created_at of the event which opened this message (start of round). */
  createdAt: string;
  /** This message is the final summary of a round (ends the round, exits the accordion). */
  isSummary?: boolean;
  /** For a summary: created_at the event `summary` (end of turn → duration). */
  endedAt?: string;
  /** Text BEING written which could be the answer of the trick (no tools
 called in this round): rendered UNDER the accordion, where the final message
 will remain — otherwise it would jump from the unfolding to the outside once the event has been set. */
  isLiveAnswer?: boolean;
  /** User response to the ask_user questions in this post (the
 user_message that follows, absorbed — no bubble, line details). */
  askUserAnswer?: string;
};

export type FeedItem =
  | MessageItem
  | {
      kind: "note";
      id: string;
      variant:
        | "commit"
        | "error"
        | "reasoningUnsupported"
        | "providerRetry"
        | "localDeclined"
        | "currentRepoOverlap";
      /** NAMED reason for a harness error (`turnTooLong`…), translated on the display.
       * Absent on a model error, which only has its text. Also wears the
       * reason for a run kept in the cloud (`byok`, `no_mint` — MIN-357). */
      code?: string;
      /** How many files are in the note (MIN-358: those that the commit has
       * taken to the user). The message is expressed in the plural. */
      count?: number;
      text: string;
      createdAt: string;
    }
  /** Usage budget exhausted during the run: CLOSING card of the tour (the work
   * is pushed, the session will resume when the budget returns). */
  | {
      kind: "quota";
      id: string;
      // `spent`/`cap` of the payload are NOT included: usage is expressed as a percentage
      // to the user, never in dollars (they remain in the event, for the record).
      resetsAt: string | null;
      nextPlanId: BillingPlanId | null;
      byok: boolean;
      /** `run_cap` = it was the ceiling of THIS passage that bit, not the count. */
      cause: "account" | "run_cap";
      /** This ceiling, as a % of the monthly budget — null when the cause is the account. */
      capPercent: number | null;
      createdAt: string;
    }
  /** Model reflection phase (MIN-122): compact line + counter, never
   * live text. `active` until the round has given up. */
  | {
      kind: "reasoning";
      id: string;
      active: boolean;
      durationMs: number;
      text: string;
      createdAt: string;
    }
  | {
      kind: "files";
      id: string;
      files: AgentFileChange[];
      truncated: boolean;
      createdAt: string;
      /** PROVISIONAL list of the current round (direct), not the git list. */
      live?: boolean;
    }
  /**
   * A sub-agent (MIN-112), folded. All events that carry its `subagent_id`
   * are AGGREGATE here rather than rendered one by one: a girl produces as many events
   * than an entire turn, and leaving them in the flow would make the turn that took place unreadable.
   * delegate — this is the main risk identified in R9.
   */
  | {
      kind: "subagent";
      id: string;
      /** Readable id of the subagent (`sub-1`), as the parent manipulates it. */
      subagentId: string;
      mode: "explore" | "implement" | null;
      /** Girl's tool-calls: the only progress counter the thread sees. */
      steps: number;
      /** Final report (daughter's `summary` event). */
      report: string;
      /** Error message if its loop failed. */
      error: string;
      /** His report has been delivered to the parent (parent's `status` event). */
      delivered: boolean;
      /** Delivered PARTIAL: the girl was cut off before concluding. */
      partial: boolean;
      createdAt: string;
      /** Moment when the girl gave back the hand (summary, error, or delivery of the
       * report by the parent), or null as long as it is running: this is what FREEZES
       * his time. Without that, a session replayed three days later would show
       * a subagent “launched 72 hours ago”. */
      endedAt: string | null;
    };

function makeMessage(
  id: string,
  content: string | null,
  role: "assistant" | "user" = "assistant",
  mentions?: AssistantMention[],
  attachments?: AttachmentInput[],
): AssistantMessage {
  return {
    id,
    conversation_id: "",
    role,
    content,
    tool_calls: null,
    tool_call_id: null,
    tool_name: null,
    metadata: {
      ...(mentions?.length ? { mentions } : {}),
      ...(attachments?.length ? { attachments } : {}),
    },
    created_at: "",
  };
}

const ATTACHMENT_METADATA_RE = /<!-- minddy-attachments:([^\s]+) -->\s*/;
const ATTACHMENT_BLOCK_RE = /<attachments>\n[\s\S]*?\n<\/attachments>/;
const LEGACY_ATTACHMENT_LINE_RE =
  /^- (.+?) \((.+?), (\d+) bytes\): (https?:\/\/\S+)$/gm;

/** Recover the storage key embedded in Supabase's legacy signed URL format. */
function storagePathFromSignedUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    const prefix = "/storage/v1/object/sign/attachments/";
    if (!url.pathname.startsWith(prefix)) return null;
    return decodeURIComponent(url.pathname.slice(prefix.length));
  } catch {
    return null;
  }
}

/**
 * Agent prompts carry signed URLs so the runtime can download chat uploads.
 * Those URLs are operational context, not prose the sender wrote: recover the
 * upload descriptors for the same resource pills as the assistant, then remove
 * the entire internal block from the user-facing bubble.
 */
function displayUserMessage(content: string): {
  content: string;
  attachments: AttachmentInput[];
} {
  const marker = content.match(ATTACHMENT_METADATA_RE);
  let attachments: AttachmentInput[] = [];
  if (marker?.[1]) {
    try {
      const parsed: unknown = JSON.parse(decodeURIComponent(marker[1]));
      if (Array.isArray(parsed)) {
        attachments = parsed
          .filter(
            (item): item is AttachmentInput =>
              !!item &&
              typeof item === "object" &&
              typeof item.storage_path === "string" &&
              typeof item.file_name === "string" &&
              typeof item.mime_type === "string" &&
              typeof item.size_bytes === "number",
          )
          .slice(0, 5);
      }
    } catch {
      // A malformed marker is only presentation metadata. The prompt remains
      // usable by the agent; it simply falls back to no resource pills.
    }
  }
  // The first version of agent attachments wrote only the readable instruction
  // and its signed URLs. Rebuild enough metadata from that stable format to
  // render existing conversations as pills too; the regular authenticated file
  // route then mints a fresh URL, even if the old signed one has expired.
  if (attachments.length === 0) {
    const reconstructed: AttachmentInput[] = [];
    for (const match of content.matchAll(LEGACY_ATTACHMENT_LINE_RE)) {
      const storage_path = storagePathFromSignedUrl(match[4]);
      if (!storage_path) continue;
      reconstructed.push({
        storage_path,
        file_name: match[1],
        mime_type: match[2],
        size_bytes: Number(match[3]),
      });
      if (reconstructed.length === 5) break;
    }
    attachments = reconstructed;
  }
  return {
    content: content
      .replace(ATTACHMENT_METADATA_RE, "")
      .replace(ATTACHMENT_BLOCK_RE, "")
      .trim(),
    attachments,
  };
}

/** Tool_call args reconstructed as a JSON string (what ToolCallList expects). */
function toolArguments(payload: Record<string, unknown>): string {
  // Old event format (existing runs): COMPLETE arguments serialized under the
  // key `args`. We return it as is → `args.command` / `args.pattern` are
  // readable again (backwards compatible with already recorded runs).
  if (typeof payload.args === "string") return payload.args;
  // Current format: flat arg summary (command, pattern, path…).
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (k === "id" || k === "name") continue;
    rest[k] = v;
  }
  return JSON.stringify(rest);
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/**
 * Groups the flat flow of events into helper messages (a `thinking`/`summary`
 * opens a bubble; the following `tool_call` attach to it, like a Numo trick)
 * + a Map of tools results (running/complete/success). Each item bears the
 * `created_at` of its event; the `summary` message is marked `isSummary`.
 */
function buildFeed(
  events: AgentRunEvent[],
  initialPrompt?: string | null,
  initialPromptMentions?: AssistantMention[] | null,
): {
  items: FeedItem[];
  results: Map<string, ToolResult>;
  userTexts: string[];
  sandboxReady: boolean;
} {
  const ordered = [...events].sort((a, b) => a.seq - b.seq);
  const items: FeedItem[] = [];
  const results = new Map<string, ToolResult>();
  // Where is the MACHINE of the current chunk? Each chunk opens with a
  // `status: running` then, once the microVM is woken up and the repository there, a
  // `phase: sandbox_ready`. The second after the first ⇒ the sandbox is open.
  // (Compared by `seq`: a run connects chunks, only the last one counts.)
  let runningSeq = -1;
  let sandboxSeq = -1;
  // ALL user texts received (bubbles AND answers absorbed by a question) —
  // is used to deduplication of optimistic bubbles, which can no longer be read since
  // the items alone.
  const userTexts: string[] = [];
  let current: MessageItem | null = null;
  // Last pending ask_user question: next user_message is his
  // response (absorbed in the line, no bubble).
  let lastQuestion: MessageItem | null = null;

  // “Original” bubble: the launch prompt is NOT in the event flow
  // (it feeds the LLM task message). It is displayed at the top as the 1st bubble
  // user, on par with Numo chat. The STEERING messages are already
  // emitted in events `user_message` and rendered by the loop below.
  const prompt = (initialPrompt ?? "").trim();
  if (prompt) {
    const displayed = displayUserMessage(prompt);
    userTexts.push(prompt);
    items.push({
      kind: "message",
       message: makeMessage(
         "initial-prompt",
         displayed.content,
         "user",
         initialPromptMentions ?? undefined,
         displayed.attachments,
       ),
      createdAt: "",
    });
  }

  const openMessage = (item: MessageItem) => {
    items.push(item);
    current = item;
  };

  // Subagents encountered (MIN-112): one folded block per girl, created on her FIRST
  // event — so just after the `spawn_agent` line which launched it, since this one
  // necessarily precedes. The following events of the same girl are added to it.
  const subagentBlocks = new Map<string, Extract<FeedItem, { kind: "subagent" }>>();
  const subagentBlock = (
    subagentId: string,
    e: AgentRunEvent,
    p: Record<string, unknown>,
  ): Extract<FeedItem, { kind: "subagent" }> => {
    const existing = subagentBlocks.get(subagentId);
    if (existing) return existing;
    const mode: "explore" | "implement" | null =
      p.subagent_mode === "implement" ? "implement" : p.subagent_mode === "explore" ? "explore" : null;
    const block = {
      kind: "subagent" as const,
      id: `subagent-${subagentId}`,
      subagentId,
      mode,
      steps: 0,
      report: "",
      error: "",
      delivered: false,
      partial: false,
      createdAt: e.created_at,
      endedAt: null,
    };
    subagentBlocks.set(subagentId, block);
    items.push(block);
    return block;
  };

  for (const e of ordered) {
    const p = e.payload ?? {};
    // Event of a SUBAGENT: it does not cross the parent flow. Without this detour,
    // each `thinking` of the girl would open a bubble and each `tool_call` would
    // would tie into the parent's message, mixing two sessions into one
    // ligne de lecture.
    if (typeof p.subagent_id === "string" && p.subagent_id) {
      const block = subagentBlock(p.subagent_id, e, p);
      if (e.type === "tool_call") block.steps++;
      else if (e.type === "summary") {
        block.report = str(p.text);
        block.endedAt = e.created_at;
      } else if (e.type === "error") {
        block.error = str(p.message) || str(p.text);
        block.endedAt = e.created_at;
      }
      continue;
    }
    // The parent announces that a report has been given to him: this is what distinguishes a
    // daughter CUT (delivered unrelated) from a girl still at work.
    if (e.type === "status" && p.phase === "subagent_report" && typeof p.id === "string") {
      const block = subagentBlocks.get(p.id);
      if (block) {
        block.delivered = true;
        block.partial = p.partial === true;
        // Timer net: a CUT girl emits neither summary nor error, so it is
        // this delivery which is its only moment of end.
        block.endedAt ??= e.created_at;
      }
      continue;
    }
    // “The next user_message answers the question” window does not survive
    // only to neutral events — any content event (new turn) closes it.
    if (!["user_message", "question", "tool_result", "status"].includes(e.type)) {
      lastQuestion = null;
    }
    switch (e.type) {
      case "thinking": {
        const text = str(p.text);
        // Two distinct `thinking` under the same type of event: the REFLECTION of the
        // model (marked `kind`, rendered as a folded compact line) and its
        // NARRATION (text, rendered in bubble). Without the marker, the behavior
        // from before MIN-122 is unchanged.
        if (p.kind === "reasoning") {
          // Reflection CLOSES the current bubble without opening one (a line of
          // reflection does not welcome a tool-call): the actions of the following round
          // therefore attach to a NEW bubble, rendered UNDER this line.
          //
          // Without that, all the tool-calls of a turn would pile up in the group
          // of actions of the first round — the one opened before the first reflection —
          // while the reflection lines fell into line. The thread
          // then recounted an agent who acted in one go then thought three times,
          // or the opposite of what happened: he reflects BETWEEN his actions.
          current = null;
          items.push({
            kind: "reasoning",
            id: e.id,
            active: false,
            durationMs: typeof p.durationMs === "number" ? p.durationMs : 0,
            text,
            createdAt: e.created_at,
          });
          break;
        }
        if (!text.trim()) break;
        openMessage({ kind: "message", message: makeMessage(e.id, text), createdAt: e.created_at });
        break;
      }
      case "summary": {
        const text = str(p.text);
        if (!text.trim()) break;
        // The round terminal often emits thinking THEN summary with the same text:
        // we do not duplicate, we MARK the last bubble as the final summary.
        const last = items[items.length - 1];
        if (last?.kind === "message" && (last.message.content ?? "").trim() === text.trim()) {
          last.isSummary = true;
          last.endedAt = e.created_at;
          current = null;
          break;
        }
        openMessage({
          kind: "message",
          message: makeMessage(e.id, text),
          createdAt: e.created_at,
          isSummary: true,
          endedAt: e.created_at,
        });
        current = null;
        break;
      }
      case "user_message": {
        const text = str(p.text);
        if (!text.trim()) break;
        const displayed = displayUserMessage(text);
        const mentions = Array.isArray(p.mentions)
          ? (p.mentions as AssistantMention[])
          : undefined;
        userTexts.push(text.trim());
        current = null;
        // Response to an ask_user: ABSORBED by the question line (details
        // on click) — no bubbles, the reading flow remains clean.
        if (lastQuestion) {
          lastQuestion.askUserAnswer = text;
          lastQuestion = null;
          break;
        }
        // User steering message: user bubble, do not attach the
        // tool-calls suivants (ils appartiennent au prochain tour de l'agent).
        items.push({
          kind: "message",
          message: makeMessage(e.id, displayed.content, "user", mentions, displayed.attachments),
          createdAt: e.created_at,
        });
        break;
      }
      case "tool_call": {
        const name = str(p.name);
        const id = str(p.id);
        if (!name || !id) break;
        const tc: AssistantToolCall = {
          id,
          type: "function",
          function: { name, arguments: toolArguments(p) },
        };
        if (!current) {
          openMessage({ kind: "message", message: makeMessage(e.id, null), createdAt: e.created_at });
        }
        current!.message.tool_calls = [...(current!.message.tool_calls ?? []), tc];
        if (!results.has(id)) results.set(id, { status: "running", success: true });
        break;
      }
      case "tool_result": {
        const id = str(p.id);
        if (id) results.set(id, { status: "complete", success: p.success !== false });
        break;
      }
      case "question": {
        // ask_user (MIN-86): the agent asks structured questions and the turn
        // finished. Rendered as a turn CLOSING message (isSummary → the
        // unfolded folds) carrying a complete tool_call ask_user — the ChatMessage
        // shared makes it a question card, on par with Numo.
        const id = str(p.id) || e.id;
        const questions = Array.isArray(p.questions) ? p.questions : [];
        if (questions.length === 0) break;
        const msg = makeMessage(e.id, null);
        msg.tool_calls = [
          {
            id,
            type: "function",
            function: { name: "ask_user", arguments: JSON.stringify({ questions }) },
          },
        ];
        results.set(id, { status: "complete", success: true });
        const questionItem: MessageItem = {
          kind: "message",
          message: msg,
          createdAt: e.created_at,
          isSummary: true,
          endedAt: e.created_at,
        };
        items.push(questionItem);
        // The next user_message is the answer to this question.
        lastQuestion = questionItem;
        current = null;
        break;
      }
      case "pr_opened": {
        // The PR is accessible from the conversation header (button /
        // link depending on its state) → no redundant chip in the wire.
        current = null;
        break;
      }
      case "commit": {
        current = null;
        items.push({ kind: "note", id: e.id, variant: "commit", text: "", createdAt: e.created_at });
        break;
      }
      case "files_changed": {
        // Issued at the end of the round (after `summary`): the authoritative list of files
        // that the trick has changed. Attached to the round and rendered under its response (buildBlocks).
        const { files, truncated } = parseFilesChangedPayload(p);
        current = null;
        if (files.length > 0) {
          items.push({ kind: "files", id: e.id, files, truncated, createdAt: e.created_at });
        }
        break;
      }
      case "plan_update": {
        // Nothing to return HERE: the checklist lives above the composer
        // ([plan-activity-bar](./plan-activity-bar.tsx)), where it remains under the
        // eyes instead of going up with the thread. She doesn't cut the trick no
        // more — checking a step is not speaking out.
        break;
      }
      case "quota_exhausted": {
        // Closes the turn: nothing is attached to it anymore, and the unfolding folds up like
        // on a `summary`.
        current = null;
        items.push({
          kind: "quota",
          id: e.id,
          resetsAt: typeof p.resetsAt === "string" ? p.resetsAt : null,
          nextPlanId: coerceBillingPlanId(p.nextPlanId),
          byok: p.byok === true,
          // Events before the ceiling per pass do not have `cause`: they
          // all talk about the account budget, the only boundary that existed.
          cause: p.cause === "run_cap" ? "run_cap" : "account",
          capPercent: typeof p.capPercent === "number" ? p.capPercent : null,
          createdAt: e.created_at,
        });
        break;
      }
      case "status": {
        // MACHINE markers — nothing to return, they only say where it is
        // the chunk (see `sandboxReady`).
        if (p.phase === "sandbox_ready") sandboxSeq = e.seq;
        else if (p.status === "running") runningSeq = e.seq;
        // Both `status` returned. The provider REFUSED the level of reasoning
        // requested (MIN-122): without this line, the chosen level would remain displayed
        // in the composition while it no longer has any effect — silently.
        if (p.phase === "reasoning_unsupported") {
          items.push({
            kind: "note",
            id: e.id,
            variant: "reasoningUnsupported",
            text: "",
            createdAt: e.created_at,
          });
        }
        /**
         * MIN-357: the run was requested on the user's machine, and it
         * went to the cloud. The seesaw is good behavior (which
         * lack locally, it's a CEILING, and the cloud has one) — but a
         * bascule muette laisserait quelqu'un croire que son agent tourne chez
         * him, on his repository, while he is running in a microVM.
         */
        if (p.phase === "local_exec_declined") {
          items.push({
            kind: "note",
            id: e.id,
            variant: "localDeclined",
            ...(str(p.reason) ? { code: str(p.reason) } : {}),
            text: "",
            createdAt: e.created_at,
          });
        }
        /**
         * MIN-358: The agent was working in the repository that the user has on
         * its disk, and its commit took away files that it had
         * also modified — so some work of his own goes into the pull request.
         *
         * No trick closes this case: two hands in the same file
         * do not unravel afterwards. What we can do, and who is
         * minimum, it's SAYING it instead of deciding in silence.
         */
        if (p.phase === "current_repo_overlap") {
          const files = typeof p.files === "number" ? p.files : 0;
          if (files > 0) {
            items.push({
              kind: "note",
              id: e.id,
              variant: "currentRepoOverlap",
              count: files,
              text: "",
              createdAt: e.created_at,
            });
          }
        }
        // The supplier has fallen (MIN-219): the turn waits before trying again,
        // and the wait can last several minutes. The event already existed, it
        // had no reader — the agent kept silent without anything saying why.
        if (p.phase === "transient_error") {
          items.push({
            kind: "note",
            id: e.id,
            variant: "providerRetry",
            text: "",
            createdAt: e.created_at,
          });
        }
        break;
      }
      case "error": {
        current = null;
        const msg = str(p.message) || str(p.text);
        // A CODE takes precedence over the text: it is the thread that translates. The `message` of
        // payload remains the fallback — a model error is just that.
        const code = str(p.code);
        if (code || msg.trim()) {
          items.push({
            kind: "note",
            id: e.id,
            variant: "error",
            ...(code ? { code } : {}),
            text: msg,
            createdAt: e.created_at,
          });
        }
        break;
      }
      default:
        break;
    }
  }

  return { items, results, userTexts, sandboxReady: sandboxSeq > runningSeq };
}


interface RenderContext {
  results: Map<string, ToolResult>;
  copyableIds: Set<string>;
  /** Exact counters of the live Git diff, covering the entire branch. */
  liveDiffFiles: LiveDiffStat[];
  /** Opens session diff view (in conversation) → clickable lines. */
  onOpenFile?: (path: string) => void;
  /** Opens the full session diff view from the final map. */
  onOpenDiff?: () => void;
  /** Event `question` ACTIVE, made by the conversation instead of the composer →
 its thread item is hidden (past questions remain inert). */
  hiddenQuestionEventId?: string | null;
}

function FilesRow({
  item,
  liveDiffFiles,
  onOpenFile,
  onOpenDiff,
}: {
  item: Extract<FeedItem, { kind: "files" }>;
  liveDiffFiles: LiveDiffStat[];
  onOpenFile?: (path: string) => void;
  onOpenDiff?: () => void;
}) {
  // The CURRENT turn block keeps its provisional list, but its counters are
  // enriched by the live Git diff as soon as it responds. It leads to diff
  // ALIVE, not in an advanced state; the wording and shimmer indicate this.
  const files = item.live ? mergeLiveFileStats(item.files, liveDiffFiles) : item.files;
  return (
    <ChangedFilesBlock
      files={files}
      truncated={item.truncated}
      onOpenFile={onOpenFile}
      onReview={onOpenDiff}
    />
  );
}

function renderItem(it: FeedItem, ctx: RenderContext, afterContent?: ReactNode): ReactNode {
  if (it.kind === "message") {
    // ACTIVE question: the live map is displayed by the conversation at the
    // place du composer — sa bulle du fil ne se rend pas du tout.
    if (it.message.id === ctx.hiddenQuestionEventId) return null;
    return (
      <ChatMessage
        key={it.message.id}
        message={it.message}
        toolCallResults={ctx.results}
        askUserAnswer={it.askUserAnswer}
        showCopyButton={ctx.copyableIds.has(it.message.id)}
        afterContent={afterContent}
      />
    );
  }
  if (it.kind === "files") {
    // The live summary is already visible in the pill above the composer.
    // Keeping the full list here while the agent works would duplicate
    // the indicator and would unnecessarily lower the current response.
    if (it.live) return null;
    return (
      <FilesRow
        key={it.id}
        item={it}
        liveDiffFiles={ctx.liveDiffFiles}
        onOpenFile={ctx.onOpenFile}
        onOpenDiff={ctx.onOpenDiff}
      />
    );
  }
  // Before folding into a note: `renderItem` ends with a catch-all NoteRow,
  // without this branch a line of reflection would go there.
  if (it.kind === "reasoning") {
    return (
      <ReasoningBlock key={it.id} active={it.active} durationMs={it.durationMs} text={it.text} />
    );
  }
  if (it.kind === "subagent") {
    return (
      <SubagentBlock
        key={it.id}
        subagentId={it.subagentId}
        mode={it.mode}
        steps={it.steps}
        report={it.report}
        error={it.error}
        delivered={it.delivered}
        partial={it.partial}
        startedAt={it.createdAt}
        endedAt={it.endedAt}
      />
    );
  }
  if (it.kind === "quota") {
    return (
      <QuotaExhaustedCard
        key={it.id}
        resetsAt={it.resetsAt}
        nextPlanId={it.nextPlanId}
        byok={it.byok}
        cause={it.cause}
        capPercent={it.capPercent}
      />
    );
  }
  return <NoteRow key={it.id} item={it} />;
}

/**
 * A turn: accordion of the unfolding (opened directly during work, closed all
 * alone when finished — see `WorkAccordion`, shared with Numo chat) + summary
 * final visible dessous.
 */
function TurnGroup({
  work,
  summary,
  files,
  startedAt,
  endedAt,
  active,
  interrupted,
  ctx,
}: {
  work: FeedItem[];
  summary: TurnCloser | null;
  files: FeedItem[];
  startedAt: string;
  endedAt: string | null;
  active: boolean;
  interrupted?: boolean;
  ctx: RenderContext;
}) {
  const filesContent = files.length > 0 ? (
    <>
      {files.map((it) => renderItem(it, ctx))}
    </>
  ) : null;
  const attachFilesToSummary =
    !!summary && summary.kind === "message" && !!summary.message.content && filesContent;

  return (
    <div className="flex flex-col gap-3">
      <WorkAccordion startedAt={startedAt} endedAt={endedAt} active={active}>
        {work.map((it) => renderItem(it, ctx))}
      </WorkAccordion>
      {summary ? renderItem(summary, ctx, attachFilesToSummary || undefined) : null}
      {/* Files changed from round: under the response, outside the working accordion. */}
      {!attachFilesToSummary ? filesContent : null}
      {interrupted ? <InterruptedRow /> : null}
    </div>
  );
}

/**
 * The tour stopped without responding. Without this line, an interrupted turn occurs
 * folds exactly like a round which has concluded, and nothing says that the answer
 * missing because it was cut - we look for it under the accordion.
 */
function InterruptedRow() {
  const t = useTranslations("Agent");
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <CircleSlash className="size-3 shrink-0" />
      {t("turnInterrupted")}
    </div>
  );
}

/**
 * Shutdown reasons NAMED by the harness → the sentence the user reads. All
 * what is not in this table keeps its text: a model error comes
 * from the provider, we don't translate it, we show it.
 */
const ERROR_CODE_KEYS: Record<string, MessageKey<"Agent">> = {
  turnTooLong: "errorTurnTooLong",
  turnTooBig: "errorTurnTooBig",
  turnHistoryReset: "errorTurnHistoryReset",
  replyIncomplete: "errorReplyIncomplete",
  providerUnavailable: "errorProviderUnavailable",
  // MIN-224: the microVM loop process died before concluding.
  // This was noticed by the watchdog (`reapDeadVmRuns`), and the session
  // taken from its last periodic backup — not from anything.
  turnLost: "errorTurnLost",
  // MIN-243: the same call, the same arguments and the same result, four times
  // in the last ten. The ride is cut before the budget does.
  toolLoop: "errorToolLoop",
  // MIN-286: the base refused the memory of the tour (a null byte in the output
  // of an order). Work is pushed to the branch.
  checkpointRefused: "errorCheckpointRefused",
  // MIN-329: the microVM announced an impossible expense (negative amount, excluding
  // terminals). The line is not written, and the thread says so rather than leaving a
  // Dumb hole in the meters.
  usageRejected: "errorUsageRejected",
};

/**
 * Why this run could not play on the machine (MIN-357) → what
 * the user reads. Both patterns come from `admitLocalRun`
 * ([lib/server/agent/local-exec.ts](../../lib/server/agent/local-exec.ts)) ; un
 * unknown pattern falls back on the generic phrase rather than nothing.
 */
const LOCAL_DECLINED_KEYS: Record<string, MessageKey<"Agent">> = {
  no_mint: "localDeclinedNoMint",
};

function NoteRow({ item }: { item: Extract<FeedItem, { kind: "note" }> }) {
  const t = useTranslations("Agent");
  if (item.variant === "error") {
    const key = item.code ? ERROR_CODE_KEYS[item.code] : undefined;
    return (
      <div className="flex items-start gap-2 text-sm text-destructive">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <span className="whitespace-pre-wrap">{key ? t(key) : item.text}</span>
      </div>
    );
  }
  if (item.variant === "reasoningUnsupported") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Brain className="size-3 shrink-0" />
        {t("reasoningUnsupported")}
      </div>
    );
  }
  if (item.variant === "providerRetry") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <CloudOff className="size-3 shrink-0" />
        {t("providerRetry")}
      </div>
    );
  }
  if (item.variant === "localDeclined") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Cloud className="size-3 shrink-0" />
        {t(LOCAL_DECLINED_KEYS[item.code ?? ""] ?? "localDeclined")}
      </div>
    );
  }
  if (item.variant === "currentRepoOverlap") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <GitCommit className="size-3 shrink-0" />
        {t("currentRepoOverlap", { count: item.count ?? 0 })}
      </div>
    );
  }
  // commit
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <GitCommit className="size-4 shrink-0" />
      {t("commitLabel")}
    </div>
  );
}

export function AgentEventFeed({
  runId,
  status,
  stopping = false,
  prompt,
  promptMentions,
  className,
  pendingUserMessages = [],
  onOpenFile,
  onOpenDiff,
  liveDiffFiles,
  hiddenQuestionEventId,
  localExec = false,
}: {
  /**
   * Session to follow, or `null` when it does not YET exist: the POST of
   * launch is in flight. The thread then has nothing to query and just
   * to display the optimistic bubble of the 1st message — same component, same layout
   * page, so no visual jump when the real session takes over.
   */
  runId: string | null;
  status: AgentRunStatus;
  /**
   * The user has just requested a shutdown. The waiter does not return his hand
   * that at the border of the round: the thread therefore stops IMMEDIATELY - the round in
   * course falls back over its duration - while POLLING continues over the
   * true status, since the last events of the tour have yet to arrive.
   */
  stopping?: boolean;
  /** Prompt launch, displayed at the top as 1st user bubble. */
  prompt?: string | null;
  promptMentions?: AssistantMention[] | null;
  className?: string;
  /** Makes diff block files clickable (opens the session diff view). */
  onOpenFile?: (path: string) => void;
  /** Opens the full diff view from the Review button on the final map. */
  onOpenDiff?: () => void;
  /** Exact live diff counters, used by the active round's file block. */
  liveDiffFiles?: LiveDiffStat[];
  /**
   * Event `question` ACTIVE (MIN-86): its living card is returned by the
   * conversation instead of the composer → its thread item is hidden here.
   */
  hiddenQuestionEventId?: string | null;
  /**
   * This run runs on the user's MACHINE (MIN-359).
   *
   * The thread says it in the head, once, before the first message: **a local run
   * is not a run cloud with another disk.** It opens a real folder, it
   * does not have a live diff (the route reads the microVM via RPC), and what
   * the agent reads it goes back in this thread. An environment toggle that does not
   * would read that by hovering over a chip of the composer would be a toggle that no one
   * ne voit.
   */
  localExec?: boolean;
  /**
   * Messages that the user just sent, not yet returned from the server.
   * A steering message only becomes a `user_message` event when the LOOP
   * drains it — sandbox wake-up included, i.e. several seconds. Without them, we
   * would hit the void: the bubble would only appear once the agent had left.
   */
  pendingUserMessages?: Array<{ text: string; mentions?: AssistantMention[] }>;
}) {
  const t = useTranslations("Agent");
  const tc = useTranslations("Common");
  // Two truths, and they only coincide without interruption:
  // • `polling` — what the SERVER does: as long as it is working, we query the
  // wire and we remain subscribed to the live. A requested stop changes nothing, it is
  // even there as the final events of the tour arrive.
  // • `active` — what the INTERFACE says: when you click on “stop”, it
  // stops without waiting for the server (the tower folds, the indicator
  //    « travaille » s'efface).
  const polling = isAgentRunWorking(status);
  const active = polling && !stopping;
  const { events, loading } = useAgentRunEventsQuery(runId, polling);
  // Direct: the text of the round while the model writes it, plus the events
  // pushed into the thread cache as soon as they are inserted (lib/use-agent-run-live).
  const live = useAgentRunLive(runId, polling);
  const feedRef = useRef<HTMLDivElement>(null);
  // Soft fade at the top/bottom of the thread (same pattern as the Kanban columns) → we see
  // that there is still content above/below. We merge his ref with ours.
  // `edges.end` (“there remains content below”) also controls the button
  // return to bottom: same measure, so never any disagreement between the fade and him.
  const { ref: fadeRef, scrollProps, edges } = useScrollFade<HTMLDivElement>();
  const setScrollNode = useCallback(
    (node: HTMLDivElement | null) => {
      feedRef.current = node;
      fadeRef(node);
    },
    [fadeRef],
  );
  const scrollToEnd = useCallback(() => {
    const node = feedRef.current;
    if (node) node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }, []);

  const { items, results, userTexts, sandboxReady } = useMemo(
    () => buildFeed(events, prompt, promptMentions),
    [events, prompt, promptMentions],
  );

  // Optimistic bubbles still to be displayed: duplicated against ALL texts
  // user received (bubbles AND answers absorbed by a question line).
  const stillPending = unechoedMessages(pendingUserMessages, userTexts);

  // IN-FLIGHT response to the last question (optimistic): attached immediately
  // to its line rather than displayed in a temporary bubble which would disappear when echoed.
  let displayItems = items;
  let displayPending = stillPending;
  if (stillPending.length > 0) {
    const last = [...items]
      .reverse()
      .find((it): it is MessageItem => it.kind === "message");
    if (
      last &&
      !last.askUserAnswer &&
      last.message.tool_calls?.some((tc) => tc.function.name === "ask_user")
    ) {
      displayItems = items.map((it) =>
        it === last ? { ...it, askUserAnswer: stillPending[0].text } : it,
      );
      displayPending = stillPending.slice(1);
    }
  }

  // LIVE tail of the current round, added at the end of the thread: the indicator of
  // reflection and the text as it is written, in the order in which their true events occur
  // will pose (reflection first, response then) — the shift from provisional to
  // definitive therefore does not move anything on the screen.
  const liveItems = useMemo((): FeedItem[] => {
    // Stop requested: the live tail disappears with the rest of the signs of
    // work. Otherwise it would continue writing for two or three seconds
    // under a turn which is said to be finished.
    if (!live || stopping) return [];
    const out: FeedItem[] = [];
    if (live.reasoningActive) {
      // Compact line + counter, NOT the text of the reasoning: it is not
      // streamed. Its trace arrives with the end of round event, folded.
      out.push({
        kind: "reasoning",
        id: "live-reasoning",
        active: true,
        durationMs: live.reasoningMs,
        text: "",
        createdAt: live.startedAt,
      });
    }
    if (live.text.trim()) {
      out.push({
        kind: "message",
        message: makeMessage("live-text", live.text),
        createdAt: live.startedAt,
        // A tool already initiated in this round ⇒ this text is narration, it
        // remains in progress. Otherwise it aims for the place of the final answer.
        isLiveAnswer: live.tools === 0,
      });
    }
    // Files from the CURRENT tour, as the tools touched them — provisional
    // until the end of turn `files_changed`, which replaces them with the counters
    // from git. The server removes the list at the time of relay: the two blocks do not
    // superposent pas.
    if (live.files.length > 0) {
      out.push({
        kind: "files",
        id: "live-files",
        files: live.files,
        truncated: live.filesTruncated,
        createdAt: live.startedAt,
        live: true,
      });
    }
    return out;
  }, [live, stopping]);

  const blocks = useMemo(
    () => buildBlocks(liveItems.length ? [...displayItems, ...liveItems] : displayItems, active),
    [displayItems, liveItems, active],
  );

  // Copy button under the RESPONSE OF EACH ROUND (the summary which closes it), not under the
  // only last message of the session: a session has several and each
  // of these answers is copied. Intermediate messages (work progress) do not
  // have not — they are not answers.
  //
  // As long as the agent WORKS, his living head does not carry any either: it is not
  // that the narration of the moment, and the button jumped from message to message over the
  // of work. Falling back on the last message is only used for rounds WITHOUT summary
  // (interrupted run, error): this message IS the end of the response.
  const copyableIds = useMemo(() => {
    const ids = new Set<string>();
    let lastAssistant: string | null = null;
    for (const it of items) {
      if (it.kind !== "message" || it.message.role !== "assistant" || !it.message.content) continue;
      lastAssistant = it.message.id;
      if (it.isSummary) ids.add(it.message.id);
    }
    if (lastAssistant && !active) ids.add(lastAssistant);
    return ids;
  }, [items, active]);

  // The thread settles at the bottom when the session OPENS (and each time the session changes).
  // session): we arrive where the work happens. useLayoutEffect → no flash
  // “scroll from the top” before painting. We wait for the events of the session
  // are THERE: the launch prompt is displayed as soon as the session changes
  // (it comes from the prop) — anchoring on this bubble alone would leave the thread at the top
  // unfolded a second later.
  //
  // Then, nothing moves on its own. The thread previously followed each event and
  // each push of the live text: impossible to reread a step of work, the
  // next tore the view down. While the agent works, the view remains
  // so where the user left it, and the content grows underneath.
  const anchoredRunRef = useRef<string | null | undefined>(undefined);
  useLayoutEffect(() => {
    const node = feedRef.current;
    if (!node || loading || items.length === 0) return;
    if (anchoredRunRef.current === runId) return;
    node.scrollTop = node.scrollHeight;
    anchoredRunRef.current = runId;
  }, [runId, loading, items.length]);

  // A message from the user, HIM, follows: it is his gesture, and his bubble must
  // to be before his eyes. The in-flight message count only goes up when sent.
  const pendingCount = pendingUserMessages.length;
  const lastPendingCountRef = useRef(pendingCount);
  useLayoutEffect(() => {
    const node = feedRef.current;
    if (node && pendingCount > lastPendingCountRef.current) {
      node.scrollTop = node.scrollHeight;
    }
    lastPendingCountRef.current = pendingCount;
  }, [pendingCount]);

  const ctx: RenderContext = {
    results,
    copyableIds,
    // On a local run, the server cannot open the repository for its request
    // of diff. The harness then publishes its own Git counters directly;
    // they are cooler than HTTP fallback and cause `+ / −` to appear in
    // the block of the tour from the edition.
    liveDiffFiles:
      live?.fileStats.length
        ? live.fileStats.map((file) => ({
            filename: file.path,
            additions: file.additions,
            deletions: file.deletions,
            ...(file.previousPath ? { previous_filename: file.previousPath } : {}),
          }))
        : liveDiffFiles ?? [],
    onOpenFile,
    onOpenDiff,
    hiddenQuestionEventId,
  };
  // The active turn (open accordion “Work from X”) already carries the signal
  // « travaille » → on ne montre l'indicateur du bas que sans tour actif encore.
  const hasActiveTurn = blocks.some((b) => b.type === "turn" && b.active);
  // As soon as the agent emits text, the interface already has something more
  // just to show that “works”. We are NOT limited to `isLiveAnswer`:
  // after a tool call, the final text keeps track of this tool and is not
  // so not marked as a final answer by thread grouping.
  const agentTextStreaming = liveItems.some((item) => item.kind === "message");
  /**
   * The agent has left but nothing is visible of him yet. Two very moments
   * different under this same appearance, and it is the `sandbox_ready` event which
   * separated :
   * • BEFORE — the microVM wakes up and the repository restores: no one
   * still working, we open the sandbox (several seconds);
   * • AFTER — the machine is there and the agent is thinking; his first step is not
   * simply not yet installed (a turn may not emit anything until it is
   * final answer). There, “works” is the truth.
   * As soon as a step appears, the active lap takes over and keeps the clock running.
   */
  // Locally there is no sandbox to wait for: upon sending, the request and
  // pre-flights of the Mac process are already part of the tour work. Keep
  // “session start” until the first delta of the model passed
  // its reflection time (and the first non-displayable deltas) for booting.
  // The cloud retains its real explicit boundary `sandbox_ready`.
  const runtimeReady = sandboxReady || localExec;
  const startingSandbox = active && !hasActiveTurn && !runtimeReady;
  const workingSilently =
    active && !hasActiveTurn && !agentTextStreaming && runtimeReady;
  // Nothing at all, and no one at work: the session has nothing to say.
  const emptyAtRest =
    !active && blocks.length === 0 && displayPending.length === 0 && !loading;

  return (
    <div
      ref={setScrollNode}
      {...scrollProps}
      className={cn("flex flex-col overflow-y-auto overscroll-contain", className)}
    >
      {/* The thread starts from the TOP, under the conversation header, and goes down to
 the input — like a page that fills up.
 It was stuck at the BOTTOM (`mt-auto`) as long as it was short: each block that arrived then pushed the whole thread up, and the launch of a
 session — where the sandbox, the first step and the first response fall in
 a few seconds — was seen as a series of jumps.
 Width bounded + centered, with the SAME horizontal indent (px-3) as the
 compose `ChatInput` → messages and input strictly at the same width. */}
      <div className="mx-auto flex w-full max-w-[800px] flex-col gap-3 px-3">
        {blocks.map((block) =>
          block.type === "turn" ? (
            <TurnGroup
              key={block.key}
              work={block.work}
              summary={block.summary}
              files={block.files}
              startedAt={block.startedAt}
              endedAt={block.endedAt}
              active={block.active}
              interrupted={block.interrupted}
              ctx={ctx}
            />
          ) : (
            renderItem(block.item, ctx)
          ),
        )}
        {/* Sent, not yet back from server. Rendered AFTER the blocks (and not
 injected into `items`): a user message closes the current round, so
 slipping them into the flow would fold the live work accordion. */}
        {displayPending.map((pending, i) => (
          <ChatMessage
            key={`pending-${i}-${pending.text}`}
            /* The mentions come from THIS post, not from a namesake: two
 “ok” following which only one cites a ticket should not
 exchange their pills. */
            message={makeMessage(`pending-${i}`, pending.text, "user", pending.mentions)}
            toolCallResults={results}
          />
        ))}
        {/* These two lines take the place of the first block to come: they are
 IN the thread, at its width and at its anchor. Opening the sandbox
 is therefore displayed exactly where the work will be written, and the succession does not move anything. */}
        {startingSandbox || workingSilently ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <NumoIcon state="thinking" className="size-4 shrink-0 text-muted-foreground" />
            <span className="text-shimmer">
              {startingSandbox
                ? // A local turn does not open ANY sandbox (MIN-293): between the
                  // launch and the first step, what happens is the
                  // downloading the harness and opening the deposit on the
                  // machine. To say “sandbox” here would be wrong, and that would be the
                  // first thing the user reads from a local run.
                  t(localExec ? "openingLocalTurn" : "openingSandbox")
                : t("working")}
            </span>
          </div>
        ) : emptyAtRest ? (
          <p className="text-sm text-muted-foreground">{t("noActivity")}</p>
        ) : null}
      </div>
      {/* Back to the bottom, on par with Numo's thread: the thread no longer follows the agent,
 this button is therefore the shortcut to catch up at the end. __keep au
 blocks the height of its button). And he stands above the 2 rem of the fade
 of bottom wire, which would wash him out if he went down into it. */}
      {edges.end ? (
        <div className="sticky bottom-10 z-10 flex h-0 min-h-0 items-end justify-center">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={tc("scrollToBottom")}
            title={tc("scrollToBottom")}
            onClick={scrollToEnd}
            className="rounded-full bg-background shadow-sm dark:bg-background dark:hover:bg-muted"
          >
            <ArrowDown className="size-4" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
