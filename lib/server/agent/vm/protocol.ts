import { assertUsableLayout, type HarnessLayout } from "../harness-layout";
import type { ChangedFile } from "../repo-host";
import type { AgentCheckpoint } from "../runs";
import type { AgentAnchor } from "../prompt";
import type { ScopedFavorite } from "../subagent-config";
import type { AgentProviderId } from "@/lib/agent-providers";
import type { ReasoningLevel } from "@/lib/agent-reasoning";
import type { Locale } from "@/i18n/config";
import type { AgentLiveDiff } from "../agent-contract";

/**
 * THE CONTRACT BETWEEN THE FUNCTION AND THE MICROVM (MIN-224) — what the function places
 * on the VM disk before starting the loop, and what the loop returns
 * when the round is finished.
 *
 * A file of TYPES ONLY, imported on both sides. This is what makes the
 * boundary checked by the compiler instead of being checked in
 * production: a field added on one side and forgotten on the other does not compile.
 *
 * THE RULE THAT DECIDES WHAT IS IN THE JOB. Y enters what the function is
 * ONLY that can resolve — a key, a forge token, a forge call, an
 * account setting, the context of the ticket. Do not enter what the VM can read
 * itself on its own disk, nor what moves DURING the round: the steering,
 * the interrupt flag and the state of the pull request are asked at the level of
 * control, at each round, because a job frozen at startup cannot nothing
 * of a “Stop” clicked ten minutes later.
 */

/**
 * THE CONTRACT VERSION (MIN-354). To be incremented as soon as a field changes direction
 * or disappears — not when we ADD one that the old harness can ignore without
 * harm.
 *
 * What it protects did not exist before it. The harness is no longer necessarily
 * written by the deployment that launches it: it is downloaded, then CACHED
 * on a machine that we do not control. A bundle from yesterday that reads a job of new shape
 * would not throw — it would read the fields it knows, silently ignore the others, and play around with the old paths. On this lot
 * precisely, that means: writing in `/vercel/sandbox` on a Mac, therefore
 * nowhere.
 *
 * Hence an EXPLICIT refusal on the harness side (`parseVmJob`), and not one tolerance.
 *
 * **2 (MIN-358)** — `repoMode` has appeared, and this is the textbook case of the rule
 * above read in reverse: an ADDED field, but which a harness from yesterday cannot ignore.
 * “without harm”. Ignored, it would do a `git add -A` and a
 * `git checkout -b` in someone's repository — which is precisely what
 * this batch exists to prevent. Refusal is better than refusal.
 */
export const VM_PROTOCOL_VERSION = 2;

/**
 * `vmBundlePath` and `vmJobPath` now live in
 * [harness-layout.ts](../harness-layout.ts) and are re-exported here for their
 * historical readers.
 *
 * This is not tidying up: this file type-imports `../runs`, which is
 * `server-only`, and the desktop app launcher needs these two
 * paths. Following it would bring half of the server into the type-check
 * of the shell — measured: it then comes across around forty files which
 * have nothing to do with it. `harness-layout.ts` has no import, and
 * is what makes it the only module that both sides can read.
 */
export { vmBundlePath, vmJobPath } from "../harness-layout";

/**
 * Ceiling of the checkpoint that a loop in VM can RISE (MIN-221 §2).
 *
 * The control plane passes through a Vercel function, whose request body
 * is capped at 4.5 MB — measured: 4 MiB pass, 4.3 MiB do 413. Gold
 * `MAX_CHECKPOINT_BYTES` is worth 8 MB: a checkpoint at today's ceiling
 * WOULD NOT GO BACK, and the entire conversation would be lost, in
 * silence, at the end of a two-hour tour.
 *
 * We therefore lower the template FOR THIS PATH — `fitCheckpoint` already takes its
 * ceiling as an argument. It is the less expensive of the two catch-ups that opened the
 * framing: removing the checkpoint from this route would require a second channel
 * (signed blob, direct upload), therefore a second surface to keep, for a case
 * that the levels of `fitCheckpoint` already know how to absorb — they let go first
 * of the RE-DEMANDABLE (girl histories, images, tool outputs).
 *
 * Under `CONTROL_PLANE_MAX_BODY_BYTES` (4 MB), with room for the envelope
 * JSON of the end of round report, which carries the checkpoint among others fields.
 */
export const VM_MAX_CHECKPOINT_BYTES = 3_200_000;

/**
 * PRICES OF THE TOUR MODEL, per million tokens (MIN-286).
 *
 * Why do they travel, when `inputUsdPerMTok` was enough at the threshold of
 * compaction: opencode CALCULATES the cost of each round from a catalog de
 * price, and a model declared without price makes `cost: 0` — measured, exact tokens and
 * cost zero, which would empty the ledger silently. By giving OUR prices (those of
 * the OpenRouter index, the same source as the multiplier and the ceiling of
 * plan), the cost that opencode returns is ours, and the only unknown that the batch 0 cost probe
 * had left open — the drift of the models.dev catalog —
 * disappears (docs/harness-opencode.md §2.5).
 *
 * ABSENT = unknown prices (BYOK excluding OpenRouter index). The cost returned will then be worth
 * zero, and it is up to the supervisor to write the usage in `estimated` rather than
 * to enter a zero in the ledger.
 */
export interface VmModelPricing {
  inputUsdPerMTok: number;
  outputUsdPerMTok: number;
  /** Cache prices, when the provider publishes them — our runs cache a lot. */
  cacheReadUsdPerMTok?: number;
  cacheWriteUsdPerMTok?: number;
}

/** What the loop needs to know about subagents, resolved on the function side. */
export interface VmSubagentConfig {
  /** Is the girls model selectable (OpenRouter only)? */
  models: boolean;
  favorites: ScopedFavorite[];
  maxParallel: number;
  /** Ids from the catalog to the sieve of the plan, and those that it refuses — cf. `scopeSubagentModels`. */
  allowedIds: string[];
  abovePlanIds: string[];
  maxMultiplier: number | null;
  /**
 * PRICES OF GIRL MODELS, by id (MIN-286) — same role and same source
 * as `VmJob.pricing`, for the same reason: a model declared in opencode without
 * price makes `cost: 0`, and the expense of a girl would come out of ledger
 * without a word. Measured: a girl on a priced model returns her cost as the
 * mother (`1.4e-06` on the delegation probe of 2026-08-12).
 *
 * A favorite whose price is missing is NOT declared to the agent: it is better not to
 * offer it than to offer it free.
 */
  pricing?: Record<string, VmModelPricing>;
}

/** Known project of this machine during a local tour. */
export interface VmLocalProject {
  id: string;
  name: string;
  key: string;
  repoFullName: string | null;
  /** `null` means that this project has no valid local folders on this Mac. */
  localPath: string | null;
}

/**
 * THE JOB OF A TOUR. Written in JSON under `layout.harnessDir` — outside the repository, so that the `git add -A` at the end of the round never takes the history of the
 * conversation into a commit to the user's repository.
 */
export interface VmJob {
  /** The version of the contract (see `VM_PROTOCOL_VERSION`). The harness REFUSES this
 * that it does not recognize rather than silently ignoring the fields. */
  protocolVersion: number;
  /**
 * WHERE THIS TOKEN WORKS (MIN-354) — repository, tools outputs, harness, opencode.
 *
 * These were six module constants under `/vercel/sandbox`. This became a
 * run value for two reasons that are one and the same: `/vercel` does not exist
 * on an ordinary machine, and an ordinary machine can carry two runs to
 * at a time — where a microVM carried one by construction
 * ([harness-layout.ts](../harness-layout.ts)).
 */
  layout: HarnessLayout;
  /** The run line. `ledgerRunId` is `run.run_id ?? run.id`: the identifier
 * under which the EXPENSE is counted, which is not that of the line. */
  runId: string;
  ledgerRunId: string;
  projectId: string;
  /** Origin of the control plane — the deployment that launched this run, never the
 * prod by default (see `agentControlOrigin`). */
  appOrigin: string;
  /**
 * THE LOCAL EXECUTION TOKEN (MIN-355) — present ONLY when the round plays
 * on the user's machine. In microVM, there is nothing to carry: the
 * firewall signs after the exit of the VM.
 *
 * It is here, therefore on a disk that the model can read, and it is not a
 * negligence — a secret placed on the machine that we suspect is not hidden.
 * What is processed is its power (see `handleControlPlaneRequest`), and its
 * duration: fifteen minutes.
 *
 * READ BEFORE ANY VALIDATION by [main.ts](main.ts), and it must remain
 * true: a harness which REFUSES its job must still be able to say why, and
 * on the local path, talking asks for this token.
 */
  controlToken?: string;
  // ── Model ──────────────────────────────── ────────────────────────────────
  model: string;
  /** OpenAI-compatible URL base. The KEY is not here: the firewall
 * sets it after exiting the VM, and the loop sends a placeholder. */
  baseUrl: string;
  provider: AgentProviderId;
  /** The placeholder that the loop puts in `authorization` (see network-policy.ts). */
  llmPlaceholderKey: string;
  reasoningLevel: ReasoningLevel;
  contextWindow: number | null;
  /** Model entry price (USD/Mtok) — sizes the compaction threshold, which
 * limits a COST per round and not a number of tokens. `null` = unknown. */
  inputUsdPerMTok: number | null;
  /** All model prices, for the opencode config (see `VmModelPricing`). */
  pricing?: VmModelPricing;

  // ── What the tour has the right to do ────────────────────────────────────
  anchor: AgentAnchor;
  /** False on a pull request reread: neither commit, nor push, nor `create_pr`. */
  writesToRepo: boolean;
  /** False for a routine passage: neither `ask_user` nor `create_routine`. */
  interactive: boolean;
  /** The run is a chain step → `report_verdict` is served. */
  chain: boolean;
  imageInput: boolean;
  webSearch: boolean;
  /**
 * TOUR web search ceiling, shared by the parent and their daughters.
 *
 * Solved on the function side, and this is not a whim: the constant
 * (`MAX_WEB_SEARCHES_PER_TURN`) lives in the module which CHARGES the search,
 * which holds a Supabase client as a service key — importing it from the
 * loop would bring this client into the microVM bundle
 * (`vm-bundle-secrets.test.ts`). The number therefore travels, like the settings of
 * subagents, rather than being copied by hand on both sides.
 */
  webSearchMax: number;
  subagents: VmSubagentConfig;

  // ── The state of the tour ──────────────────────────── ────────────────────────────
  /**
 * OPENCODE STATUS from the previous round (MIN-286) — the event log that
 * the supervisor replays to regain its session. This is THE memory of a run:
 * absent on a cold lap, present from the second.
 *
 * This is NOT a serialized conversation: it is an append-only log,
 * incremental by `seq`, which the batch 0 probe showed that it restores a
 * session with its id, its messages and its cumulative cost on a microVM which has never seen the conversation (86 events, 61 KB, 95 ms).
 */
  opencode?: {
    sessionId: string;
    events: Record<string, unknown>[];
    seq: Record<string, number>;
  };
  /**
 * WHAT THE SUPERVISOR POSTS, AND THE ANCHOR IT INJECTS (MIN-286).
 *
 * Opencode has its OWN system prompt; what comes from us is
 * `anchorInstructions` (served as `instructions`) and the user message.
 *
 * `anchorInstructions` is rebuilt EACH turn, and it's a gain rather
 * than a repeat : the anchor file is reread by opencode at each startup,
 * therefore the snapshot of the ticket it carries cannot remain out of date for a week
 * in a history.
 *
 * `prompt` is empty on a round RESUMED: the request arrives there by steering,
 * that the supervisor drains at startup (`pullSteering`). A cold turn, he,
 * carries here the context of the ticket and the request of the launcher.
 */
  opencodeInput: { prompt: string; anchorInstructions: string };
  instructions: { paths: string[]; bytes: number };
  usageSeqStart: number;
  /** Remaining cap, the tighter of the quota and run cap. */
  budgetUsd?: number;
  /** Edited files that type-check has not yet seen (TOUR status). */
  editedPaths: string[];
  repoTouched: boolean;
  /** Review anchors already set by this run — the cap of 5 is per RUN. */
  prInlineComments: number;

  // ── The deposit ─────────────────────────────── ───────────────────────────────
  baseBranch: string;
  workBranch: string;
  /**
 * Can the working branch already exist on the remote?
 *
 * False on the first round of a new run: the current repository mode then starts from
 * HEAD without attempting an impossible network fetch. Absent is true to keep an old conservative harness and never lose a remote recovery.
 */
  remoteWorkMayExist?: boolean;
  /**
 * IN WHICH REPOSITORY IS THIS ROUND WRITTEN (MIN-358, decision D2).
 *
 * - `clone`: a clone created for this round, by us alone (the microVM, and the mode
 * worktree of the day it will exist). `git add -A` is of no consequence;
 * - `current`: the checkout that the user already has on his disk, with his
 * branch, his index and his WIP. The end of the round goes through
 * [current-repo.ts](../current-repo.ts), which does not affect any of the three.
 *
 * A VALUE and not a deduction from `controlToken`: the execution mode
 * (cloud/local) and the form of the repository are two issues, and D2 already makes the dedicated worktree a local conversation option.
 */
  repoMode: "clone" | "current";
  /**
 * Catalog attached by the desktop app, for local towers only.
 * Paths never cross the control plane or base.
 */
  localProjects?: readonly VmLocalProject[];
  /**
 * AGENT COMMITS GIT IDENTITY (MIN-358). It travels since the
 * clone no longer writes it in `.git/config`: it is posed by `git -c`, on the
 * only command which commits. On the GitHub side, it's the App's bot — an identity
 * linked to a real account, otherwise Vercel blocks the deployment.
 */
  committer: { name: string; email: string };
  /** Push URL, including EPHEMERAL forge token. He is already in the microVM
 * (he is the one who cloned); the loop asks for more from the
 * plan before each push, a turn which can last longer than the token. */
  authUrl: string;
  /** Readable run reference in commit messages (`wip(...)`). */
  commitRef: string;
  /**
 * WHAT THE BOOT COST IN MICROVM, and why it travels.
 *
 * The wall-clock charged to the ledger is held by the loop, from the beginning to the end of the
 * round (MIN-221 §3) — but its clock does not start until the launch of the process
 * node. Before it, the function woke up or CREATED the microVM, set the policy
 * network, cloned the repository on a cold spin (~22 s measured, MIN-222) and wrote
 * 280 KB bundle. This slice is compute that the platform invoices us
 *, and which did not fall into any counter: the function no longer invoices
 * anything for these runs, and the VM could not know a duration before its
 * own birth.
 *
 * A DURATION, never a timestamp : two clocks (that of the function, that
 * of the microVM) have no reason to agree to the millisecond, and
 * a deviation in the opposite direction would make a negative duration. The measurement is taken
 * within the function, end-to-end, and only traverses the network as a
 * number of milliseconds.
 */
  bootstrapMs: number;
  /** The point from which the end of the round differs: the last sha issued to thread
 * (`checkpoint.lastFilesSha`), or the entry HEAD in the very first round. */
  filesFromSha: string;

  // ── Divers ────────────────────────────────────────────────────────────────
  locale: Locale;
  /** LLM call ledger feature: `routine_code` for a routine pass. */
  feature: "agent_code" | "routine_code";
}

/**
 * THE JOB, RE-READ BY THE HARNESS — and REFUSED if it does not come from the same contract.
 *
 * Three refusals, in this order, and each closes a door that the harness cannot
 * close later:
 *
 * 1. **Unknown version.** A bundle cached on a machine survives its
 * deployment; the day a field changes direction, it is here, and nowhere
 * else, that we can still notice it. A refusal that is said to be worth
 * infinitely better than a trick that plays with half of a job.
 * 2. **Layout absent.** Without it, the harness has no reason to believe in one
 * path rather than another — and falling back on `/vercel` would be exactly the
 * silent tolerance that the version exists to remove.
 * 3. **Unusable layout** (`assertUsableLayout`): this is the security root
 * of the write guardrails, and it now arrives via a JSON.
 *
 * THROW rather than return a `null`: the caller is `main.ts`, whose contract
 * is to ALWAYS report — a throw y becomes an error report
 * visible in the thread, a `null` y would become one more branch to forget.
 */
export function parseVmJob(raw: unknown): VmJob {
  const job = raw as Partial<VmJob> | null;
  if (!job || typeof job !== "object") {
    throw new Error("vm job: expected an object");
  }
  if (job.protocolVersion !== VM_PROTOCOL_VERSION) {
    throw new Error(
      `vm job: unsupported protocol version ${JSON.stringify(job.protocolVersion)} ` +
        `(this harness speaks ${VM_PROTOCOL_VERSION}) — the harness bundle is out of date`,
    );
  }
  if (!job.layout || typeof job.layout !== "object") {
    throw new Error("vm job: missing layout");
  }
  assertUsableLayout(job.layout);
  // MIN-358: the deposit mode has NO default. A silent job cannot be
  // treated as a clone — it's the `current` mode that is dangerous to play by
  // error, and it is precisely the one that a job of an unexpected form would silence.
  if (job.repoMode !== "clone" && job.repoMode !== "current") {
    throw new Error(`vm job: unknown repoMode ${JSON.stringify(job.repoMode)}`);
  }
  return job as VmJob;
}

/**
 * WILL THIS ROUND WRITE IN SOMEONE ELSE'S REPOSITORY? (MIN-358)
 *
 * Named rather than tested on site, for the reason of `isLocalJob` just in
 * below: the question arises in four places (the preparation, the push, the
 * perimeter of end-of-turn diffs, the prompt), and a test copied four times
 * ends up no longer meaning the same thing everywhere.
 */
export function isCurrentRepoJob(job: Pick<VmJob, "repoMode">): boolean {
  return job.repoMode === "current";
}

/**
 * DOES THIS TAKE PLAY ON THE USER'S MACHINE? (MIN-357)
 *
 * The answer is the presence of the TOKEN, and that is intended: a flag `local: true`
 * next to it would be a second truth on the same fact, so one day a
 * divergence — a job that calls itself local without a token cannot speak, a job which
 * carries a token is nothing other than a local job (see `VmJob.controlToken`).
 *
 * Named here rather than tested on site: two callers today (the proxy
 * LLM by the supervisor, and the token renewal tomorrow, MIN-294), and this
 * kind of copied test is exactly what ends up no longer meaning the
 * same thing on both sides.
 */
export function isLocalJob(job: Pick<VmJob, "controlToken">): boolean {
  return Boolean(job.controlToken?.trim());
}

/** What a push produced, such as `commitAndPush` renders. */
export interface VmPushResult {
  committed: boolean;
  remoteUpdated: boolean;
  headSha: string;
  pushed: boolean;
}

/**
 * THE END OF ROUND REPORT. The loop has finished (or stopped), pushed its
 * work, and returns control: from here, everything that remains — the event
 * `files_changed`, the reopening of a refused PR, the idling of the line,
 * the notification — is done by the FUNCTION, on its own access to the database and at
 * the forge. The VM is not part of it, and has nothing to believe in it.
 */
export interface VmTurnReport {
  /** The same states as `AgentLoopResult`, minus `suspended`: a turn that lives
 * in the VM no longer splits, so it no longer suspends. What the loop
 * calls `suspended` arrives here in `error`, and its CAUSE travels in
 * `errorCode` — otherwise the three causes would be indistinguishable. */
  status: "completed" | "interrupted" | "error" | "budget_exhausted";
  reply?: string;
  askedUser?: boolean;
  /**
 * WHY the round stopped, when it's not some error.
 *
 * The SAME codes as the old form ([execute.ts](../execute.ts), the
 * anti-runaway guardrail) — deliberately, and that's what makes this field bon
 * market: `ERROR_CODE_KEYS`
 * ([agent-event-feed.tsx](../../../../components/agent/agent-event-feed.tsx))
 * and the two catalogs `messages/*.json` already know them, so the thread
 * tells the same thing on both sides without an additional key.
 *
 * `turnTooBig` has NO equivalent here, and this is not an oversight: this path
 * plans its checkpoint by `fitCheckpoint` and says `turnHistoryReset` when he
 * had to drop the conversation. A round therefore never dies from its volume.
 *
 * ABSENT = an ordinary error, already told to the thread by the one who raised it
 * (the loop on a fatal LLM error, `main.ts` on a round which raises).
 */
  errorCode?: "turnTooLong" | "providerUnavailable";
  /**
 * What the provider responded last, on a `providerUnavailable` —
 * the only trace that says WHICH of the failures (429, 502, network) stopped the
 * round. Not to be thrown away in favor of a fixed sentence: it is all that
 * remains to understand, and the sentence itself is deduced from the code.
 */
  errorMessage?: string;
  /** Cost of the tour, girls included. Adds to `agent_runs.cost_usd`. */
  costUsd: number;
  /**
 * The checkpoint, ALREADY planed to the template by the loop.
 *
 * ABSENT when the turn has LIFTED, and this is the only case. The loop then left
 * its history in a state that we have no reason to believe is coherent — a
 * `tool_call` without its `tool_result` would break the next round at the first
 * round trip. The last PERIODIC checkpoint was written to a safe round boundary: the function KEEP it, and does not write anything over it.
 */
  checkpoint?: AgentCheckpoint;
  /** The levels that `fitCheckpoint` had to drop — `history` said to himself. */
  checkpointDropped: string[];
  /** Size BEFORE planing: this is what says if the lathe has exploded. */
  checkpointBytes: number;
  /** Result of the end of turn push. Null if the turn does not write (proofreading). */
  pushed: VmPushResult | null;
  /** The working branch of the lathe. Reported rather than reread: at the FIRST push
 * of a run, `agent_runs.branch_name` is still zero — it is this push that makes the
 * exist, and the function must know which one to save. */
  workBranch: string;
  /** Message from a push that FAILED — visible signal, not silence. */
  pushError?: string;
  /**
 * The diff of the round, calculated by git in the VM.
 *
 * ABSENT excluding end of NATURAL round: `lastFilesSha` (the baseline of the diff)
 * only advances in `completed`, and the event `files_changed` is defined as the
 * gesture that moves it forward. An interrupted turn therefore keeps its diff for the
 * turn which ends it, which will tell it in one piece.
 */
  changed?: { files: ChangedFile[]; truncated: boolean; diff?: AgentLiveDiff };
  /**
 * Wall-clock of the microVM on this turn — the computed half of the bill, which
 * no one would survive without the loop (MIN-221 §3).
 *
 * `job.bootstrapMs` UNDERSTOOD: the machine was already running while the function
 * woke her up and cloned the repository. This is ONE ledger line for the entire round
 *, and that's by design — the seq strip of the compute
 * (`SANDBOX_USAGE_SEQ_BASE + continuations`) does not distinguish between two.
 */
  sandboxMs: number;
}

/** Response from the control plane to a platform tool. */
export interface VmToolResponse {
  result: unknown;
  success: boolean;
  /** Images returned by the tool (`read_resource` on a model) — the form
 * of `AgentToolImage`, repeated here so that this file remains of the types of
 * border and does not require its import to the server. */
  images?: Array<{ url: string; name?: string }>;
  /** Anchors placed, recounted on the function side — the ceiling of 5 lives there. */
  inlineUsed?: number;
}
