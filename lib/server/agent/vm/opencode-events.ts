import { cap, toolArgSummary } from "../tool-summary";
import { parseAskUserQuestions, type AskUserQuestion } from "@/lib/ask-user";
import type { AgentEventType } from "@/lib/agent-api";

export interface PermissionAsk {
  id: string;
  sessionId: string;
  permission: string;
  callId: string;
  command?: string;
  filepath?: string;
  files?: Array<{ path: string; status: "added" | "modified" | "deleted" }>;
  subagentType?: string;
  url?: string;
}

/**
 * THE OPENCODE FLOW, TRANSLATED INTO OUR WIRE (MIN-286, batch 1).
 *
 * A PUR module: it takes an event from opencode `/event` and renders what the
 * supervisor must issue. No IO, no network state — therefore testable on
 * **actually captured fixtures** ([fixtures/opencode-turn.ndjson](fixtures/opencode-turn.ndjson),
 * a complete turn with call of tool), what the translation made over time
 * in an HTTP client would never have allowed.
 *
 * WHAT THE TRANSLATION MUST HOLD, and this is the tipping point for lot 3: **the
 * thread says the same thing**. Same types of events, same payloads, same order.
 * A `tool_call` whose payload changes form breaks the display of the feed AND the
 * replaying a past run, since `agent_run_events` does not keep anything else.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT WAS MEASURED (real server, full tour captured on 2026-08-12)
 *
 * - un appel de tool passe par **trois** `message.part.updated` : `pending`
 * (the input is still empty), `running` (complete input, `time.start`), then
 * `completed` (output, `time.end`) or `error`. It is `running` which is worth our
 * `tool_call` — on `pending`, we cannot tell WHAT is called;
 * - the text of the response arrives in `message.part.delta` (`field: "text"`,
 * `delta`), then the complete part in `message.part.updated`;
 * - the cost of the round arrives on `message.updated` of the assistant message, twice
 * (the same number): hence the deduplication by `messageID` + `finish`;
 * - `session.status` alternates `busy`/`idle`, and `session.idle` ends the round.
 *
 * NAMES ARE TRANSLATED IN BOTH DIRECTIONS. Opencode calls `read` which we
 * let's call `read_file`, and pass `filePath` where we pass `path`. The thread,
 * he knows how to display `read_file`/`path` — and replaying a run from three
 * month too. Translating here is therefore the only place where it costs nothing; do it
 * in the UI would have required keeping both vocabularies there forever.
 */

/** An event from the `/event` stream, as opencode publishes it. */
export interface OpencodeEvent {
  type: string;
  properties?: Record<string, unknown>;
}

/** What the supervisor should emit — an event from OUR thread. */
export interface TranslatedEvent {
  type: AgentEventType;
  payload: Record<string, unknown>;
}

/** The cost and tokens of a round, noted on the assistant message. */
export interface RoundUsage {
  messageId: string;
  /** The session that paid for this round — the mother, or a daughter (see `sessionId`). */
  sessionId: string;
  model: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** `stop`, `tool_calls`, `length`… — as opencode renders it. */
  finish: string | null;
}

/** What a translated event produces: events, live, account. */
export interface Translation {
  /**
   * THE SESSION WHERE THE EVENT COMES FROM, and that’s what holds lot 2.
   *
   * The `/event` flow is that of the SERVER, not of a session: when the model
   * delegates (`task`), the girl opens her own session and events
   * arrive here, mixed with those of the mother. Three things depend on it, and each
   * breaks silently without this field: a `session.idle` of GIRL would end the
   * mother's turn, the daughter's text would enter into the response (so in
   * the commit message), and its expenditure would fall into the seq band of the
   * parent instead of his own.
   */
  sessionId?: string;
  events: TranslatedEvent[];
  /** The text of the round as written so far (FULL, not a delta). */
  liveText?: string;
  /**
   * THE MODEL IS THINKING RIGHT NOW, and for how long.
   *
   * What the wire does with it is what it did with the house loop (MIN-122): a
   * compact line with a counter, NEVER the text — it arrives folded with
   * the end of game `thinking` event. This is the only sign of life of a model
   * `reasoning_level: high`, who can think for several minutes before writing his
   * first word; without it, the thread remains silent and the trick looks dead.
   */
  reasoning?: { active: boolean; startedAt: number };
  /** An assistant round has ended: his ledger line is ready. */
  usage?: RoundUsage;
  /** The round is over (`session.idle`). */
  idle?: boolean;
  /** The trick is dead (`session.error`) — the message is that of opencode. */
  error?: string;
  /**
   * THE ROUND WAS CUT (`MessageAbortedError`) — without saying by whom.
   *
   * Opencode publishes the same thing for a DESIRED break (our `abort`) and for
   * an outage SUFFERED (supplier flow cut in flight). The translator cannot
   * cannot decide: only he knows that it is a cut, only the caller knows if he
   * asked her. Hence this flag rather than a `error` — cf. the custody of
   * supervisor, who only makes it a breakdown if he hasn't asked for anything.
   */
  aborted?: true;
  /** A tool awaits OpenCode's permission reply; the supervisor auto-grants it. */
  permission?: PermissionAsk;
  /** The model asks its questions (`question.asked`): this is our `ask_user`. */
  question?: { id: string; callId: string; questions: AskUserQuestion[] };
  /**
   * A GIRL HAS JUST BEEN BORN, and this is what `task` call she is attached to.
   *
   * This is the only frame that says it: the tool `task` places on its part a
   * `state.metadata = {parentSessionId, sessionId, model}` (measured on
   * 2026-08-12, delegation probe), and it arrives BEFORE the first message from
   * the girl. Without this connection, the girl's events cannot carry
   * the `parent_call_id` under which the thread folds them, and its expenditure does not know
   * in which band of `seq` to be written.
   */
  child?: { sessionId: string; callId: string; agent: string; model?: string };
  /**
   * A MODEL COMMAND HAS JUST COMPLETED, with its exit code.
   *
   * This is what `run_command` read at home, and what the door of
   * delivery needs to shut up when the model started the tests itself
   * (MIN-262, `VerificationSink`). The opencode tool `bash` places it on
   * `state.metadata.exit` — a number, `null` when the command was aborted
   * or killed by the timeout. Absent = we conclude nothing, which is the meaning
   * careful: the door then restarts the entire sequence.
   */
  shell?: { command: string; exit: number };
}

/**
 * THE NAMES OF TOOLS, FROM OPENCODE TO OURS.
 *
 * `webfetch` is not there: we never had this tool, so the thread has no
 * name to oppose to it - it passes as is, and it is one more name in the vocabulary
 * rather than a mistranslated name. `question` either: it does not become a
 * `tool_call` mais un event `question`, qui a sa propre forme.
 */
const TOOL_NAMES: Record<string, string> = {
  read: "read_file",
  write: "write_file",
  edit: "edit_file",
  bash: "run_command",
  task: "spawn_agent",
  // These already bear our name: writing them makes the table immediately readable
  // by eye, and above all verifiable — “are the 14 integrated ones all processed? ".
  glob: "glob",
  grep: "grep",
  apply_patch: "apply_patch",
};

/**
 * ARGUMENTS, likewise. The table is by tool and by field, because it is the
 * only form that can be reread: `filePath → path` on `read`, `include → glob` on
 * `grep`. A field missing from the table passes as is — our domain tools, for their part,
 * have our names exactly, since we generated them.
 */
const TOOL_ARGS: Record<string, Record<string, string>> = {
  read: { filePath: "path" },
  write: { filePath: "path" },
  edit: {
    filePath: "path",
    oldString: "old_string",
    newString: "new_string",
    replaceAll: "replace_all",
  },
  bash: { command: "command", workdir: "workdir" },
  grep: { include: "glob" },
  task: { subagent_type: "mode", description: "task" },
  /**
   * `patchText`, and that's all this tool takes (measured on the binary:
   * `patchText: p.String.annotate({description: "The full patch text…"})`). Notre
   * summary reads `patch` to count the `*** Update File:` headers of the
   * Codex dialect — that’s where counting and paths of sight come from
   * “files changed”.
   *
   * Without this line, `toolArgSummary` found nothing and the thread announced
   * **"Patch of 0 files"** each time a `gpt-*` run is edited — i.e.
   * on the only editing path that these models have.
   */
  apply_patch: { patchText: "patch" },
};

/**
 * `metadata.files` of a permission request → our paths, one per file.
 *
 * It is `apply_patch` who asks, and he alone: ​​his request is UNIQUE for a
 * patch which affects N files, and its `metadata.filepath` is only
 * `chemins.join(", ")`. Measured on binary (1.18.16): each input is
 * `{type: "add"|"update"|"delete", filePath, relativePath, patch, additions,
 * deletions, movePath?}`.
 *
 * We keep `filePath` (absolute): this is what the safeguard compares to the deposit, and
 * what `repoRelative` knows how to bring back for display — exactly like the
 * `filepath` of a `edit`. Unreadable input is ignored rather than guessed:
 * the list serves as a safeguard, an unexpected form does not have to enter into it
 * silence.
 */
/**
 * The URL of a request for `webfetch` (MIN-360), and that one only.
 *
 * `metadata.url` first; failing that the first `patterns`, which is the string on
 * which opencode would match an “always” — therefore the best
 * approximation of the target the day the metadata changes form. This fallback is
 * the reason why the field is reserved for `webfetch`: on a `bash`,
 * `patterns` carries the COMMAND, and copying it into “url” would be a lying field.
 *
 * Empty rather than guessed: audit data must not invent a destination.
 */
/**
 * THE PATH OF A REQUEST, AND IT IS NOT IN THE SAME PLACE ACCORDING TO THE TOOL (MIN-360).
 *
 * A writing publishes `metadata.filepath`, absolute. **A reading publishes a
 * `metadata` VIDE** : `ReadTool` appelle
 * `ask({permission: "read", patterns: [<chemin relatif au worktree>], always: ["*"],
 * metadata: {}})` — found in binary 1.18.16.
 *
 * The field retains one meaning for audit events: “the path this request refers to.”
 */
function permissionPath(
  props: Record<string, unknown>,
  metadata: Record<string, unknown>,
): string {
  if (typeof metadata.filepath === "string" && metadata.filepath.trim())
    return metadata.filepath;
  // `external_directory` carries its path into `metadata.parentDir` (measured,
  // MIN-364): without it, the trace on the wire would say “the agent is removed from the file”
  // without ever saying where - therefore exactly the opposite of what is asked of him.
  if (String(props.permission ?? "") === "external_directory") {
    return typeof metadata.parentDir === "string"
      ? metadata.parentDir.trim()
      : "";
  }
  if (String(props.permission ?? "") !== "read") return "";
  const patterns = Array.isArray(props.patterns) ? props.patterns : [];
  const first = patterns.find(
    (p) => typeof p === "string" && p.trim() && p !== "*",
  );
  return typeof first === "string" ? first.trim() : "";
}

function permissionUrl(
  props: Record<string, unknown>,
  metadata: Record<string, unknown>,
): string {
  if (String(props.permission ?? "") !== "webfetch") return "";
  if (typeof metadata.url === "string" && metadata.url.trim())
    return metadata.url.trim();
  const patterns = Array.isArray(props.patterns) ? props.patterns : [];
  const first = patterns.find((p) => typeof p === "string" && p.trim());
  return typeof first === "string" ? first.trim() : "";
}

function permissionFiles(
  metadata: Record<string, unknown>,
): { path: string; status: "added" | "modified" | "deleted" }[] {
  if (!Array.isArray(metadata.files)) return [];
  const out: { path: string; status: "added" | "modified" | "deleted" }[] = [];
  for (const raw of metadata.files) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    const path =
      typeof entry.filePath === "string" && entry.filePath.trim()
        ? entry.filePath
        : typeof entry.relativePath === "string"
          ? entry.relativePath
          : "";
    if (!path.trim()) continue;
    const type = String(entry.type ?? "");
    out.push({
      path,
      status:
        type === "add" ? "added" : type === "delete" ? "deleted" : "modified",
    });
  }
  return out;
}

/** The tool name that the thread knows. */
export function ourToolName(opencodeName: string): string {
  return TOOL_NAMES[opencodeName] ?? opencodeName;
}

/** The arguments of a tool, renamed so that `toolArgSummary` recognizes them. */
export function ourToolArgs(
  opencodeName: string,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const table = TOOL_ARGS[opencodeName];
  if (!table) return input;
  return Object.fromEntries(
    Object.entries(input).map(([k, v]) => [table[k] ?? k, v]),
  );
}

/** Length of preview persisted in `tool_result` — the same as the loop. */
const PREVIEW_MAX = 400;

function numberAt(source: unknown, ...path: string[]): number {
  let node: unknown = source;
  for (const key of path) {
    if (!node || typeof node !== "object") return 0;
    node = (node as Record<string, unknown>)[key];
  }
  return typeof node === "number" && Number.isFinite(node) ? node : 0;
}

/**
 * The state of a turn, between two events. The translator is pure, but the flow is not
 * is not: a `delta` only carries its fragment, and a repeated `message.updated`
 * carries twice the same cost.
 */
export interface TurnStreamState {
  /**
   * Accumulated text of the current round, PER SESSION then per part.
   *
   * The double key is not prudence: a girl writes her report
   * while the mother waits, and just one bag would bring this report into the
   * round response — so in the commit message, and in what the thread
   * displays as the agent's word.
   */
  textByPart: Map<string, Map<string, string>>;
  /**
   * The text of the LAST completed round, per session — the response of the round.
   *
   * It exists because `textByPart` is emptied at the end of each round (the direct
   * must start from scratch, otherwise two rounds pile up on the screen) and the end
   * of round arrives BEFORE `session.idle`. Without this copy, what the trick renders
   * as a response is systematically empty: the thread displays nothing, and the
   * commit message falls back to its generic form.
   */
  lastRoundText: Map<string, string>;
  /**
   * WHAT NATURE IS EACH PART, and this is what separates reflection from
   * answer.
   *
   * Opencode publishes deltas on the one hand `reasoning` with **the same
   * `field: "text"`** than those on the one hand `text` (read in binary 1.18.16:
   * `case "reasoning-delta"` calls `updatePartDelta({… field:"text"})`). A
   * delta frame therefore says NOTHING about what it transports — only the
   * The opening `message.part.updated` says it, and it happens before.
   *
   * Without this table, the chain of thought entered the text of the round: it
   * was displayed as the agent's words, it returned in the message from
   * commit, and the thread's reflection counter remained off.
   */
  partKind: Map<string, "text" | "reasoning">;
  /**
   * MESSAGES THAT COME FROM US, not from the model.
   *
   * A prompt posted to the session is republished as `message.part.updated` of type
   * `text`, in the same flow and in the same form as the response. Without this
   * filter, the user's request entered the bag of the round: it
   * came out at the top of “what the turn answered”, therefore in the thread and in
   * the commit message (measured on the reflection fixture, where the response from the
   * round started with “say hello”).
   */
  userMessages: Set<string>;
  /** Start (ms) of each reflection part — the duration the thread displays. */
  reasoningStart: Map<string, number>;
  /** Rounds whose cost has already been counted (`messageID`). */
  billed: Set<string>;
  /** `callID` already announced: `running` can be repeated. */
  announced: Set<string>;
  /**
   * Complete arguments of the tool, indexed by call. A `read` permission on the
   * RACINE publie `patterns: [""]` (`relative(root, root)`), donc son seul chemin
   * exploitable is that of the part `running` which precedes it.
   */
  toolInputByCall: Map<string, Record<string, unknown>>;
}

export function newTurnStreamState(): TurnStreamState {
  return {
    textByPart: new Map(),
    lastRoundText: new Map(),
    partKind: new Map(),
    userMessages: new Set(),
    reasoningStart: new Map(),
    billed: new Set(),
    announced: new Set(),
    toolInputByCall: new Map(),
  };
}

/** The text bag of a session, created on demand. */
function partsOf(
  state: TurnStreamState,
  sessionId: string,
): Map<string, string> {
  let parts = state.textByPart.get(sessionId);
  if (!parts) {
    parts = new Map();
    state.textByPart.set(sessionId, parts);
  }
  return parts;
}

/**
 * Where does the event come from? `properties.sessionID` is placed on ALL frames
 * measured (fixation captured); both folds read the same one layer
 * lower, so that a frame from a future version that forgets it does not get stored
 * not silently in the empty session — that is, in the mother's.
 */
function sessionOf(props: Record<string, unknown>): string {
  const direct = props.sessionID;
  if (typeof direct === "string" && direct) return direct;
  for (const key of ["part", "info"]) {
    const node = props[key];
    if (node && typeof node === "object") {
      const nested = (node as Record<string, unknown>).sessionID;
      if (typeof nested === "string" && nested) return nested;
    }
  }
  return "";
}

/**
 * Translated AN event. Renders what to emit, and mutes the stream state.
 *
 * Never rises: the flow comes from a third party, and an unexpected shape must be
 * ignored, not kill a two-hour tour. What is not recognized does not produce
 * nothing — that's what `events: []` means.
 */
export function translateEvent(
  event: OpencodeEvent,
  state: TurnStreamState,
): Translation {
  const props = event.properties ?? {};
  const sessionId = sessionOf(props);

  switch (event.type) {
    case "message.part.delta": {
      if (props.field !== "text") return { sessionId, events: [] };
      const partId = String(props.partID ?? "");
      const delta = typeof props.delta === "string" ? props.delta : "";
      if (!partId || !delta) return { sessionId, events: [] };
      if (state.userMessages.has(String(props.messageID ?? ""))) {
        return { sessionId, events: [] };
      }
      /**
       * A REFLECTION DELTA ALSO HAS `field: "text"` (see `partKind`):
       * what separates them is the part, announced earlier. It therefore does not join the
       * bag of the round — it makes the thought meter tick, and that's it.
       */
      if (state.partKind.get(partId) === "reasoning") {
        return {
          sessionId,
          events: [],
          reasoning: reasoningTick(state, partId),
        };
      }
      const parts = partsOf(state, sessionId);
      const text = (parts.get(partId) ?? "") + delta;
      parts.set(partId, text);
      return { sessionId, events: [], liveText: text };
    }

    case "message.part.updated": {
      const part = (props.part ?? {}) as Record<string, unknown>;
      const partId = String(part.id ?? "");
      // Our own prompt, republished by the session: it has nothing to do in
      // what the turn responded (see `userMessages`).
      if (state.userMessages.has(String(part.messageID ?? ""))) {
        return { sessionId, events: [] };
      }
      if (part.type === "text") {
        // Marked even when the text is empty: it is the OPENING frame, the one
        // which arrives before the deltas, and the only one which says what they are made of.
        if (partId) state.partKind.set(partId, "text");
        const text = typeof part.text === "string" ? part.text : "";
        if (partId && text) partsOf(state, sessionId).set(partId, text);
        return { sessionId, events: [], ...(text ? { liveText: text } : {}) };
      }
      if (part.type === "reasoning")
        return reasoningPart(state, sessionId, part, partId);
      if (part.type !== "tool") return { sessionId, events: [] };

      const stateNode = (part.state ?? {}) as Record<string, unknown>;
      const status = String(stateNode.status ?? "");
      const callId = String(part.callID ?? part.id ?? "");
      const opencodeName = String(part.tool ?? "");
      const name = ourToolName(opencodeName);
      const input = ourToolArgs(
        opencodeName,
        (stateNode.input ?? {}) as Record<string, unknown>,
      );
      if (callId && Object.keys(input).length > 0)
        state.toolInputByCall.set(callId, input);

      /**
       * THE ATTACHMENT OF A GIRL, to read on ALL statuses from `task`.
       *
       * Measured: the first `running` arrives without `metadata` (the girl does not exist
       * not yet), the second carries it. Read it out of the `running` block below
       * is therefore not prudence: it is the only useful frame, and it is
       * a repeat of that which has already been announced.
       */
      const child =
        opencodeName === "task" ? childOf(stateNode, callId, input) : undefined;

      if (status === "running") {
        // `pending` does not yet say WHAT is called (`input: {}` measured): a
        // event emitted there would show a call with no arguments, then nothing.
        if (!callId || state.announced.has(callId)) {
          return { sessionId, events: [], ...(child ? { child } : {}) };
        }
        state.announced.add(callId);
        return {
          sessionId,
          ...(child ? { child } : {}),
          events: [
            {
              type: "tool_call",
              payload: { id: callId, name, ...toolArgSummary(name, input) },
            },
          ],
        };
      }

      if (status === "completed" || status === "error") {
        const success = status === "completed";
        const raw = success
          ? stateNode.output
          : (stateNode.error ?? stateNode.output);
        const preview = cap(
          typeof raw === "string" ? raw : JSON.stringify(raw ?? ""),
          PREVIEW_MAX,
        );
        const shell =
          opencodeName === "bash" ? shellOf(stateNode, input) : undefined;
        return {
          sessionId,
          events: [
            {
              type: "tool_result",
              payload: { id: callId, name, success, preview },
            },
          ],
          ...(shell ? { shell } : {}),
        };
      }
      return { sessionId, events: [] };
    }

    case "message.updated": {
      const info = (props.info ?? {}) as Record<string, unknown>;
      if (info.role !== "assistant") {
        // The only place in the flow that says the ROLE of a message: the message frames
        // However, they don't wear any. We therefore remember it in passing — this is what
        // which will allow us to dismiss the shares of our own prompt.
        if (info.role === "user" && typeof info.id === "string" && info.id) {
          state.userMessages.add(info.id);
        }
        return { sessionId, events: [] };
      }
      const finish = typeof info.finish === "string" ? info.finish : null;
      // An unfinished round arrives with `cost: 0` and no `finish`: the
      // count would write an empty ledger line, then a second one to the real one
      // cost. And `message.updated` repeats itself identically when finished —
      // hence the two guards, who do not do the same job.
      if (!finish) return { sessionId, events: [] };
      const messageId = String(info.id ?? "");
      if (!messageId || state.billed.has(messageId))
        return { sessionId, events: [] };
      state.billed.add(messageId);

      // A round is finished: we KEEP our text (this is the answer for the round) before
      // empty the bag, so that the next one starts from scratch. And we only empty
      // THIS session: erasing that of others would take away, in mid-flight, the
      // report that a girl is writing.
      const written = liveTextOf(state, sessionId);
      if (written.trim()) state.lastRoundText.set(sessionId, written);
      partsOf(state, sessionId).clear();

      /**
       * THE NARRATION OF AN INTERMEDIATE ROUND — what the model writes BETWEEN two
       * series of calls to tools, and which did not exist anywhere under opencode.
       *
       * The direct showed it then erased it (the bag of the round is emptied just
       * above, and nothing took over): on the screen, the agent's text
       * appeared for a few seconds then disappeared forever.
       * It's the `thinking` without `kind` of the home loop, to the word — same
       * type, same limit of 2,000 characters, same bubble rendering.
       *
       * Only rounds that CONTINUE (`finish: "tool-calls"`) emit it: the
       * text of the last round is the response of the round, and it goes to `summary`
       * (capped at 8,000). Emitting both would make two bubbles as soon as the response
       * exceeds 2,000 characters — the deduplication of the thread is done by equality of
       * text, and two different ceilings are no longer equal.
       *
       * The test therefore concerns `tool-calls` and NOT “different from `stop`”:
       * `tool-calls` is the only end that lets the session work. All
       * others (`length`, `content-filter`, `error`, `other`…) put the session
       * at rest, so complete the round — their text is the answer, and the
       * negation made them go TWICE, in `thinking` then in `summary`.
       */
      const narration = finish === "tool-calls" ? written.trim() : "";

      return {
        sessionId,
        events: narration
          ? [{ type: "thinking", payload: { text: cap(narration, 2000) } }]
          : [],
        usage: {
          messageId,
          sessionId,
          model: String(info.modelID ?? ""),
          costUsd: numberAt(info, "cost"),
          inputTokens: numberAt(info, "tokens", "input"),
          outputTokens: numberAt(info, "tokens", "output"),
          reasoningTokens: numberAt(info, "tokens", "reasoning"),
          cacheReadTokens: numberAt(info, "tokens", "cache", "read"),
          cacheWriteTokens: numberAt(info, "tokens", "cache", "write"),
          finish,
        },
      };
    }

    case "session.idle":
      // `idle` is valid for ITS session: it is the caller who knows which one is
      // mother. A resting girl does not complete the round.
      return { sessionId, events: [], idle: true };

    case "session.error": {
      const error = (props.error ?? {}) as Record<string, unknown>;
      /**
       * AN OUTAGE IS NOT A FAILURE **WHEN REQUESTED**, and opencode does not
       * makes no difference: all `abort` publishes `session.error` with
       * `name: "MessageAbortedError"` (measured). But we cut the turn OURSELVES
       * in three desired cases — the spending ceiling, the question posed to
       * the user, the deadline. Without filter, each of the three wrote an event
       * `error` to the thread and a `errorMessage: "Aborted"` to the rapport, over the
       * vrai motif.
       *
       * But the filter cannot be UNCONDITIONAL, and that's what it was:
       * a cut that no one requested (provider feed cut in flight)
       * disappeared with him, and the turn was classified as “finished” without a
       * line — thread frozen on “Opening the sandbox”, run without summary or
       * error, ledger expense. Observed on run `ec9b2ed5` (2026-08-12,
       * `openai/gpt-5.6-luna`): 219 tokens billed, assistant message WITHOUT any
       * part, `MessageAbortedError`, and nothing anywhere.
       *
       * We therefore return the cut to the supervisor, who is the only one to know if he has it
       * requested.
       */
      if (error.name === "MessageAbortedError") {
        /**
         * A CUT ROUND CLOSES ITS BAG, like a finished round (MIN-286).
         *
         * The text bag was only emptied at the end of a CHARGED round
         * (`message.updated` with `finish`) — but an aborted round does not have one. THE
         * fragment written before the cut therefore remained in the bag of the session,
         * and a lap resumed behind (steering: `abort` then new prompt on
         * the SAME session) glued this fragment back together in front of everything that followed: the
         * direct, the round response, the `summary` and the commit message.
         *
         * It is kept as the last known text, exactly like the end of
         * round: when the cut ENDS the round (“Stop”, ceiling, deadline),
         * This is still the most recent thing the agent said.
         */
        const cut = liveTextOf(state, sessionId);
        if (cut.trim()) state.lastRoundText.set(sessionId, cut);
        partsOf(state, sessionId).clear();
        return { sessionId, events: [], aborted: true };
      }
      const data = (error.data ?? {}) as Record<string, unknown>;
      const message =
        typeof error.message === "string"
          ? error.message
          : typeof data.message === "string"
            ? data.message
            : typeof props.message === "string"
              ? props.message
              : JSON.stringify(error).slice(0, 1000);
      return {
        sessionId,
        events: [{ type: "error", payload: { message } }],
        error: message,
      };
    }

    /**
     * A SUSPENDED TOOL WHICH AWAITS OUR VERDICT. The measured payload:
     * `{id, sessionID, permission, patterns, metadata, always, tool:{messageID, callID}}`.
     * Nothing is sent to the wire here — a refusal is reported in the `tool_result` of the
     * tool refused, exactly as the home loop told.
     */
    case "permission.asked": {
      const id = String(props.id ?? "");
      if (!id) return { sessionId, events: [] };
      const metadata = (props.metadata ?? {}) as Record<string, unknown>;
      const tool = (props.tool ?? {}) as Record<string, unknown>;
      const callId = String(tool.callID ?? "");
      const files = permissionFiles(metadata);
      const url = permissionUrl(props, metadata);
      const eventPath = permissionPath(props, metadata);
      const rememberedPath = state.toolInputByCall.get(callId)?.path;
      const filepath =
        eventPath ||
        (String(props.permission ?? "") === "read" &&
        typeof rememberedPath === "string"
          ? rememberedPath.trim()
          : "");
      return {
        sessionId,
        events: [],
        permission: {
          id,
          sessionId,
          permission: String(props.permission ?? ""),
          callId,
          ...(typeof metadata.command === "string"
            ? { command: metadata.command }
            : {}),
          ...(filepath ? { filepath } : {}),
          ...(files.length > 0 ? { files } : {}),
          ...(url ? { url } : {}),
          // The delegation asks BEFORE resolving the agent: this is what allows
          // to answer something other than “Unknown agent type” (see `decideTask`).
          ...(typeof metadata.subagent_type === "string"
            ? { subagentType: metadata.subagent_type }
            : {}),
        },
      };
    }

    /**
     * OUR `ask_user`, RENDERED BY THE NATIVE TOOL. The thread event is the SAME as
     * that of the home loop (`{id, questions}`, `id` = the tool call): the
     * feed returns a question card, and a run from three months ago is reread
     * The same. Only the spelling of the multi-choice changes (`multiple` at opencode,
     * `multi_select` with us), and this is where we translate it.
     */
    case "question.asked": {
      const id = String(props.id ?? "");
      const tool = (props.tool ?? {}) as Record<string, unknown>;
      const callId = String(tool.callID ?? id);
      const raw = Array.isArray(props.questions) ? props.questions : [];
      const questions = parseAskUserQuestions({
        questions: raw.map((q) => {
          const rec = (q ?? {}) as Record<string, unknown>;
          return { ...rec, multi_select: rec.multiple === true };
        }),
      });
      if (!id || questions.length === 0) return { sessionId, events: [] };
      return {
        sessionId,
        events: [{ type: "question", payload: { id: callId, questions } }],
        question: { id, callId, questions },
      };
    }

    default:
      // `session.status`, `session.updated`, `session.diff`, `server.connected` :
      // noise for us. The thread has no equivalent, and inventing one
      // remplirait `agent_run_events` de lignes que personne ne lit.
      return { sessionId, events: [] };
  }
}

/**
 * THE THINKING THAT CONTINUES — what a delta of part `reasoning` learns.
 *
 * There is nothing to store: the text of the reflection is neither streamed nor kept
 * (it will arrive suddenly, folded, with the end of part `thinking`). What comes out
 * from here is the only useful fact: it thinks, and since when.
 */
function reasoningTick(
  state: TurnStreamState,
  partId: string,
): { active: boolean; startedAt: number } {
  return { active: true, startedAt: state.reasoningStart.get(partId) ?? 0 };
}

/**
 * A PART OF REFLECTION, when it opens and then when it closes.
 *
 * `time.start` / `time.end` come from opencode, and this is intended: this module remains
 * WITHOUT CLOCK, therefore testable on fixtures replayed identically. The duration
 * displayed by the thread is thus the one measured by the server, not the one put
 * our translation to pass.
 *
 * The part is also REMOVED from the text bag: if a delta arrived before the frame
 * opening (nothing guarantees it in the other direction), the chain of thought would be
 * already entered in the round's response.
 */
function reasoningPart(
  state: TurnStreamState,
  sessionId: string,
  part: Record<string, unknown>,
  partId: string,
): Translation {
  if (!partId) return { sessionId, events: [] };
  state.partKind.set(partId, "reasoning");
  partsOf(state, sessionId).delete(partId);

  const time = (part.time ?? {}) as Record<string, unknown>;
  const start = typeof time.start === "number" ? time.start : 0;
  if (start && !state.reasoningStart.has(partId))
    state.reasoningStart.set(partId, start);
  const end = typeof time.end === "number" ? time.end : 0;
  if (!end)
    return { sessionId, events: [], reasoning: reasoningTick(state, partId) };

  // The part is closed: its trace leaves on the wire under the SAME type and the SAME form as
  // that of the house loop (`thinking` + `kind: "reasoning"`), so that the thread
  // fold it as before and a run from three months ago reads the same again.
  const text = typeof part.text === "string" ? part.text.trim() : "";
  const durationMs = Math.max(
    0,
    end - (state.reasoningStart.get(partId) ?? end),
  );
  return {
    sessionId,
    events: text
      ? [{ type: "thinking", payload: { kind: "reasoning", text, durationMs } }]
      : [],
    reasoning: {
      active: false,
      startedAt: state.reasoningStart.get(partId) ?? 0,
    },
  };
}

/**
 * The attachment of a girl, read on the part of `task` who launched it.
 * `undefined` as long as it has no session — that is, on `pending` and on
 * the first `running` (measured: `metadata: null`).
 *
 * `input` is ALREADY translated (`subagent_type` → `mode`), hence the reading as `mode`.
 */
function childOf(
  stateNode: Record<string, unknown>,
  callId: string,
  input: Record<string, unknown>,
):
  | { sessionId: string; callId: string; agent: string; model?: string }
  | undefined {
  const metadata = (stateNode.metadata ?? {}) as Record<string, unknown>;
  const sessionId =
    typeof metadata.sessionId === "string" ? metadata.sessionId : "";
  if (!sessionId || !callId) return undefined;
  const model = (metadata.model ?? {}) as Record<string, unknown>;
  const modelId = typeof model.modelID === "string" ? model.modelID : "";
  return {
    sessionId,
    callId,
    agent: String(input.mode ?? ""),
    ...(modelId ? { model: modelId } : {}),
  };
}

/**
 * The command and its exit code, read from a completed `bash`.
 *
 * `undefined` as soon as one of the two is missing — and `exit` is missing for real: the
 * opencode source sets `null` there when the command has been aborted or killed by
 * the timeout. An unknown exit code is not a zero, and take it as
 * such would silence the delivery gate on an unverified turn.
 */
function shellOf(
  stateNode: Record<string, unknown>,
  input: Record<string, unknown>,
): { command: string; exit: number } | undefined {
  const metadata = (stateNode.metadata ?? {}) as Record<string, unknown>;
  const exit = metadata.exit;
  const command = typeof input.command === "string" ? input.command.trim() : "";
  if (!command || typeof exit !== "number" || !Number.isFinite(exit))
    return undefined;
  return { command, exit };
}

/** The text of the CURRENT round of a session — the live charge. */
export function liveTextOf(state: TurnStreamState, sessionId: string): string {
  return [...(state.textByPart.get(sessionId)?.values() ?? [])].join("");
}

/**
 * WHAT THE SESSION ANSWER — the current round if he wrote, the last round
 * finished otherwise.
 *
 * Both cases really happen: a turn that ends on text has already seen its
 * `message.updated` (so the current bag is empty, and it is the copy that speaks),
 * a turn cut in mid-flight only has its running bag.
 */
export function replyOf(state: TurnStreamState, sessionId: string): string {
  const current = liveTextOf(state, sessionId);
  return (
    current.trim() ? current : (state.lastRoundText.get(sessionId) ?? "")
  ).trim();
}
