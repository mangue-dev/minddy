import {
  changedFiles,
  workingTreeChangedFiles,
  commitAndPush,
  readWorkFile,
  repoBackgroundRunner,
  sq,
  turnDiff,
  type RepoHost,
} from "../repo-host";
import {
  formatServedInstructions,
  REPO_INSTRUCTION_FILES,
  type RepoInstructionFile,
} from "../repo-instructions";
import {
  formatSecretFindings,
  isSecretFile,
  scanDiff,
  scanSecrets,
  type SecretFinding,
} from "../secret-scan";
import {
  commitTurnAndPush,
  dropIgnoredPaths,
  prepareCurrentRepo,
  readRepoState,
  turnPaths,
  type CurrentRepoState,
  type RepoState,
  type TurnPaths,
} from "../current-repo";
import {
  BackgroundJobs,
  OPENCODE_BACKGROUND_LOG_NOTES,
  type BackgroundJobRunner,
} from "../background";
import { forgetHarnessChild, noteHarnessChild } from "./child-registry";
// The SAME normalization as the home loop: `update_plan` is a tool for
// control, and both engines must derive the same event `plan_update`.
import { normalizePlan } from "../agent-contract";
import { redactDeep, SecretRedactor } from "../redact";
import { cap } from "../tool-summary";
import type { AgentCheckpoint } from "../runs";
import type { ControlPlaneClient } from "./control-plane-client";
import { OpencodeClient } from "./opencode-client";
import {
  liveTextOf,
  newTurnStreamState,
  replyOf,
  translateEvent,
  type OpencodeEvent,
  type RoundUsage,
} from "./opencode-events";
import {
  looksLikeUnexecutedPreamble,
  OPENCODE_CONTINUATION_REPAIR,
} from "./opencode-continuation";
import {
  opencodeAnchorFile,
  opencodeDbPath,
  opencodeServerEnv,
  subagentAgentTable,
} from "./opencode-config";
import { localToolsFor, opencodeToolFiles, SUPERVISOR_URL_ENV } from "./opencode-tools";
import { startToolBridge, type SupervisorTool, type ToolBridge } from "./tool-bridge";
import { makeOpencodeDelivery, repoRelative, type OpencodeDelivery } from "./opencode-delivery";
import { newLiveEditLog } from "../live-edits";
import { decidePermission, editTargets } from "./opencode-permissions";
import { refineLocalVerdict } from "./local-guard";
import { filterLocalPayload, scrubPaths, withheldOutput } from "./local-uplink";
import { startLlmProxy, type LlmProxy } from "./llm-proxy";
import { commitMessageFromReply } from "../commit-message";
import { BUDGET_REFRESH_INTERVAL_MS } from "@/lib/agent-models";
import { subagentUsageSeq } from "../subagent-config";
import {
  isCurrentRepoJob,
  isLocalJob,
  type VmJob,
  type VmPushResult,
  type VmTurnReport,
} from "./protocol";
import { parseAgentUserMessage, promptWithMentions, type AgentUserMessage } from "@/lib/agent-mentions";
import { matchAskUserAnswers, type AskUserQuestion } from "@/lib/ask-user";
import {
  LOCAL_WORKING_DIFF_MAX_BYTES,
  readWorkingDiff,
  type WorkingDiff,
} from "../working-diff";

/**
 * THE SUPERVISOR (MIN-286, lot 1) — what `runVmTurn` becomes when the loop
 * ceases to be our code.
 *
 * It doesn't loop. It **sets the scene** (config, domain tools, anchoring),
 * **starts `opencode serve`**, **posts the tour**, **translates its flow** into
 * `agent_run_events`, and **renders the report** that the control plane is already waiting for.
 * Everything that's left of us — the commit, the push, the round diff, the ledger, the
 * thread — is there; everything that was the loop (rounds, retries, compaction,
 * truncation, model call) is no longer there.
 *
 * `main.ts` does not change: it calls a turn, it obtains a `VmTurnReport`, and
 * its guarantee (“the turn ALWAYS returns a report”) remains its guarantee.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS HERE, AND WHAT IS NOT YET
 *
 * This file is the basis of lot 1: startup, session, prompt, translation of
 * flow, end of turn. Lot 2 hung the ledger, the spending ceiling, the
 * guardrails (`command-guard` / `repo-path`, replayed on `permission.asked`),
 * `ask_user` (the `question` tool), subagents, tools bridge
 * ([tool-bridge.ts](tool-bridge.ts)), delivery rules
 * ([opencode-delivery.ts](opencode-delivery.ts)) and the forge (`create_pr`, cut
 * in two: the VM pushes, the function opens).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TWO MEASUREMENTS THAT DECIDE THE SHAPE (opencode-ai@1.18.16)
 *
 * 1. ****CODE_0__ responds 503** — the route exists in the OpenAPI,
 * the server does not implement it. The end of a round is therefore read on
 * `session.idle` of stream `/event`. It's better anyway: nothing holds
 * an HTTP request opened during the hours that a tour lasts.
 * 2. **The server must remain in the FOREground** in the microVM. A `nohup … &`
 * in a `sh -c` of the Sandbox drops the RPC command (`UND_ERR_SOCKET` in
 * ~25 s, zero output lines), the same server in the foreground starts very
 * well — measured three times in batch 0. Hence `startServer`, injected: here we
 * launches an ordinary process node, and it is the caller (the microVM) who knows
 *    how to keep its server alive.
 */

/**
 * Waiting limit for server startup.
 *
 * ~1.3 s measured at batch 0 — on an already hot microVM. **The first run of
 * production is dead here** (2026-08-12): on a VM freshly created since the
 * snapshot, the disk hydrates lazily and the first exec of the 176 MB of the
 * binary is counted in minutes, during which the server accepts the connection
 * without responding. The ceiling therefore does NOT limit normal slowness (it is
 * order of the second): it limits the server which will never start, and it must
 * be wide in front of the worst cold start measured.
 */
export const OPENCODE_BOOT_TIMEOUT_MS = 5 * 60_000;

/**
 * THE OPENCODE SERVER PORT — one argument, plus a constant (MIN-354).
 *
 * It was worth 4096 hard, and that was true as long as the harness was alone in a
 * microVM created for him. On a computer, two simultaneous runs occur
 * would compete for the same socket and the second would die on a refused `listen` — at
 * a place that bears no resemblance to its cause. `main.ts` reserves it for
 * system before starting ([free-port.ts](free-port.ts)).
 *
 * MANDATORY in `SupervisorDeps`, and not optional with a fallback to 4096: a
 * fixed default is exactly the collision that we have just removed, with the addition
 * the assurance that no one would see it coming.
 */

/** Live cadence — the same as the home loop (`emitLive`, 250 ms). */
export const LIVE_INTERVAL_MS = 250;

/**
 * Secrets scan terminals before push (MIN-360). They are only used for
 * recast tower does not pay for the scan in minutes: a secret is short, and it is
 * at the head of a file much more often than at the end.
 */
const SECRET_SCAN_MAX_BYTES = 2_000_000;
const SECRET_SCAN_MAX_FILES = 200;

/**
 * Probing cadence of the “Stop” and the steering queue.
 *
 * Two requests to the control plane every five seconds at worst, and only one
 * in the current case (`/interrupt`, then `/messages/pending` only if there is no
 * no stop) — compare to ~4 calls PER SECOND live. It is therefore not
 * this survey which weighs on the count of invocations.
 */
export const STEER_POLL_INTERVAL_MS = 5_000;

/**
 * THE BEAT OF THE TOUR — what brings the “Stop”, the steering, the
 * periodic backup and wall deadline WHEN THE FLOW DIES UP.
 *
 * A twenty-minute `bash` publishes nothing between its beginning and its end: without
 * beat, the tower no longer had any clock, and its only sign of life
 * (`last_activity_at`, written by backup) froze. Aligned with the survey
 * of steering, of which it is the upper limit of latency.
 */
export const LIFECYCLE_BEAT_MS = 5_000;

/** The beat token, distinct from any `IteratorResult`. */
const LIFECYCLE_BEAT = Symbol("lifecycle-beat");

/**
 * Cadence of the periodic backup of the checkpoint — which is ALSO the only
 * heartbeat of a round of opencode (see `maybeSaveCheckpoint`).
 *
 * TWO MINUTES, under the three of the watchdog (`VM_LOOP_PROBE_AFTER_MS` in
 * [drain.ts](../drain.ts)): a live round therefore keeps a `last_activity_at`
 * fresh and is never a candidate for the platform probe. The house loop
 * backup every five minutes ([turn.ts](turn.ts)) — it can,
 * command responds to probe; here saving is the only sign of life.
 */
export const SUPERVISOR_CHECKPOINT_SAVE_INTERVAL_MS = 2 * 60_000;

/**
 * How long do we wait, at the end of the turn, for a cut round to finish arriving?
 * at the supplier (`proxy.settle`, MIN-286 lot 3).
 *
 * Measured: the upstream continues **1,221 ms** after the customer leaves, and this is
 * last frame that carries the cost. Ten seconds leaves a wide margin ahead
 * this figure while limiting the only annoying case — a flow that the supplier does not
 * would never close, which would hold the end of the round for a ledger line.
 */
export const ORPHAN_SETTLE_MS = 10_000;

/**
 * Wall-clock limit for a ROUND. Taken from [turn.ts](turn.ts) without changing the value:
 * what it protects has not changed in nature — the microVM session is capped
 * at 24 p.m. by the platform, and a round killed by it would leave no trace.
 */
export const SUPERVISOR_TURN_SOFT_DEADLINE_MS = 12 * 60 * 60_000;

/**
 * THE OPENCODE STATUS BETWEEN TWO TOURS, carried by the checkpoint.
 *
 * It is no longer a serialized conversation but an **event log**
 * (probe from batch 0): the session leaves with its id, its messages and its cost
 * accumulated on a microVM that never saw the conversation.
 *
 * What the checkpoint carries is ONLY the pointer — the session and the cursor by
 * AGGREGATE. The events live in `agent_run_journal` (MIN-286,
 * 2026-08-13): they carry the complete output of each tool, and a checkpoint
 * who carried them exceeded the ceiling of the control plan in around fifteen
 * file reads.
 */
export interface OpencodeCheckpointState {
  sessionId: string;
  /** Last `seq` known by aggregate — the argument for the next export. */
  seq: Record<string, number>;
}

/** A checkpoint of this engine: our tower state, plus the opencode log. */
export type OpencodeCheckpoint = AgentCheckpoint & { opencode?: OpencodeCheckpointState };

/** What the supervisor needs to know how to do, and that we inject into him. */
export interface SupervisorDeps {
  /**
   * Starts the server and makes it necessary to stop it. Injected because the way of
   * keeping a process alive is up to the host (see the `nohup` trap), and
   * because a test doesn't have to run a 144 MB binary.
   */
  startServer(env: Record<string, string>): Promise<{ stop(): Promise<void> }>;
  /** Writes a file to the microVM (config, tools, anchor). */
  writeFile(path: string, content: string): Promise<void>;
  /** The server's HTTP client — injected for the same reasons. */
  client(baseUrl: string): OpencodeClient;
  /**
   * The local proxy placed in front of the provider ([llm-proxy.ts](llm-proxy.ts)).
   * Injected so that a test does not open a socket; in production, it is
   * `startLlmProxy`.
   */
  startProxy?(job: VmJob): Promise<LlmProxy>;
  /** The tools bridge ([tool-bridge.ts](tool-bridge.ts)). Injected for a test. */
  startToolBridge?(opts: {
    job: VmJob;
    cp: ControlPlaneClient;
    delivery?: OpencodeDelivery;
    supervisorTools?: Record<string, SupervisorTool>;
    port?: number;
  }): Promise<ToolBridge>;
  /** The reserved port of the opencode server (see the block above). */
  opencodePort: number;
  /**
   * The port of the bridge of tools. ABSENT = ephemeral, chosen by the system, and it is
   * the production case: the bridge renders its URL, no one has to know its
   * number. A test can impose one.
   */
  toolBridgePort?: number;
  now?(): number;
  /** Waiting for startup. Adjustable so that a test does not wait 60 seconds. */
  bootTimeoutMs?: number;
  /** The beat of the tour (see `LIFECYCLE_BEAT_MS`). Adjustable for the same reason. */
  lifecycleBeatMs?: number;
}

/** Minddy anchor text, served as `instructions` to the system prompt. */
export interface SupervisorInput {
  /** What the trick asks of the model (the user's message, or the prompt). */
  prompt: string;
  /** The minddy anchor (ticket / notebook / reread), reinjected in `instructions`. */
  anchorInstructions: string;
}

/**
 * GROUND JOBS, REGISTERED IN THE CHILDREN'S REGISTRY (MIN-364, decision D8).
 *
 * This was the written CONDITION of reopening `run_background` locally, and
 * it comes down to one fact: the jobs leave in `setsid`, so they
 * survive the shell that launched them — and the harness itself when it is killed
 * net (⌘Q, main process crash), since the end of turn `stopAll`
 * then never turns. Without a register, the `npm run dev` of the model remained alive,
 * port 3000 held, **and nowhere knew where to find it**.
 *
 * The inscription is done BEHIND the `start` rather than in `background.ts`:
 * this module is pure and testable without a disk, and that is what makes it valuable.
 * Here, the supervisor already knows how to write to the machine's disk.
 *
 * `kind: "background"` is not cosmetic: `killTargets` reports these children
 * **in GROUP** (`-pid`), because the session leader is not the server but
 * the shell that launched it — killing the lone leader would leave the `next dev` behind.
 *
 * Outside the local path, the function returns the runner as it is: the microVM dies with
 * his children, and one more file would keep nothing there.
 */
function registeredBackgroundRunner(
  runner: BackgroundJobRunner,
  harnessDir: string,
  local: boolean,
): BackgroundJobRunner {
  if (!local) return runner;
  return {
    start: async (opts) => {
      const started = await runner.start(opts);
      // AFTER the start, because it is he who makes the pid — and the only moment
      // uncovered is one where the job does not yet have a number to write.
      if (started.pid > 0) {
        noteHarnessChild(harnessDir, {
          pid: started.pid,
          kind: "background",
          label: opts.command.slice(0, 200),
        });
      }
      return started;
    },
    read: (opts) => runner.read(opts),
    stop: async (opts) => {
      await runner.stop(opts);
      // Removed only when you stopped it YOURSELF: a job you didn't know about
      // kill must remain in the register, it is precisely him who is the launcher
      // will have to harvest.
      forgetHarnessChild(harnessDir, opts.pid);
    },
  };
}

/** The port of a local service URL, or 0 if it does not carry a readable one. */
function portOfUrl(url: string): number {
  try {
    const parsed = new URL(url);
    return Number(parsed.port) || 0;
  } catch {
    return 0;
  }
}

/**
 * How many convention files are used at most, and to what extent?
 * depth. A monorepo carries a handful; thirty would be the sign else
 * thing, and the byte budget (`formatServedInstructions`) would not be at all
 * way more held by the latter.
 */
const INSTRUCTION_FILES_MAX = 20;
const INSTRUCTION_FILES_MAX_DEPTH = 5;

/** Files that we do not go through: what we would find there is not part of the project. */
const INSTRUCTION_SEARCH_PRUNED = [
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "vendor",
  "target",
  ".venv",
  "coverage",
];

/**
 * DEPOSIT CONVENTIONS, FOUND RATHER THAN SELF-DISCOVERED (MIN-360, then
 * MIN-364 for nested).
 *
 * Opencode would fetch `AGENTS.md` and `CLAUDE.md` on its own, going up
 * from the depot. It’s the SAME feedback that collected the plugins and tools
 * of a `.opencode/`, that is to say arbitrary code written by anyone who can
 * committer — and it’s this feedback that we cut
 * (`OPENCODE_DISABLE_PROJECT_CONFIG`, cf. [opencode-config.ts](opencode-config.ts)).
 *
 * We therefore return the only piece that does not execute anything: these two file names, and
 * nothing else. **The root AND subfolders** (MIN-364): the mechanism
 * lazy person who served the nested ones stuck to the RESULT of a tool
 * file, and these tools belong to opencode — it no longer has a point
 * hook, so a monorepo in which each package carries its conventions does not
 * no longer saw them at all.
 *
 * The order is that of depth, from the most GENERAL to the most SPECIFIC: it is
 * the order in which the rules are overloaded, and this is the order that the document
 * served ad to model.
 *
 * End-to-end best effort: a mute probe returns an empty list, never a
 * error — a round does not stop because a `find` did not respond.
 */
async function findInstructionFiles(host: RepoHost): Promise<string[]> {
  const names = REPO_INSTRUCTION_FILES;
  const prune = INSTRUCTION_SEARCH_PRUNED.map((dir) => `-name ${sq(dir)}`).join(" -o ");
  const wanted = names.map((name) => `-name ${sq(name)}`).join(" -o ");
  try {
    const res = await host.exec(
      `find . -maxdepth ${INSTRUCTION_FILES_MAX_DEPTH} \\( ${prune} \\) -prune -o ` +
        `-type f \\( ${wanted} \\) -print 2>/dev/null`,
      { timeoutMs: 30_000 },
    );
    const found = res.stdout
      .split("\n")
      .map((line) => line.trim().replace(/^\.\//, ""))
      .filter((line) => line && names.includes(line.split("/").pop() ?? ""));
    // Depth first (the general before the specific), then the declared order
    // names — `AGENTS.md` before `CLAUDE.md`, like everywhere else.
    return [...new Set(found)]
      .sort((a, b) => {
        const depth = a.split("/").length - b.split("/").length;
        if (depth !== 0) return depth;
        return a.localeCompare(b);
      })
      .slice(0, INSTRUCTION_FILES_MAX);
  } catch {
    return [];
  }
}

/**
 * THE CONVENTIONS DOCUMENT SERVED AT THE TOUR, written next to the anchor.
 *
 * ⚠ THIS IS WHERE THE BORDER NOTE COMES BACK (MIN-364, §5.4 of the audit of
 * 15/08). It was missing on the local path: `readRepoInstructions` is not called
 * that on the server side, where `host` is `null` locally, therefore the CONTENT of `AGENTS.md`
 * arrived well (opencode loads the `instructions` key) but without the sentence which
 * tells the model that these files are DATA about the project and not a source
 * orders. This is exactly the safeguard for prompt injection on a file that
 * anyone can commit — and the submission of a review is not even that of
 * the user.
 *
 * We read ourselves rather than naming N paths to opencode, because that's the
 * only way to HIGH: he reads in full what is given to him, and thirty
 * `AGENTS.md` of monorepo would enter in full in the system prompt, each time
 * round.
 */
async function servedInstructionsFile(
  host: RepoHost,
  writeFile: (path: string, content: string) => Promise<void>,
): Promise<string[]> {
  const paths = await findInstructionFiles(host);
  if (paths.length === 0) return [];
  // Each reading is independent and the final document keeps the order of
  // `paths` thanks to `Promise.all`. In a monorepo, reading them serially made
  // wait for the opencode server behind each disk/RPC round trip.
  const files = (
    await Promise.all(
      paths.map(async (path): Promise<RepoInstructionFile | null> => {
        const content = await readWorkFile(host, path).catch(() => null);
        return content?.trim() ? { path, content } : null;
      }),
    )
  ).filter((file): file is RepoInstructionFile => file !== null);
  const document = formatServedInstructions(files);
  if (!document) return [];
  const target = `${host.layout.harnessDir}/repo-instructions.md`;
  try {
    await writeFile(target, document);
  } catch {
    // A file that we did not know how to write should not bring down the trick: the
    // model will work without the conventions, which is the case before this batch.
    return [];
  }
  return [target];
}

/**
 * PLAY THE TOUR. Do not raise on a job failure (failed push, server that does not
 * not start): these failures are SAYED in the report — same rule as
 * `runVmTurn`, and for the same reason: a trick that wrote code and didn't know
 * pushing it should still raise its state.
 */
export async function runOpencodeTurn(
  job: VmJob,
  input: SupervisorInput,
  cp: ControlPlaneClient,
  host: RepoHost,
  deps: SupervisorDeps,
): Promise<VmTurnReport> {
  const now = deps.now ?? (() => Date.now());
  const startedAt = now();
  // Local tours pass through multiple HTTP processes and services before
  // the supplier can issue a token. These milestones remain in the log of
  // harness (never in the thread) to assign latency to an actual step.
  const timing = (stage: string) =>
    console.log(`[agent-timing] ${stage} +${now() - startedAt}ms`);
  timing("supervisor-start");
  let firstLivePublished = false;
  let firstVisibleTextSignal = false;
  let firstVisibleTextPublished = false;
  const publishLive: typeof cp.emitLive = (progress) => {
    if (!firstLivePublished) {
      firstLivePublished = true;
      timing("first-live-published");
    }
    if (!firstVisibleTextPublished && progress.text.trim().length > 0) {
      firstVisibleTextPublished = true;
      timing("first-visible-text-published");
    }
    cp.emitLive(progress);
  };
  const previous = job.opencode;

  const secrets = new SecretRedactor();
  let authUrl = job.authUrl;
  secrets.addAuthUrl(authUrl);

  /**
   * IS THIS THINK PLAYING ON ANYONE’S MACHINE? (MIN-360)
   *
   * Read once, here, and passed everywhere: it is the flag which decides three
   * safeguards that the microVM did not need to carry — reading
   * `.env`, the scope of `webfetch`, and the denial of an unknown permission.
   */
  const local = isLocalJob(job);

  // The capped mint is the only mandatory round trip before opening the
  // local proxy. It does not need either the repository or the harness files: the
  // starting from the entry covers its latency with all this preparation.
  const authenticatedLlmKeyPromise = isLocalJob(job)
    ? (() => {
        timing("llm-key-requested");
        return cp.llmKey().then((key) => {
          timing("llm-key-ready");
          return key;
        });
      })()
    : null;
  // An invalid repository may exit before the proxy joins the key.
  // The error remains carried by the original promise if it is expected, but
  // does not become an unhandled release on this early exit path.
  void authenticatedLlmKeyPromise?.catch(() => {});

  /**
   * WHAT A CHAIN ​​HAPPENS BEFORE LEAVING THE MACHINE (MIN-361).
   *
   * The secrets first - this is the invariant of MIN-239, and it applies everywhere -,
   * then, on the local path ONLY, the machine paths
   * ([local-uplink.ts](local-uplink.ts)). A single bracket rather than a `if` to
   * each output: the text outputs of a round are five (the final word,
   * live, commit message, session error, failure report),
 * and just one forgotten one is enough to raise `/Users/<first last name>/…`.
   */
  const outward = (text: string): string =>
    local ? scrubPaths(secrets.redact(text), job.layout.repoDir) : secrets.redact(text);

  /** What we return when the tour could not start (or was broken in flight). */
  const failed = (message: string, costUsd = 0): VmTurnReport => ({
    status: "error",
    errorMessage: cap(outward(message), 1000),
    costUsd,
    checkpointDropped: [],
    checkpointBytes: 0,
    pushed: null,
    workBranch: job.workBranch,
    sandboxMs: job.bootstrapMs + (now() - startedAt),
  });

  /**
   * THE USER'S DEPOSIT, PREPARED BEFORE EVERYTHING ELSE (MIN-358).
   *
   * Before the decor, before the proxy, before the bridge: this is the only place from which
   * you can still go out without having opened anything to close. And there is no
   * degraded mode — a deposit that you cannot read is a trick that has nowhere
   * where to write.
   *
   * `null` in clone mode, and it is this `null` which, further down, decides the shape of the
   * commit: `git add -A` in a clone of ours, the temporary index in the
   * checkout de quelqu'un.
   */
  let current: CurrentRepoState | null = null;
  /** The working tree as it was BEFORE the model touched anything —
   * the other half of the perimeter of the turn (see `turnScope`). */
  let stateAtStart: RepoState = new Map();
  if (isCurrentRepoJob(job)) {
    try {
      current = await prepareCurrentRepo(host, {
        runId: job.runId,
        authUrl,
        workBranch: job.workBranch,
        remoteWorkMayExist: job.remoteWorkMayExist,
        baseBranch: job.baseBranch,
      });
      stateAtStart = current.state;
    } catch (err) {
      return failed((err as Error).message);
    }
    // Neutral event (invisible to the wire, accounting in base): the branch that
    // the user had under his fingers and what he had in progress when the
    // tour has started. This is what will allow you to reread a trick whose pull
    // request contains commits that no one attributes to the agent.
    // Informative and invisible in the thread: does not block writing of the config
    // nor the key mint behind a round trip to the control plane.
    void cp
      .emit("status", {
        phase: "current_repo",
        branch: current.branch,
        dirty: current.dirty,
        resumed: current.resumed,
      })
      .catch(() => {});
  }
  /**
   * The baseline of the lap difference. In clone mode it comes from the job; in deposit mode
   * current, in the FIRST round, the function could not know it — this is the
   * HEAD of a machine she has never seen. The harness therefore resolves it itself.
   */
  const filesFromSha = job.filesFromSha || current?.parent || "";

  // ── The setting, set before the first server byte ───────────────────────
  // The anchor and tools files have separate destinations. A
  // unique barrier before `startServer` keeps the atomic configuration seen by
  // opencode, without adding 32 disk/RPC waits before the first token.
  await Promise.all([
    deps.writeFile(opencodeAnchorFile(job.layout), input.anchorInstructions),
    ...opencodeToolFiles(job).map((file) => deps.writeFile(file.path, file.content)),
  ]);
  timing("harness-files-ready");
  // The repository conventions are independent of the proxy or the bridge. We start
  // their discovery immediately, then we wait for the document just before
  // give the environment to the server: opencode always sees the file
  // full, but the disk/RPC cost overlaps with local initialization.
  const servedInstructionsPromise = servedInstructionsFile(host, deps.writeFile);

  // The local key mint is a round trip to the control plane. He
  // does not depend on the bridge: it is covered with the construction of the rest of the
  // supervisor instead of putting it on the server's critical path.
  const proxyPromise = (deps.startProxy ??
    ((j: VmJob) =>
      startLlmProxy({
        job: j,
        redact: secrets.redact,
        onTiming: timing,
        ...(isLocalJob(j)
          ? { apiKey: () => authenticatedLlmKeyPromise!, deferApiKey: true }
          : {}),
        ...(j.executionEnvironment === "server"
          ? {
              relay: {
                baseUrl: j.llmRelayUrl!,
                token: () => j.controlToken!,
              },
            }
          : {}),
      })))(job);

  // The proxy BEFORE the server: its `baseURL` enters the tour config, so
  // it must be known before opencode reads its environment.
  // `secrets.redact` is a lambda linked to the register, which is MUTABLE: the token
  // re-minted before a push (see `pushWork`) is replaced by the proxy as soon as it
  // is saved, without the proxy having to be rebuilt.
  //
  // AND IT'S HE WHO HAS THE KEY TO A MACHINE (MIN-357): `apiKey` is not
  // wired only for a local turn, where no firewall will install it at the exit. THE
  // supervisor never sees her — he goes out of his way to ask for her, and she doesn't
  // lives only in the proxy memory, neither in the job nor in the environment of the
  // opencode server. A refused mint causes `startLlmProxy` to raise, therefore failing
  // turn with its motive: it is the desired behavior, not a regression.
  const proxy = await proxyPromise;
  timing("llm-proxy-ready");
  /**
   * The tools bridge, opened BEFORE the server for the same reason as the proxy:
   * its address falls into the opencode environment, so it must exist
   * before he reads it. He’s the one who keeps the TOUR counters — ceiling
 * web searches and review anchors ([tool-bridge.ts](tool-bridge.ts)).
   */
  /**
   * THE PERIMETER OF THE TOUR (MIN-358) — what this turn, and it alone, has the right to
   * deliver and proofread in someone else's repository.
   *
   * Two sources united here because the supervisor is the only one with the
   * two: the snapshot taken before the first round, and the editions noted by
   * opencode permissions ([current-repo.ts](../current-repo.ts) explains
   * why neither is enough).
   *
   * Recalculated at each call, never memorized: the work tree moves during
   * all the way around, and a list frozen at the first `create_pr` would miss everything that
   * the model then writes.
   */
  const turnScope = async (): Promise<TurnPaths> => {
    if (!current) return { paths: [], carried: [] };
    const scope = turnPaths({
      edited: delivery.turnEditedPaths(),
      owned: job.editedPaths,
      before: stateAtStart,
      after: await readRepoState(host),
    });
    return { ...scope, paths: await dropIgnoredPaths(host, scope.paths) };
  };

  /**
   * THE ASSIGNED SCOPE — stricter than `turnScope`.
   *
   * `turnScope` must still see the shell for explicit delivery (codegen,
   * `rm`, lockfile). It therefore compares the tree before/after and, in a checkout
   * shared, cannot distinguish two competing authors. The difference presented
   * as "changes this agent" has no right to do this
   * assumption: it only takes the writes observed by the permissions
   * `edit`, accumulated in the checkpoint of this run.
   */
  const attributedScope = async (): Promise<string[]> => {
    if (!current) return [];
    return await dropIgnoredPaths(host, delivery.checkpointEditedPaths());
  };

  /**
   * THE DELIVERY RULES (lot 2, task 14), built BEFORE the bridge: it is
   * he who serves `write_issue_plan` and `create_pr`, therefore he who carries the voice of
   * harness. The supervisor, for his part, gives them the two facts that come
   * Integrated tools — one write allowed, one command completed.
   */
  const delivery = makeOpencodeDelivery({
    host,
    emit: (type, payload) => cp.emit(type, payload),
    filesFromSha,
    editedPaths: job.editedPaths,
    repoTouched: job.repoTouched,
    ...(current ? { scopePaths: async () => (await turnScope()).paths } : {}),
    remainingMs: () => SUPERVISOR_TURN_SOFT_DEADLINE_MS - (now() - startedAt),
  });

  /**
   * A local run is not readable by the server's `/diff` route: the repository
   * is on the machine that runs the harness. After an edition, this machine
   * therefore rereads its own diff and attaches it to the real-time stream. The deadline leaves
   * the OpenCode tool finishes writing before `git diff`; we only launch one
   * batch reading for a burst of edits.
  */
  let liveStatsTimer: ReturnType<typeof setTimeout> | null = null;
  let refreshLocalLiveStats = () => {};

  /**
   * The offer of sub-agents of the tour, as the config has just declared it.
   * Single source ([opencode-config.ts](opencode-config.ts)): what is
   * served to the model, what the guardrail accepts and what the thread displays are
   * derived from the same array, so cannot diverge.
   *
   * Built BEFORE the bridge because `create_pr` consults them: commit
   * while a girl writing would take away her half-finished work.
   */
  const agentTable = new Map(subagentAgentTable(job).map((a) => [a.name, a]));
  const subagents = new SubagentRegistry(
    new Map([...agentTable].map(([name, a]) => [name, a.mode])),
  );

  /**
   * GROUND JOBS (MIN-286, lot 3; MIN-114 for politics) — `bash` does not have
   * background mode, so the tool is ours and its register lives HERE.
   *
   * `background.ts` does not move one line: the job ceiling, the safeguard
   * `checkCommand`, offsets and formatting are pure there, and they are
 * that were missing from the fallback ("start your server with `&`") that this tool replaces.
   * What is new takes three connections: the bridge executes it, `create_pr`
   * kills before staging, end of turn kills before committing.
   *
   * `seqBase: 0` as in [turn.ts](turn.ts): the log files are
   * numbered by TOWER, and a tower has its microVM.
   */
  const background = new BackgroundJobs(
    registeredBackgroundRunner(repoBackgroundRunner(host), job.layout.harnessDir, local),
    0,
    // The log lives outside the repository, and a reading outside the repository is refused by our
    // own permission verdict (`external_directory`): this is the SHELL that we
    // sends it to read, not `read`.
    OPENCODE_BACKGROUND_LOG_NOTES,
    // The same world as that of the permission verdict: a `git commit` launched in
    // in the foreground, it is judged like a foreground `git commit` (MIN-364).
    { local },
  );
  const servesBackground = localToolsFor(job).some(
    (t) => t.function.name === "run_background",
  );

  /**
   * Jobs killed before a `git add -A`, TOLD to the model. A server stopped in
   * silence lets him believe that it is running, and he strings `curl` on a port
   * died looking for what he broke (MIN-209).
   */
  async function stopJobsForStaging(): Promise<string> {
    const stopped = await background.stopAll().catch(() => 0);
    if (stopped === 0) return "";
    return (
      `${stopped === 1 ? "1 background job was" : `${stopped} background jobs were`} stopped ` +
      `before staging — nothing may write to the repository while it is being committed. Restart what you still need.`
    );
  }

  /**
   * THE PUSH OF THE TOUR, in one place — it is used twice: `create_pr` (the VM
   * pushes, the function opens) and the end of the turn.
   *
   * The push URL is RE-RESOLVED every time, and this is not a safety precaution.
 * For example: a microVM round lasts hours, while a forge installation token
 * expires after an hour. The secret register is cumulative — the clone token remains
   * readable in `.git/config` long after being replaced here.
   */
  /**
   * THE SECRETS SCAN, AND IT'S HARD (MIN-360) — it LIFTS, so nothing is committed
   * and nothing is pushed.
   *
   * What makes it necessary can be summed up in one sentence: the end of the tour publishes a pull
   * request **without a human in front of the screen**, and the delivery door
   * ([delivery-gate.ts](../delivery-gate.ts)) is a QUALITY gate — nothing there
   * was looking for a leak. As long as the repository was a disposable clone, the only secret
   * scope was that of the deposit; in current deposit mode, the real `.env` of
   * the user is next to the tour files.
   *
   * TWO SOURCES, because neither is enough:
   *
   * 1. **the diff** ([secret-scan.ts](../secret-scan.ts) only reads the lines
   * ADDED: a secret already present in the repository would otherwise block all
   * turns that touch this file, forever);
   * 2. **NEW files**, which do not appear in any `git diff` as long as they
   * are not tracked — and a copied `.env` is exactly that.
   *
   * The refusal returns to the model as a tool error on `create_pr`, and is
   * publishes in the thread by `pushError` at the end of the round. Neither is a silence.
   */
  async function assertNoSecretsPushed(): Promise<void> {
    const scope = current ? (await turnScope()).paths : undefined;
    const { diff, porcelain } = await turnDiff(host, filesFromSha, scope);
    const findings: SecretFinding[] = scanDiff(diff.slice(0, SECRET_SCAN_MAX_BYTES));

    const untracked = porcelain
      .split("\n")
      .filter((line) => line.startsWith("??"))
      .map((line) => line.slice(3).trim())
      // A non-ASCII path leaves CITY of `git status --porcelain` (the `-z` alone does not
      // not cite, cf. current-repo.ts). We let it fall rather than
      // recite by hand: it is the scan of a new file that we lose, not the
      // diff, and rough deserialization would open a wrong path.
      .filter((path) => path && !path.startsWith('"'))
      .slice(0, SECRET_SCAN_MAX_FILES);
    for (const path of untracked) {
      // A file from the dotenv family refuses its NAME: its content has no
      // not to resemble anything so as not to end up in a PR.
      if (isSecretFile(path)) {
        findings.push({ kind: "environment file", file: path, sample: path });
        continue;
      }
      const content = await readWorkFile(host, path).catch(() => null);
      if (content) findings.push(...scanSecrets(content.slice(0, SECRET_SCAN_MAX_BYTES), path));
    }

    if (findings.length > 0) throw new Error(formatSecretFindings(findings));
  }

  async function pushWork(message: string): Promise<VmPushResult> {
    await assertNoSecretsPushed();
    authUrl = (await cp.repoAuthUrl()) ?? authUrl;
    secrets.addAuthUrl(authUrl);
    // A run on a project with NO linked repository arrives without a push URL,
    // and nothing can mint one: the delivery tool is not served (`create_pr`
    // requires `job.authUrl`), so reaching this line is a contract breach —
    // said plainly rather than passed to `git push` as `undefined`.
    if (!authUrl) {
      throw new Error("no repository is linked to this project: there is nowhere to push");
    }
    if (!current) {
      return await commitAndPush(host, {
        authUrl,
        workBranch: job.workBranch,
        baseBranch: job.baseBranch,
        message,
        committer: job.committer,
      });
    }
    /**
     * THE SAME PUSH, IN SOMEONE ELSE'S DEPOSIT (MIN-358) — index
     * temporary, `commit-tree`, ref to us. Nothing the user has under
     * fingers are not touched, and the pull request still goes out.
     */
    const pushed = await commitTurnAndPush(host, {
      runId: job.runId,
      authUrl,
      workBranch: job.workBranch,
      message,
      committer: job.committer,
      // The REAL parent is reread by `commitTurnAndPush` at each call: the
      // second push of a turn (`create_pr`, then the end of the turn) must extend
      // the first commit, not make him a brother.
      fallbackParent: current.parent,
      scope: await turnScope(),
    });
    /**
     * THE CASE THAT NOTHING CLOSES, AND WHICH MUST THEREFORE BE SAYED: the agent delivered
     * files that the user had also modified, therefore his work
     * part in the pull request. This is the price of the current deposit mode — two hands
     * in the same file — and what would be wrong would be to keep silent about it.
     */
    if (pushed.carried.length > 0) {
      await cp
        .emit("status", {
          phase: "current_repo_overlap",
          files: pushed.carried.length,
          paths: pushed.carried.slice(0, 20),
        })
        .catch(() => {});
    }
    return pushed;
  }

  /**
   * `create_pr` — THE ONLY TOOL CUT IN HALF, and it is in a good way: the
   * repository lives in the microVM, forge token and pull request state
   * function side ([control-plane.ts](../control-plane.ts), `runCreatePr`). THE
 * the supervisor therefore pushes, then opens it.
   *
   * Three things distinguish it from a hatch, and each one fixes a real case:
   *
   * 1. **The branch is UP, not read again.** `agent_runs.branch_name` is not
   * stamped only after a real push (MIN-123), but this push is precisely the
   * first of the run in the normal case: the function would read a null branch
   * and would open the pull request on an empty header.
   * 2. **He refuses while a girl writes.** The sandbox is SHARED and
   * `commitAndPush` does `git add -A`: delivering now would take the
   * work of a half-assed `implement` (a component without its translations,
   * a rename left in the middle). This is the parent's write lock
   * ([subagent.ts](../subagent.ts), `writeLock`), kept here because the
   * permission request only sees opencode tools.
   *
   * And it has a `jobsNote` again: since `run_background` is rested
   * in tool local, a dev server can very well be running at the time of
   * delivery. It is killed BEFORE staging, and the model learns it in the same
   * response — including when the push fails behind.
   */
  const createPr: SupervisorTool | null =
    job.writesToRepo && job.authUrl
      ? async (args) => {
        const writing = subagents.runningImplementId();
        if (writing) {
          return {
            result: {
              error:
                `Sub-agent ${writing} is editing the repository right now, and this sandbox is SHARED — ` +
                `committing now would capture its work half-written. Wait for its report: it is handed to ` +
                `you on its own, you have nothing to call.`,
            },
            success: false,
          };
        }
        const title = typeof args.title === "string" ? args.title.trim() : "";
        // Nothing should be written to the repository during `git add -A`: a watcher
        // who regenerates a file in the middle of staging gets committed halfway.
        const jobsNote = await stopJobsForStaging();
        let pushed: VmPushResult;
        try {
          pushed = await pushWork(title || `wip(${job.commitRef}): agent update`);
        } catch (err) {
          // A failed push is a TOOL error: the model reads it and decides. THE
          // the message may echo the push URL, including the token (MIN-239).
          const detail = `push failed: ${outward((err as Error).message)}`;
          return {
            result: { error: jobsNote ? `${detail} ${jobsNote}` : detail },
            success: false,
          };
        }
        const res = await cp.callTool("create_pr", {
          args,
          pushed,
          ...(jobsNote ? { jobsNote } : {}),
          workBranch: job.workBranch,
        });
        return { result: res.result, success: res.success };
      }
    : null;

  /** Explicit preflight checks. Publishing a pull request must stay fast and side-effect focused. */
  const validateChanges: SupervisorTool | null = job.writesToRepo
    ? async () => ({
        result: {
          validated: true,
          note: "Validation finished. Read the attached type-check, test, and diff report.",
        },
        success: true,
      })
    : null;

  /**
   * Reason for refusing a tool call, by `callId`. It only serves one thing, and
   * it counts: place `tool_result.reason` on the event of the tool refused, like the
   * home loop was doing it (`FORBIDDEN_COMMAND_REASON` is what makes the refusals
   * MEASURABLE on `agent_run_events`). The translator is pure: he knows neither
   * what one responded to a permission, nor what the bridge refused.
   *
   * Declared BEFORE the bridge because both feed it: the verdict of
   * permission for built-in tools, bridge for local tools
   * (`run_background`, of which `checkCommand` excludes a `git push`).
   */
  const refusedCalls = new Map<string, string>();

  /**
   * TOOL CALLS WHO TALKED ABOUT OTHER THAN THE DEPOSIT, by `callId` and with
 * their path count (MIN-361). Local path only.
   *
   * Twin of `refusedCalls`, and for the same reason of form: what we
   * learns at the CALL must still be known at the RESULT, which arrives later and
   * only carries its identifier. Without it, output a `cat ~/.ssh/id_rsa`
   * would rise integer — the text of a private key contains no path, so
   * nothing to look at in the output itself.
   */
  const foreignCalls = new Map<string, number>();
  /** How many outputs remained on the machine — the lathe logs it. */
  let withheldOutputs = 0;
  /**
   * The LAST checklist mirrored to the ticket, serialized. A reissue at
   * the identical does not rewrite someone else's plan (see `update_plan`).
   */
  let lastPlanSynced = "";

  const bridge = await (deps.startToolBridge ?? startToolBridge)({
    job,
    cp,
    delivery,
    onToolRefused: (callId, reason) => refusedCalls.set(callId, reason),
    // A REVIEW session has neither: `agentToolsFor` does not have them
    // is not used for anchoring `pr`, and the bridge refuses what would happen anyway.
    supervisorTools: {
      ...(createPr ? { create_pr: createPr } : {}),
      ...(validateChanges ? { validate_changes: validateChanges } : {}),
      // `handle` never raises: everything returns to the model as a result of
      // tool, successful or in error (ceiling reached, order refused, unknown job).
      ...(servesBackground ? { run_background: (args) => background.handle(args) } : {}),
      /**
       * THE TOUR CHECKLIST — a CONTROL tool, executed here and nowhere
       * elsewhere (the same gesture as the home loop: normalize, emit
       * `plan_update`, mirror to the ticket map, respond `ok`).
       *
       * Until now it was based on the control plane with the domain tools, which
       * does not have a handler for it: `404: unknown platform tool: update_plan`
       * on every call, on ALL opencode runs — the thread map bar does not
       * never filled, and the model was reading an error where it expected
       * an acknowledgment of receipt.
       */
      update_plan: async (args) => {
        const plan = normalizePlan(args.plan);
        await cp.emit("plan_update", { plan });
        /**
         * MIRROR TO TICKET PLAN — best effort, and **never twice for
         * the same plan** (MIN-364, lot 9).
         *
         * This is the real response to §3 #12 of the audit of 08/15, which criticized
         * `todowrite` to cost “20 network writes on a shared surface”:
         * measured, `todowrite` does not write anywhere outside of opencode. Writing
         * network, it is THIS one — and the ticket is indeed a shared surface,
         * which others read and edit.
         *
         * A model commonly reissues its checklist identically (the prompt
         * request to send the ENTIRE plan at each change, and "change"
         * is his judgment). These repetitions teach nothing to anyone and
         * rewrite someone else's plan anyway.
         *
         * The event always leaves: it is the log of what the model has
         * FACT, and “he reissued the same plan five times” is a fact that a
         * autopsie doit pouvoir lire.
         */
        const signature = JSON.stringify(plan);
        if (signature !== lastPlanSynced) {
          lastPlanSynced = signature;
          await cp.syncPlan(plan).catch(() => {});
        }
        return { result: { ok: true }, success: true };
      },
      // The paths were joined by the desktop app to the local job. They don't
      // never go through the control plane; the tool therefore remains entirely
      // local and does not even exist on a cloud run.
      ...(isLocalJob(job)
        ? {
            list_projects: async () => ({
              result: {
                projects: (job.localProjects ?? []).map((project) => ({
                  id: project.id,
                  name: project.name,
                  key: project.key,
                  local_path: project.localPath,
                })),
              },
              success: true,
            })
          }
        : {}),
    },
    ...(deps.toolBridgePort != null ? { port: deps.toolBridgePort } : {}),
  });
  timing("tool-bridge-ready");

  const env = {
    ...opencodeServerEnv(job, {
      baseUrl: proxy.url,
      repoInstructionFiles: await servedInstructionsPromise,
    }),
    // The address of the bridge, read by the 32 tools generated (see `SUPERVISOR_URL_ENV`).
    [SUPERVISOR_URL_ENV]: bridge.url,
  };

  /**
   * THE THREE PORTS THAT `webfetch` STILL REFUSES (MIN-364, decision D8).
   *
   * The refusal covered all private space, and its collateral damage was the
   * capacity we want: `curl localhost:3000` to see render the page
   * that we have just written. What remains refused is what is not a page —
   * the **LLM proxy** (it carries the model key), the **tools bridge** (it
   * does not authenticate ANYTHING: joining your port means calling `create_pr` or
   * `update_issue` in place of the agent) and the **opencode server** of the tour
   * (its API responds to whoever joins it: open a session, respond to a
   * permission in place of the supervisor).
   *
   * Read here because it is here, and nowhere else, that they are known: the
   * first two are assigned at startup, the third comes from the host.
   */
  const harnessPorts = [
    portOfUrl(proxy.url),
    portOfUrl(bridge.url),
    deps.opencodePort,
  ].filter((port) => port > 0);

  /**
   * STARTED IN `try`, and this is not a technical detail: the proxy and the
   * bridge are already listening. A server that does not start would otherwise leave both
   * open sockets, and a process which chained two rounds would be refused
   * his `listen` and would die from that, not from its cause.
   */
  let server: { stop(): Promise<void> } | null = null;
  const client = deps.client(`http://127.0.0.1:${deps.opencodePort}`);

  /**
   * THE LEDGER OF THE TOUR, DECLARED OUTSIDE THE `try` — so that the EXCEPTIONAL path
   * can still take back what the supplier invoiced (MIN-286).
   *
   * It only takes its value once the session is known; before that there is nothing
   * to return, and `null` says so.
   */
  let ledger: TurnLedger | null = null;

  try {
    server = await deps.startServer(env);
    timing("opencode-process-started");
    const bootTimeoutMs = deps.bootTimeoutMs ?? OPENCODE_BOOT_TIMEOUT_MS;
    const bootStartedAt = now();
    if (!(await client.waitHealthy(bootTimeoutMs))) {
      // The REALLY expected time, not the ceiling: the two only coincide
      // if each probe returned on time, and that is precisely what we want to read.
      return failed(
        `opencode did not become healthy — waited ${now() - bootStartedAt} ms (cap ${bootTimeoutMs} ms)`,
      );
    }
    timing("opencode-healthy");

    // OpenCode lazy loads catalog (and model configuration)
    // at the first prompt. We start it as soon as the server responds and we recover this
    // cost with session creation/resumption and local key mint.
    // However, a comfort endpoint that fails should never refuse the run:
    // the prompt knows how to perform exactly the same loading itself.
    const warmToolsPromise = client
      .warmTools(job.model)
      .then(() => timing("opencode-tools-ready"))
      .catch((err) => {
        console.warn("[supervisor] opencode tool warm-up failed:", (err as Error).message);
      });

    // ── The session: resumed by the journal, or new ────────────────────────
    let sessionId = previous?.sessionId ?? "";
    if (previous?.events?.length) {
      // Recovery costs 95 ms for 86 events (measured) — and that's what makes a
      // tower independent of the microVM that preceded it.
      await client.syncReplay(previous.events).catch((err) => {
        console.error("[supervisor] replay failed:", (err as Error).message);
        sessionId = "";
      });
    }
    /**
     * ON A MACHINE, MEMORY IS A FILE — so it can be missing
     * (MIN-361).
     *
     * A local run does not export its journal (see `syncJournal`): its
     * conversation lives in the opencode SQLite database, under the run root. THE
     * checkpoint always bears the `sessionId` — and an identifier without its
     * base is the worst, a turn that speeds up a session that the
     * server does not know. A cleaned work file, another machine,
     * a purged `~/Library` is enough.
     *
     * We then start fresh, which the code already knows how to do just below:
     * the conversation loses its memory, the ticket and the deposit are still there.
     * The probe is a `test -f` — never a reason to refuse the trick, hence the
     * `catch` returns “absent”.
     */
    if (local && sessionId) {
      const probe = await host
        .exec(`test -f ${sq(opencodeDbPath(job.layout))}`, { timeoutMs: 10_000 })
        .catch(() => null);
      if (!probe || probe.exitCode !== 0) {
        console.log("[supervisor] no local opencode store — starting a fresh session");
        sessionId = "";
      }
    }
    if (!sessionId) {
      sessionId = (await client.createSession(`minddy ${job.commitRef}`)).id;
    }
    timing(previous?.sessionId ? "opencode-session-resumed" : "opencode-session-created");

    // The server and session were booted during mint. We keep the
    // refusal BEFORE the prompt — no supplier call goes out without a key — but
    // a slow key no longer serializes all OpenCode startup behind it.
    await Promise.all([warmToolsPromise, ...(authenticatedLlmKeyPromise ? [authenticatedLlmKeyPromise] : [])]);

    // ── The flow, translated as the water goes by ─────────────────────────────────────
    const state = newTurnStreamState();
    const turnLedger = new TurnLedger(job, sessionId, subagents);
    ledger = turnLedger;
    let costUsd = 0;
    let sessionError: string | undefined;
    let lastLiveAt = 0;
    /**
     * TOOLS STARTED IN THE CURRENT ROUND — by ROUND, and by the MOTHER alone.
     *
     * The thread reads this counter as a predicate: `tools === 0` ⇒ the text in
     * being written is perhaps the final answer, and it takes the place of
     * summary ([agent-event-feed.tsx](../../../../components/agent/agent-event-feed.tsx),
     * `isLiveAnswer`). The home loop sends `acc.size`, the INTERNAL accumulator
     * to a round (`agent-loop.ts`): a cumulative turn would say “narration” on
     * all responses of a trick that called a tool once, and would count
     * in addition the gestures of the daughters, which are not those of the mother.
     */
    let toolsSeen = 0;
    /** The end of the mother's last round — `idle` does not carry this information. */
    let lastParentFinish: string | null = null;
    /** A text action announcement only repairs once: never loops. */
    let repairedPreamble = false;
    let repairedPermissionCascade = false;
    let rejectedPermissionThisRound = false;
    /**
     * THE REFLECTION IN PROGRESS, as the live broadcast tells it (MIN-122).
     *
     * `startedAt` is the opencode timestamp; the duration is calculated here because
     * it is here that there is a clock - the translator remains pure. Returned to
     * `null` as soon as the part closes: a counter which would continue to run
     * behind a model who writes would say that he still thinks.
     */
    let reasoningSince: number | null = null;
    /**
     * THE FILES OF THE CURRENT TOUR, carried by EACH load of the live — the
     * provisional half of which `files_changed` (derived from git, at the end of the round) is
     * authority. The module is shared with the other engine ([live-edits.ts](../live-edits.ts))
     * for the reason which gave rise to it: a state held in duplicate ends up not
     * no longer be, and the list was then only displayed on one of the two paths.
     *
     * What we know here is poorer than a homemade `edit_file`: the demand for
     * permission gives the PATH, not the nature of the gesture. So everything is noted
     * `modified` — the git list, at the end of the turn, will say “added” or
     * “deleted” if it was.
     */
    const liveEdits = newLiveEditLog();
    refreshLocalLiveStats = () => {
      if (!local || liveStatsTimer || !filesFromSha) return;
      let attempt = 0;
      const schedule = () => {
        liveStatsTimer = setTimeout(() => {
          liveStatsTimer = null;
          void (async () => {
            const scope = current ? await attributedScope() : undefined;
            const diff = await readWorkingDiff(host, filesFromSha, {
              patches: true,
              scope,
              maxBytes: LOCAL_WORKING_DIFF_MAX_BYTES,
            }).catch(() => null);
            // The permission comes BEFORE the tool has finished writing. A big one
            // patch may therefore not be visible at the first reading: twice
            // Short ones are better than an empty diff until the end of the round.
            if (!diff || diff.files.length === 0) {
              if (attempt < 2) {
                attempt += 1;
                schedule();
              }
              return;
            }
            liveEdits.noteStats(diff.files.map(localDiffStat));
            publishLive({
              text: "",
              tools: toolsSeen,
              reasoningActive: false,
              reasoningMs: 0,
              ...liveEdits.payload(),
            });
            cp.emitDiff({ ...diff, ...(current ? { snapshot: true } : {}) });
          })();
        }, attempt === 0 ? 350 : 650);
      };
      schedule();
    };
    /** What the tour still has the right to spend. Absent = no cap. */
    let budgetUsd = job.budgetUsd;
    let lastBudgetAt = now();
    let budgetExhausted = false;
    /** The round ended with questions: the session WAITING for the user. */
    let askedUser = false;
    /**
     * DOES THE QUESTION SUSPEND THE TURN, OR DOES IT END IT (MIN-364, D7)?
     *
     * On the user's machine, it suspends: the tool `question` blocks
     * without timeout, no one pays compute during this time, and someone is
     * in front of the screen. In microVM it terminates — this is the original pattern, and it
     * stays true there.
     *
     * `job.interactive === false` (a ROUTINE) doesn't have the tool anyway.
     */
    const questionsSuspend = local && job.interactive !== false;
    /**
     * THE QUESTION IN FLIGHT. Not zero = the model is waiting, the turn is suspended, and
     * the user's next message is THEIR RESPONSE — not steering.
     *
     * She brings her questions because the opencode protocol wants the answers
     * IN THE ORDER of the questions asked (`answers: string[][]`), where the map of
     * the UI only returns a composed text: `matchAskUserAnswers` does the path
     * reverse, and he needs the list.
     */
    let pendingQuestion: { id: string; questions: AskUserQuestion[] } | null = null;
    /** The non-deposit files already announced in the thread — one per turn, not one per access. */
    const outsideDirs = new Set<string>();
    /**
     * ONE CUT THAT WE REQUESTED, and only one — the flag is CONSUMED.
     *
     * Opencode publishes the same `MessageAbortedError` after the round has been cut
     * (ceiling, “Stop”, steering, deadline, question) or whether it has been decided
     * in flight. This counter is what distinguishes them: what we asked for is silent,
     * the rest is a failure. Consumed rather than left at `true`, because a
     * lap continues after steering — the FOLLOWING cut was not
     * requested per person.
     */
    let abortsRequested = 0;
    const abortSession = async (): Promise<void> => {
      abortsRequested += 1;
      await client.abort(sessionId);
    };
    /**
     * AUTHORIZED delegations whose daughter has not yet been born, by `callId`.
     * The simultaneous ceiling is counted on it as much as on the living ones
     * (see `SubagentContext.pending`); the credit is settled at the birth of the
     * daughter, or at the end of `task` if he has never done one.
     */
    const pendingTasks = new Set<string>();

    const abortEvents = new AbortController();
    const stream = client.events(abortEvents.signal);
    // Reset at each prompt. A `reasoning`, text or tool/permission event is
    // the first signal actually produced by the model; the events of
    // server connection events therefore do not count as a false first token.
    let awaitingFirstModelSignal = false;

    /**
     * ── STEERING AND “STOP” (MIN-286, lot 3) ───────────────────────────
     *
     * What the house loop did at each round boundary: drain the
     * user messages, inject them, and output to the flag
     * interruption. Without that, a tilted project would lose the two most important gestures
     * visible to the product — the “Stop” button would do nothing, and a written message
     * while a round is working would remain in the queue until the next round.
     *
     * A MESSAGE DOES NOT INJECT INTO A WORKING SESSION. At opencode he
     * there is no history to transfer between two calls: there is a round in progress.
     * The gesture is therefore `abort` (40 ms measured, the request in flight ends
     * properly) then a new prompt on the session — which goes through
     * `pendingPrompt`, posted at `session.idle` which follows. It is the same border as
     * the home loop, reached from the other end.
     *
     * `pullSteering` DRAINE: we therefore only call it when we are able to
     * post behind. A message drained and not posted would be lost — no one will.
     * re-queues, and the control plane only re-queues the run on the queue.
     */
    let pendingPrompt: Array<{ message: AgentUserMessage; steered: boolean }> = [];
    let interrupted = false;
    let lastSteerAt = now();

    /**
     * THE OPENCODE LOG CURSOR — and NOTHING BUT the cursor (MIN-286,
     * 2026-08-13).
     *
     * The supervisor no longer accumulates events: it pushes each increment into
     * `agent_run_journal` (`POST /journal`) and only keeps the position by
     * AGGREGATE. What he carried before — the entire diary, rewritten each time
     * backup — could not hold: a `read` of 260 lines weighs 22 KB
     * inside, republished two to three times by opencode, and the body of the plan
     * control is capped at 3.2 MB. A 31 minute tour would therefore lose ALL its
     * conversation, and the next round started again from the ticket as if it had not
     * never worked (measured on 2026-08-13, run `1e8775aa`).
     */
    let journalSeq: Record<string, number> = { ...previous?.seq };
    /**
     * THE INCREMENT, CUT FOR TRANSPORT. The body of a request remains
     * capped by the platform: a round that reads two hundred files would make
     * a single export of several megabytes. We therefore send in batches — and never
     * an event straddling two lots, `/sync/replay` wanting a contiguous suite.
     */
    const JOURNAL_BATCH_BYTES = 1_500_000;

    /**
     * Exports what is new and PUSHES it. Makes the pointer as the checkpoint
     * will carry — the session and the cursor, a few dozen bytes.
     *
     * ───────────────────────────────────────────────────────────────────────
     * EXCEPT ON A MACHINE, WHERE IT EXPORTS NOTHING (MIN-361).
     *
     * This log carries the COMPLETE output of each tool, it is persisted 30
     * days in the production base, and it is replayed in front of the model. In
     * a microVM is the content of a disposable clone of a repository that the project
     * already owns; on a machine, it's someone's disk — the contents
     * of its files, and what the shell went to read.
     *
     * **Its only written justification falls precisely there**: “this is what makes
     * a tour independent of the microVM which preceded it” (cf. the resumption of
     * session above). A microVM is destroyed at the end of the round; a
     * machine, no. The opencode SQLite database lives under `harnessDir`
 * ([opencode-config.ts](opencode-config.ts)), so under the RUN root
     * ([harness-layout.ts](../harness-layout.ts)) and step of the turn: the session
     * is still there in the next round, and the export would only provide a service already
     * returned — at the cost of the only non-repairable point in the file.
     *
     * WHAT WE LOSE, and it is better to write it than to discover it: medicine
     * legal SERVER of a local run. The diary was the only complete record
     * tool outputs; autopsy a local run will therefore be done on the previews
     * thread, and on the opencode log left with its owner.
     *
     * WHAT THIS IMPOSES ON THE LAUNCHER (MIN-293): the root of a local run is not
     * Do not clean between two turns. If it nevertheless disappears, the resumption of
     * session sees this and starts fresh rather than rushing into the void.
     */
    const syncJournal = async (): Promise<OpencodeCheckpointState> => {
      if (local) return { sessionId, seq: journalSeq };
      const fresh = await client.syncHistory(journalSeq);
      let batch: Record<string, unknown>[] = [];
      let bytes = 0;
      const flush = async () => {
        if (batch.length === 0) return;
        await cp.appendJournal(sessionId, batch);
        batch = [];
        bytes = 0;
      };
      for (const raw of fresh) {
        /**
         * THE NEWSPAPER IS SUBSTITUTED LIKE THE WIRE (MIN-328). It carries the exit
         * COMPLETE of each tool — a `cat .git/config`, a `git remote -v` —,
         * it is written to `agent_run_journal`, and it is replayed in the session
         * in the next round: a secret that enters it is persisted in the base AND returned
         * in front of the model. The events thread was there since MIN-239, not him.
         */
        const event = redactDeep(raw, secrets.redact) as Record<string, unknown>;
        const size = JSON.stringify(event).length;
        // An event larger than the lot goes ALONE: cutting it out would mean breaking it.
        if (bytes > 0 && bytes + size > JOURNAL_BATCH_BYTES) await flush();
        batch.push(event);
        bytes += size;
      }
      await flush();
      // The cursor only advances once the increment is WRITTEN: a sending which raises
      // leaves the position from before, and the next pass re-exports the same
      // slice rather than leaving a hole in the newspaper.
      journalSeq = lastSeqByAggregate(journalSeq, fresh);
      return { sessionId, seq: journalSeq };
    };

    /**
     * THE PERIODIC BACKUP, AND THE HEARTBEAT WITH — because it is the same
     * gesture (MIN-286; the default is that of the PR 51 run).
     *
     * This engine had NONE. The only writer of `last_activity_at` on a
     * run that works is this backup ([control-plane.ts](../control-plane.ts),
     * `PUT /checkpoint`), and the supervisor only built his checkpoint
     * the very end. An opencode tour therefore seemed silent since its launch,
     * and the microVM watchdog ([drain.ts](../drain.ts)) was going to query
     * the platform from three minutes of “silence” — on a perfectly
     * alive. A probe which responds poorly at this time concludes “process dead”:
     * the thread displays "the process of this round stopped before finishing",
     * the run goes to rest, and the end of lap report arrives behind to
     * to be refused in 409 — **the conversation of the turn is then lost**, which
     * is exactly what the message promised to avoid ("restored since its
     * last backup”: there was none).
     *
     * TWO MINUTES, and the number is not free: it must remain UNDER the time limit
     * at the end of which the watchdog will probe (three minutes of
     * `last_activity_at` frozen, `VM_LOOP_PROBE_AFTER_MS`). A living ride is not
     * then never a candidate for the probe, and the question of whether the probe says
     * true no longer arises. Home loop saves every five minutes
     * ([turn.ts](turn.ts)): it can afford it, its process responds to the
     * the probe has been running since startup.
     */
    let lastSaveAt = now();
    /** The run was concluded UNDER us (409 on the save): the round ends. */
    let runClosed = false;
    const maybeSaveCheckpoint = async (): Promise<void> => {
      if (now() - lastSaveAt < SUPERVISOR_CHECKPOINT_SAVE_INTERVAL_MS) return;
      lastSaveAt = now();
      try {
        const opencode = await syncJournal();
        // `lastFilesSha` remains at the start: nothing is pushed before the end
        // of the lap, so the baseline of the diff has not moved.
        if (!(await cp.saveCheckpointQuietly(turnCheckpoint(filesFromSha, opencode)))) {
          runClosed = true;
        }
      } catch (err) {
        // A failed save does not break the round: it costs the restart, and
        // the next pass will try again. What she should not do is
        // pushing back the deadline in silence — hence the trace.
        console.error("[supervisor] periodic checkpoint failed:", (err as Error).message);
      }
    };

    /**
     * THE STATUS OF THE TOUR, in the shape of the checkpoint — the same object along the way
     * and on arrival, within two fields (the sha of the files, which moves when pushed).
     * Written once: two parallel constructions would eventually diverge, and
     * it’s the half along the way that would be forgotten.
     */
    function turnCheckpoint(
      lastFilesSha: string,
      opencode?: OpencodeCheckpointState,
    ): OpencodeCheckpoint {
      return {
        // The history of the CONVERSATION is no longer here: it lives in the newspaper
        // of opencode. The field remains (the type is shared with the other engine) and
        // empty part — this is what makes the switch reversible without migration.
        messages: [],
        /**
         * WHERE IS THE LEDGER NUMBERING, and it is the NEXT turn that reads it
         * (`execute.ts`: `run.checkpoint?.usageSeq ?? …`). Without it, a round
         * taken again renumbers its lines over those of the previous round: nothing
         * is not lost (no uniqueness constraint, the expense is summed), but
         * the order of a run's calls becomes wrong — and that's exactly what a
         * `seq` is used to say.
         */
        usageSeq: turnLedger.nextParentSeq,
        lastFilesSha,
        instructions: { paths: [...job.instructions.paths], bytes: job.instructions.bytes },
        // The ceiling of the 5 replay anchors is counted over the life of the RUN, not the
        // turn: the count returns from the function at each call, and it is the
        // checkpoint which carries it until the next round (mirror of `turn.ts`).
        ...(bridge.prInlineComments > 0 ? { prInlineComments: bridge.prInlineComments } : {}),
        /**
         * THE STATE OF THE DELIVERY DOOR, which relates to the TOUR and therefore travels
         * sown. Without it, a tour resumed after cutting the VM is considered blank:
         * he has no longer edited anything, so there is nothing left to type-check or reread, and the
         * code goes to a human without any control having seen it.
         */
        ...(delivery.checkpointEditedPaths().length > 0
          ? { editedPaths: delivery.checkpointEditedPaths() }
          : {}),
        ...(delivery.repoTouched() ? { repoTouched: true } : {}),
        ...(opencode ? { opencode } : {}),
      };
    }
    const takeSteering = async (): Promise<AgentUserMessage[]> =>
      (await cp.pullSteering().catch(() => []))
        .map(parseAgentUserMessage)
        .filter((message) => message.text.trim());

    /**
     * ANSWER THE QUESTION IN FLIGHT, and the round STARTS BY ITSELF (D7).
     *
     * Neither `abort` nor re-prompt: the tool `question` is suspended on this request,
     * and answering it resolves it to `completed` with “User has answered your
     * questions: … ". This is what REMOVES the detour from before - the answer did not
     * no more going through the steering, so no more opening one more lap.
     *
     * The thread still receives its `user_message`: without it, the response from
     * the user would have no trace in the conversation (she lives in the
     * result of the tool, which the thread does not show as human speech).
     */
    const answerPendingQuestion = async (messages: AgentUserMessage[]): Promise<void> => {
      const asked = pendingQuestion;
      if (!asked) return;
      // Multiple messages should not arrive (the card replaces the
      // compose), but if they arrive they are all the answer: lose one
      // would lose a sentence that the user wrote.
      const text = messages.map((m) => m.text.trim()).filter(Boolean).join("\n\n");
      const mentions = messages.flatMap((m) => m.mentions ?? []);
      pendingQuestion = null;
      await cp.emit("user_message", {
        text: cap(text, 4000),
        ...(mentions.length > 0 ? { mentions } : {}),
      });
      /**
      * THE REVERSE OF THE CARD: it composes `question → answer` per line, we
       * re-associate. An answer that we can't match to anything — free text
       * typed off-card, “I pass” — FULL part on the first question
       * rather than “Unanswered”: opencode copies the labels as they are
       * model, and silence would be the only form that really loses what
       * the user said.
       */
      const matched = matchAskUserAnswers(asked.questions, text);
      const answers = matched.some((entry) => entry.answer)
        ? matched.map((entry) => (entry.answer ? [entry.answer] : []))
        : asked.questions.map((_, i) => (i === 0 ? [text] : []));
      await client.replyQuestion(asked.id, answers).catch((err) => {
        // A response that does not arrive leaves the tool hanging until the
        // deadline. To say - but not to bring down the trick, as for the
        // permissions: the model will see its tool never render.
        console.error("[supervisor] question reply failed:", (err as Error).message);
      });
    };

    /**
     * DISMISSES the question in flight — the gesture of ANY tower exit that finds one
     * one (“Stop”, deadline, ceiling, run concluded elsewhere). Without him, the tool
     * would remain `running` forever in opencode history, and the turn
     * next would replay a call that was never resolved.
     */
    const closePendingQuestion = async (): Promise<void> => {
      const asked = pendingQuestion;
      if (!asked) return;
      pendingQuestion = null;
      await client.rejectQuestion(asked.id);
    };
    /**
     * Post the pending prompt on an idle session, and tell the thread what
     * comes from the USER.
     *
     * `steered` distinguishes the two, and it is not cosmetic: the turn prompt
     * is already in the thread (this is the launch message, or the response displayed
     * by composing it), while a steering message has no other trace.
     * Emitting both would cause the user to read the same sentence twice.
     */
    const postPending = async (): Promise<void> => {
      const parts = pendingPrompt.splice(0);
      if (parts.length === 0) return;
      /**
       * A NEW ROUND HAS NO PENDING CUTS. The counter was DECREMENTING
       * only, and a `abort` can very well not publish anything — opencode responds
       * 200 on a session already at rest (`opencode-client.ts`), and the steering
       * cuts off a session whose round has sometimes just ended. THE
       * credit then remained open until the end of the round, and the NEXT
       * cut suffered — the one that no one asked for — was being swallowed in
       * silence: no event, no error, a “finished” round.
       *
       * The flow order makes resetting safe: `session.error`
       * (`MessageAbortedError`) precedes the `session.idle` from which we rest, therefore
       * a real break requested is already consumed when we arrive here.
       */
      abortsRequested = 0;
      /**
       * AND THE ROUND STARTS CLEAN. A cut round (steering) does not publish either `usage`
       * nor end of round: without this reset, its tool counter
       * continued to run under in the following rounds. And a session error
       * already passed should not condemn what starts again here: we keep it
       * for the thread (the event `error` is gone), not for the VERDICT of the round —
       * otherwise a restarted round which ends well would be placed "in error", without its
       * `summary`, and would therefore be read as interrupted.
       */
      toolsSeen = 0;
      sessionError = undefined;
       for (const part of parts) {
         if (part.steered) {
           await cp.emit("user_message", {
             text: cap(part.message.text, 4000),
             ...(part.message.mentions?.length ? { mentions: part.message.mentions } : {}),
           });
         }
       }
       await client.promptAsync(
         sessionId,
         parts.map((part) => promptWithMentions(part.message.text, part.message.mentions)).join("\n\n"),
       );
       awaitingFirstModelSignal = true;
       timing("prompt-accepted");
       /**
        * A provider can first stream the reasoning or arguments of a
        * tool that OpenCode only transforms into an event once the block is finished.
        * GPT-OSS-20B did this for 48 s while OpenRouter had delivered its
        * first token in less than a second. At this point the prompt IS accepted
        * and the round actually works: exit “session start”
        * for the reflection indicator therefore describes reality, without inventing
        * text nor double the final stream.
        */
       if (reasoningSince === null) reasoningSince = now();
       publishLive({
         text: "",
         tools: toolsSeen,
         reasoningActive: true,
         // Not zero: it is no longer the “start” state, the round has started.
         reasoningMs: 1,
         ...liveEdits.payload(),
       });
    };

    /**
     * THE FIRST PROMPT OF THE ROUND: what the function composed (context of the ticket
     * + request, on a cold ride) PLUS what was waiting in line. A ride
     * taken up only has the second - that's how the answer to a question comes
     * and the “and now do this instead” written while the VM was sleeping.
     */
    pendingPrompt = [
       ...(input.prompt.trim()
         ? [{ message: { text: input.prompt.trim() }, steered: false }]
         : []),
       ...(await takeSteering()).map((message) => ({ message, steered: true })),
    ];
    if (pendingPrompt.length === 0) {
      /**
       * NOTHING TO SAY TO THE MODEL: we do not post an empty prompt, and above all we do not
       * do not make a raise ("continue") which would make one round pay for
       * learn that there is nothing to do. The round ends, the function puts the
       * session idle, and the next message will wake it up.
       */
      console.error("[supervisor] nothing to prompt — ending the turn");
      return {
        status: "completed",
        costUsd: 0,
        checkpointDropped: [],
        checkpointBytes: 0,
        pushed: null,
        workBranch: job.workBranch,
        sandboxMs: job.bootstrapMs + (now() - startedAt),
      };
    }
    await postPending();

    const deadline = startedAt + SUPERVISOR_TURN_SOFT_DEADLINE_MS;
    let timedOut = false;

    /**
     * ── THE LIFE OF THE TOUR, OUTSIDE THE FLOW ───────────────────── ─────────────────────
     *
     * The “Stop”, the steering, the heartbeat and the wall deadline. Returns
     * `true` when the turn should come out.
     *
     * Exiting the event loop for an irregular reason: these
     * These four should NOT depend on the arrival of an event. A `bash` of
     * twenty minutes, a model who thinks for a long time, a supplier who stalls:
     * the flow was silent, and with it stopped the only writer of
     * `last_activity_at` — so the watchdog went to probe a microVM
     * perfectly alive (`drain.ts`, three minutes) —, the “Stop” button, and
     * the twelve hour deadline. A silent stream froze the entire tower.
     */
    const lifecycle = async (): Promise<boolean> => {
      /**
       * THE “STOP” AND THE STEERING. The granularity is that of the beat: a
       * `bash` of three minutes delays the stop by five seconds at most, where it
       * delayed it by three minutes — it was already the worst case of the loop
       * house, who only reread the flag between two rounds.
       */
      if (now() - lastSteerAt >= STEER_POLL_INTERVAL_MS) {
        lastSteerAt = now();
        const stopping = await cp.checkInterrupt().catch(() => false);
        /**
         * A STOP ACCOMPANIED BY A MESSAGE continues in THIS lap (“stop
         * and do this instead): the dialer always sends the torque steer
         * THEN interrupt. So we only drain there, and we consume the flag -
         * otherwise the following survey would reread it and come out, message accepted
         * and never played (same reasoning as `clearInterrupt` in
         * `agent-loop.ts`).
         *
         * Outside of stopping, we only drain AFTER knowing that there is something:
         * `pullSteering` consumes, and a message drained without being played would be
         * lost for good.
         */
        const steered =
          stopping || (await cp.hasPendingMessages().catch(() => false))
            ? await takeSteering()
            : [];
        /**
         * THE ANSWER TO A QUESTION IS NOT STEERING (D7). She unties a
         * tool suspended, and the round that was waiting for it starts again by itself: cut
         * the session here would kill precisely the round that we have just unlocked.
         *
         * The “Stop” which accompanies it is consumed without being played, and it is the
         * good driving: the dial always sends the steer + interrupt torque
         * ([agent-conversation.tsx](../../../components/agent/agent-conversation.tsx)),
         * but here the user RESPONDS — he is not asking to stop.
         */
        if (pendingQuestion && steered.length > 0) {
          if (stopping) await cp.clearInterrupt().catch(() => {});
          await answerPendingQuestion(steered);
          return false;
        }
        if (stopping) {
          if (steered.length === 0) {
            interrupted = true;
            await closePendingQuestion();
            await abortSession();
            return true;
          }
          await cp.clearInterrupt().catch(() => {});
          pendingPrompt.push(...steered.map((message) => ({ message, steered: true })));
          await closePendingQuestion();
          await abortSession();
        } else if (steered.length > 0) {
          pendingPrompt.push(...steered.map((message) => ({ message, steered: true })));
          await closePendingQuestion();
          await abortSession();
        }
      }
      // The periodic backup IS the heartbeat (see his comment).
      await maybeSaveCheckpoint();
      if (runClosed) {
        // The run was concluded elsewhere (cancelled, or already stamped). Continue, this
        // would be spending in the name of a conversation that no longer exists.
        interrupted = true;
        await closePendingQuestion();
        await abortSession();
        return true;
      }
      if (now() > deadline) {
        timedOut = true;
        await closePendingQuestion();
        await abortSession();
        return true;
      }
      return false;
    };

    try {
      /**
       * THE FLOW, READ BY HAND RATHER THAN IN `for await` — so that silence does not
       * freezes nothing (see `lifecycle`). The wait for the next event runs against a
       * beat; the promise in flight is KEPT from one turn of the loop to the next,
       * otherwise each beat would open a new one and drop
       * the event that the previous one was going to make.
       */
      const beatMs = deps.lifecycleBeatMs ?? LIFECYCLE_BEAT_MS;
      const iterator = stream[Symbol.asyncIterator]();
      let nextEvent: Promise<IteratorResult<OpencodeEvent>> | null = null;
      for (;;) {
        nextEvent ??= iterator.next();
        let timer: ReturnType<typeof setTimeout> | undefined;
        const beat = new Promise<typeof LIFECYCLE_BEAT>((resolve) => {
          timer = setTimeout(() => resolve(LIFECYCLE_BEAT), beatMs);
        });
        const winner = await Promise.race([nextEvent, beat]);
        clearTimeout(timer);
        if (winner === LIFECYCLE_BEAT) {
          if (await lifecycle()) break;
          continue;
        }
        nextEvent = null;
        if (winner.done) break;
        const raw = winner.value;
        const out = translateEvent(raw, state);
        if (
          awaitingFirstModelSignal &&
          (out.reasoning || out.liveText || out.permission || out.question || out.events.length > 0)
        ) {
          awaitingFirstModelSignal = false;
          timing("first-model-signal");
        }
        // A session that is not the mother is a DAUGHTER: the model has delegated,
        // and opencode publishes everything to the same feed. What comes from her is said,
        // is counted and billed — but in her own gang, and without ever
        // speak on behalf of the mother (see `Translation.sessionId`).
        const child = !!out.sessionId && out.sessionId !== sessionId;
        if (!child && !firstVisibleTextSignal && liveTextOf(state, sessionId).trim().length > 0) {
          firstVisibleTextSignal = true;
          timing("first-visible-text-signal");
        }

        /**
         * THE GUARD, ANSWER BEFORE ALL THE REST — a suspended tool waits, and
         * every extra millisecond is billed microVM time. There
         * decision is pure ([opencode-permissions.ts](opencode-permissions.ts)),
         * which makes it testable without a server; what is here is the
         * connection, and the fact that a refusal is told over the wire.
         */
        // A girl linked to her call of `task`: this is what gives her name
        // to the events that follow, and his gang at the ledger. His birth balance
        // with the same gesture the credit opened by the authorization (see `pendingTasks`).
        if (out.child) {
          subagents.register(out.child);
          pendingTasks.delete(out.child.callId);
        }

        if (out.permission) {
          let verdict = decidePermission(
            out.permission,
            job.layout.repoDir,
            {
              names: new Set(agentTable.keys()),
              running: subagents.running,
              pending: pendingTasks.size,
              maxParallel: job.subagents.maxParallel,
            },
            { local, harnessPorts },
          );
          /**
           * THEN DISK AND RESOLVER (MIN-360), and on the local path
           * only. Two safeguards cannot be decided on a chain: one
           * symbolic link placed in the repository (`ln -s`, which nothing prevents) and
           * a public domain that resolves to the local loop.
           *
           * The meaning is one way — `refineLocalVerdict` can only refuse
           * what was authorized —, and it is applied BEFORE the side effects
           * of the verdict: a writing refused here must not enter into the
           * perimeter of the tour.
           */
          if (local) {
            verdict = await refineLocalVerdict(out.permission, verdict, job.layout.repoDir, {
              harnessPorts,
            });
          }
          if (verdict.reason && out.permission.callId) {
            refusedCalls.set(out.permission.callId, verdict.reason);
          }
          if (verdict.reply === "reject") rejectedPermissionThisRound = true;
          /**
           * AN AUTHORIZED DELEGATION OPENS A CREDIT, until his daughter
           * exists. This is what makes the simultaneous cap operating on the only
           * case which puts it to the test: a round which calls `task` several
           * times, whose requests are all arbitrated before the first
           * naissance (cf. `SubagentContext.pending`).
           */
          if (
            out.permission.permission === "task" &&
            verdict.reply === "once" &&
            out.permission.callId
          ) {
            pendingTasks.add(out.permission.callId);
          }
          /**
           * EACH FILE EXIT LEAVES A TRACE (MIN-364, decision D5).
           *
           * This is the counterpart of openness, and its only justification
           * honest: the wall before only caught honest tools and
           * pushed the work towards `bash`, that is to say towards the place where we
           * can't see anything anymore. Here the verdict does not restrict anything AND the thread keeps the
           * list — the exact opposite of the situation in §2 of the audit.
           *
           * The path is rewritten by `scrubPaths` like the rest of the path
           * local: what comes up says “the agent went out to `~/Projets/autre`”,
           * not the user name.
           */
          if (
            local &&
            out.permission.permission === "external_directory" &&
            verdict.reply === "once" &&
            !child
          ) {
            /**
             * ONCE PER FOLDER, not once per file. Opencode asks again
             * at each access (we answer `once`, never `always`), and a turn which
             * reads thirty files from a neighboring repository would publish thirty lines
             * identical: the thread would become illegible, so the trace would not be
             * no longer read — which would mean not having it.
             */
            const outside = scrubPaths(out.permission.filepath ?? "", job.layout.repoDir);
            if (outside && !outsideDirs.has(outside)) {
              outsideDirs.add(outside);
              await cp.emit("status", { phase: "outside_repo", path: outside }).catch(() => {});
            }
          }
          /**
           * AN AUTHORIZED WRITING IS A TOUR EDITION. This is the only place
           * where we see it: at opencode, editing is an INTEGRATED tool, and its
           * request for permission is what our `edit_file` was telling us. From there
           * come the targeted type-check of the delivery door, the mode
           * `related` of the test runner, and the “repository has been hit” lock.
           */
          if (out.permission.permission === "edit" && verdict.reply === "once") {
            /**
             * ONE PATCH TOUCHES N FILES AND ONLY REQUESTS ONCE. `editPaths`
             * returns the real list (`metadata.files`) rather than the `filepath`
             * glued back to the comma, which gave a single line “a.ts, b.ts,
             * c.ts” in the changed files — and a single entry for the
             * targeted type-check of the delivery gate, on a path that
             * does not exist.
             */
            const targets = editTargets(out.permission);
            for (const { path } of targets) delivery.noteEdit(path);
            // …and they are SEEN immediately: an edition does not advance the
            // round (neither text nor reflection), so nothing else would make
            // a direct charge before the next round.
            const live = targets
              .map(({ path, status }) => ({ path: repoRelative(job.layout.repoDir, path), status }))
              .filter((edit) => edit.path);
            if (live.length > 0 && !child) {
              liveEdits.note(live);
              lastLiveAt = 0;
              publishLive({
                text: outward(liveTextOf(state, sessionId)),
                tools: toolsSeen,
                reasoningActive: false,
                reasoningMs: 0,
                ...liveEdits.payload(),
              });
              // The paths are visible immediately; the exact counters
              // follow as soon as the tool has finished writing them to the local disk.
              refreshLocalLiveStats();
            }
          }
          await client
            .replyPermission(out.permission.id, verdict.reply, verdict.message)
            .catch((err) => {
              // A verdict that does not arrive leaves the tool hanging until the
              // deadline of the round. To say, therefore – but not to bring down the trick:
              // the model will see its tool never render, and that is already a signal.
              console.error("[supervisor] permission reply failed:", (err as Error).message);
            });
        }

        /**
         * THE QUESTION — AND THIS IS THE ONLY PLACE IN HARNESS WHERE BOTH WORLDS
         * DO TWO DIFFERENT THINGS OF THE SAME EVENT (MIN-364, decision D7).
         *
         * **In microVM, `ask_user` remains TERMINAL.** The questions follow,
         * the session goes on hold, and the response comes back in the next round with
         * the steering. At opencode the tool BLOQUE — keep a microVM open on
         * time for a human to come back would cost hours of computing to do nothing
         * TO DO. We therefore dismiss the question (the tool resolves, the history remains
         * paired) and we cut the round. Measured: `reject` makes the tool in error
         * “The user dismissed this question”, and the `abort` alone would make it
         * “Tool execution aborted” — both leave a history that the trick
         * the next round replays without a gap.
         *
         * **On someone's machine, it SUSPENDS.** The reason for refusal was named
         * the microVM, and it is zero on a Mac: there is no compute to
         * pay, and the user is in front of the screen. The tool blocks itself —
         * measured, without timeout, and answering it does not end the round
         * ([opencode-wait.probe.test.ts](opencode-wait.probe.test.ts)) — therefore there is
         * there is literally NOTHING to do here: we note the question in flight, and
         * `lifecycle` will recognize the user's next message as its
         * answer. The detour from before (rejection → turn cut → disguised response
         * in steering on the next turn) disappears with its three steps.
         */
        if (out.question && !child) {
          if (questionsSuspend) {
            pendingQuestion = { id: out.question.id, questions: out.question.questions };
          } else {
            askedUser = true;
            await client.rejectQuestion(out.question.id);
            await abortSession();
          }
        }

        /**
         * WHAT THE MODEL CHECKED ITSELF (MIN-262): a test command from the
         * deposit released in 0, without reissue behind, silences the door of
         * delivery — it does not restart 80 s of tests to learn what the
         * turn just read. A daughter counts as the mother: it's the same
         * deposit, and the door only looks at the deposit.
         */
        if (out.shell) {
          delivery.noteShell(out.shell.command, out.shell.exit);
          // `bash` can write without using the `edit` permission (codemod,
          // generator, mv/rm). His return is then the first moment where the
          // patch is definitely on disk.
          if (local && out.shell.exit === 0 && !child) refreshLocalLiveStats();
        }

        for (const event of out.events) {
          /**
           * `update_plan` DOES NOT MAKE BUBBLES — it is a CONTROL tool, and the
           * home loop did not emit any event (`agent-loop.ts`: `emit`
           * `plan_update` then `continue`, before any writing of `tool_call`).
           * At opencode it goes through binary like the others, so the flow
           * publishes the shares: without this filter, the thread showed the checklist
           * TWICE — a plan bar and a raw tool call above —, and
           * the live tool counter counted a gesture which is not one.
           */
          if (event.payload.name === "update_plan") continue;
          if (event.type === "tool_call" && !child) toolsSeen += 1;
          // A `task` which ends without having made a girl (error, refusal)
          // would make its credit eternally open: the ceiling would close
          // on a tour that no longer delegates anything.
          if (event.type === "tool_result" && event.payload.name === "spawn_agent") {
            pendingTasks.delete(String(event.payload.id ?? ""));
          }
          const reason =
            event.type === "tool_result"
              ? refusedCalls.get(String(event.payload.id ?? ""))
              : undefined;
          let payload = redactPayload(event.payload, secrets);
          /**
           * THE QUESTION CARD NEEDS TO KNOW IF IT IS BLOCKING (MIN-364, D7).
           *
           * The thread only showed the map at REST, and that was only fair as long as one
           * question ended the round. She now suspends: the agent is
           * `running` while waiting, and a card that only appears when resting
           * would leave the user in front of a disarmed dialer, with nothing to
           * respond, while the model waits for its response.
           *
           * The flag travels on the EVENT rather than on the run: the thread rereads its
           * events, and a past run must be replayed as it was played.
           */
          if (questionsSuspend && event.type === "question") {
            payload = { ...payload, blocking: true };
          }
          /**
           * THEN THE MACHINE ROADS, ON THE LOCAL ROAD (MIN-361).
           *
           * `agent_run_events` is persisted for 30 days and read by any member of the
           * project. Two gestures, and they don't do the same job
           * ([local-uplink.ts](local-uplink.ts)) :
           *
           * - **everything is rewritten** — the deposit becomes relative, the house becomes
           * `~`. This is what deals with `/Users/<first last name>/…`, which is not
           * in suspicious outings but in all;
           * - **an output that speaks about elsewhere is RETAINED**, and only
           * counted. The trigger is the CALL as well as the exit: a
           * `cat ~/.ssh/id_rsa` renders text that carries no path, and
           * Yet it is the case that counts. Hence the calls table
           * foreigners, twin of `refusedCalls`.
           *
           * What remains visible is the GESTURE: we must be able to read what
           * the agent went to do, especially when he went to do it outside the
           * case. What doesn't rise is the CONTENT.
           */
          if (local) {
            const filtered = filterLocalPayload(payload, job.layout.repoDir);
            payload = filtered.payload;
            const callId = String(payload.id ?? "");
            if (event.type === "tool_call" && filtered.foreign && callId) {
              foreignCalls.set(callId, filtered.foreignCount);
            }
            if (event.type === "tool_result") {
              const fromCall = foreignCalls.get(callId) ?? 0;
              const paths = fromCall + filtered.foreignCount;
              if (paths > 0) {
                // The size of the output AS IT WAS: this is what the
                // account must say, not that of the rewritten version.
                const chars = String(event.payload.preview ?? "").length;
                payload = { ...payload, preview: withheldOutput(chars, paths), withheld: paths };
                withheldOutputs += 1;
              }
              foreignCalls.delete(callId);
            }
          }
          // A `spawn_agent` only carries the NAME of the agent: we return the mode to it
          // and the pattern that the thread displays since MIN-112.
          if (payload.name === "spawn_agent") payload = describeSpawn(payload, agentTable);
          // What comes from a girl is said UNDER her call of `task`: without this
          // marking, the thread would attribute to the main agent the gestures of
          // someone else, and would unfold them on the first level.
          const entry = child ? subagents.entry(out.sessionId ?? "") : undefined;
          if (entry) payload = markChildPayload(payload, entry);
          await cp.emit(event.type, {
            ...payload,
            ...(reason ? { reason } : {}),
            // A girl that the flow has not attached to anything remains marked: better
            // is worth an event folded under a session id as a gesture attributed to
            // the main agent.
            ...(child && !entry ? { subagent_id: out.sessionId } : {}),
          });
        }
        if (out.usage) {
          /**
           * THE LIVE GOES QUIET AT THE END OF A CONTINUING ROUND, like `clearLive`
           * of the house loop: what has just been written has already been written
           * in `thinking`, and also leaving it in charge of the direct would do it
           * read in duplicate — a provisional bubble under its final version.
           *
           * The FINAL round keeps its text live: its definitive version
           * (`summary`) only leaves at the very end of the turn, and clearing it here would
           * disappear the response from the screen while the log is exported and
           * of the push. “Final” reads `tool-calls`, not “different from
           * `stop`”: this is the ONLY end that lets the session work, and the
           * translator already decides the narration on the same criterion.
           */
          if (!child && out.usage.finish === "tool-calls") {
            reasoningSince = null;
            lastLiveAt = 0;
            publishLive({
              text: "",
              // `tools: 0` like `clearLive` of the house loop: the load of
              // purge no longer describes anything, and a non-zero counter would read
              // an empty bubble rather than nothing.
              tools: 0,
              reasoningActive: false,
              reasoningMs: 0,
              ...liveEdits.payload(),
            });
          }
          if (!child) lastParentFinish = out.usage.finish;
          // The round is closed, whatever its end: the tool counter
          // start from scratch for the next one.
          if (!child) toolsSeen = 0;
          const line = await turnLedger.record(cp, out.usage, proxy);
          costUsd += line.cost;
          /**
           * THE CEILING, HELD HERE AND NOT IN THE LOOP — because there is no longer
           * of loop to us. The round boundary remains the same as before: we
           * never disconnect a call in flight, we refuse the next one (policy
           * assumed from [usage.ts](../../usage.ts), as in Claude/ChatGPT).
           *
           * It RELITS (`budgetRemaining`), it is not only snapshotted at
           * launch: nothing reserves budget, two competing runs read
           * the same remaining and each take it as the ceiling. What limits the
           * case is the replay frequency — and a round of microVM lasts for
           * hours, so a fixed ceiling at start-up would be blind from start to
           * the end.
           */
          if (now() - lastBudgetAt >= BUDGET_REFRESH_INTERVAL_MS) {
            lastBudgetAt = now();
            const fresh = await cp.budgetRemaining();
            // `costUsd + restant`: the hook makes what we still have the RIGHT
            // to spend, the guard compares tower expenses.
            if (fresh !== null) budgetUsd = costUsd + Math.max(0, fresh);
          }
          if (budgetUsd !== undefined && costUsd >= budgetUsd) {
            budgetExhausted = true;
            /**
             * 40 ms measured: the in-flight request completes properly, and the round
             * keeps his log, his push and his report.
             *
             * REMAINS TO BE MEASURED, and [abandoned-spend.ts](../abandoned-spend.ts) is
             * kept for that: what opencode charges for a round cut in the middle.
             * If he places a `finish` on the aborted message, our security guard
             * translator writes it in the ledger like an ordinary round; otherwise the
             * expenditure comes out of the counters, which is exactly the fault that
             * MIN-216 had closed on the home loop side.
             */
            await closePendingQuestion();
            await abortSession();
            break;
          }
        }
        // What the MOTHER's reflection changes directly: it turns it on, and it
        // pushes it by itself — a model who thinks three minutes before writing
        // its first word does not emit any `liveText`, and the thread would remain silent.
        if (!child && out.reasoning) {
          reasoningSince = out.reasoning.active ? (out.reasoning.startedAt || now()) : null;
        }
        // The optimistic signal placed upon acceptance of the prompt must not remain
        // lit under the text of a model which does not publish any part of
        // explicit reasoning. As soon as he writes, writing is the right state.
        if (!child && out.liveText !== undefined && out.reasoning === undefined) {
          reasoningSince = null;
        }
        const liveDue =
          !child &&
          (out.liveText !== undefined || out.reasoning !== undefined) &&
          now() - lastLiveAt >= LIVE_INTERVAL_MS;
        if (liveDue) {
          lastLiveAt = now();
          publishLive({
            text: outward(liveTextOf(state, sessionId)),
            tools: toolsSeen,
            reasoningActive: reasoningSince !== null,
            reasoningMs: reasoningSince === null ? 0 : Math.max(0, now() - reasoningSince),
            // The list goes with EACH load: the wire erases what a load
            // was silent, so emitting it separately would make it disappear on the next one.
            ...liveEdits.payload(),
          });
        }
        /**
         * A GIRL'S MISTAKE IS NOT THE MISTAKE OF THE TOUR. It returns to the parent
         * like an error from `task` — he reads it and decides —, exactly like a
         * subagent that failed in the home loop. Storing it here would
         * TOUR in `error`: the thread would say that the run is dead while the agent
         * continue de travailler.
         */
        if (out.error && !child) sessionError = out.error;
        /**
         * THE OUTAGE NOBODY ASKED FOR — the quietest outage in the world
         * harness before it is said.
         *
         * A WANTED break is silent: we consume it and the reason that caused it
         * triggered (ceiling, “Stop”, deadline, question, steering) already done
         * the report. What remains is a round sliced ​​in flight - and without this
         * guard, he left NOTHING: no event, no summary, no error.
         * The round was put away “finished”, the thread remained frozen on its last
         * status (“Opening the sandbox” when the cutoff falls on the first
         * round), and the expense was very real. Measured on run `ec9b2ed5`.
         *
         * We say it IN THE WIRE and in the report: `error` without `errorCode` does not
         * re-queue ([vm-rest.ts](../vm-rest.ts)) — the round rests, but in
         * saying why, and the next message resumes the session.
         */
        if (out.aborted && !child) {
          if (abortsRequested > 0) {
            abortsRequested -= 1;
          } else {
            sessionError = "The model round was cut short before it produced anything.";
            await cp.emit("error", { message: sessionError });
            break;
          }
        }
        // The questions are PART in the thread (just above): we go out once
        // the event emitted, not before — otherwise the question card would not exist
        // and the session would expect a response to nothing.
        if (askedUser) break;
        // `session.idle` of a GIRL does not complete the round: the mother,
        // is still awaiting his report. However, it frees up a place under the
        // simultaneous ceiling.
        /**
         * A GIRL WHO KEPT QUIET HAS GIVED HER REPORT, and the thread wants to hear it:
         * its block reads a `summary` marked with its name (this is what fills
         * “report”) and a `status: subagent_report` (this is what closes it and
         * stops the clock). Both existed in the home loop; without
         * them, a girl remains eternally “at work” under a completed turn.
         */
        if (out.idle && child) {
          const childSession = out.sessionId ?? "";
          const entry = subagents.entry(childSession);
          const report = replyOf(state, childSession);
          if (entry && report.trim()) {
            await cp.emit(
              "summary",
              markChildPayload({ text: cap(outward(report), 4000) }, entry),
            );
          }
          if (entry) await cp.emit("status", { phase: "subagent_report", id: entry.id });
          subagents.finish(childSession);
        }
        if (out.idle && !child) {
          /**
           * THE SAFE BORDER, and the only place from which we speak to the model: the
           * session is idle, history is matched. A steering message
           * arrived during the round cut the round (`abort`) and waits here.
           */
          if (pendingPrompt.length > 0) {
            await cp.emit("status", { phase: "steered" });
            await postPending();
            continue;
          }
          /**
           * OpenCode 1.18.16 makes a `reject` deny ALL requests
           * parallels, then quiesces the session. This is not a response from
           * model: this is a permission boundary. We give him ONE chance
           * to read the errors and choose another path; limited to once,
           * it does not turn a safeguard into a retry loop.
           */
          if (
            rejectedPermissionThisRound &&
            !repairedPermissionCascade &&
            lastParentFinish === "tool-calls"
          ) {
            repairedPermissionCascade = true;
            rejectedPermissionThisRound = false;
            awaitingFirstModelSignal = true;
            timing("permission-cascade-retry");
            await client.promptAsync(
              sessionId,
              "One or more tool permissions were refused and OpenCode cancelled the other parallel tool calls. Read the tool errors, continue with a safe alternative, and do not repeat the refused action.",
            );
            continue;
          }
          /**
           * GPT-5.6 Luna has been observed ending a `stop` round with "I'm going
           * inventory… then check…”, without any call to tool. One layer
           * OpenAI-compatible had flattened what was semantically a
           * commentary in wizard text: for opencode, `stop` + `idle` is
           * a perfectly valid conclusion, while the sentence promises
           * still all the work.
           *
           * We repair the contradiction ONCE, in the same session: the text
           * becomes the intermediate narration that it should have been, then a
           * internal instruction requires action without announcing again. Detection is
           * deliberately narrow (`opencode-continuation.ts`) so as never to
           * relaunch a real answer that would simply speak to the future.
           */
          const stranded = outward(replyOf(state, sessionId));
          if (
            !repairedPreamble &&
            lastParentFinish === "stop" &&
            looksLikeUnexecutedPreamble(stranded)
          ) {
            repairedPreamble = true;
            await cp.emit("thinking", { text: cap(stranded, 2000) });
            reasoningSince = null;
            lastLiveAt = 0;
            toolsSeen = 0;
            publishLive({
              text: "",
              tools: 0,
              reasoningActive: false,
              reasoningMs: 0,
              ...liveEdits.payload(),
            });
            await client.promptAsync(sessionId, OPENCODE_CONTINUATION_REPAIR);
            continue;
          }
          break;
        }

        if (await lifecycle()) break;
      }
    } finally {
      if (liveStatsTimer) {
        clearTimeout(liveStatsTimer);
        liveStatsTimer = null;
      }
      abortEvents.abort();
      /**
       * AND THE QUESTION IN FLIGHT IS DISMISSED, whatever the exit (D7) — y
       * including the one that no one predicted (the flow that breaks, a breakdown of the
       * opencode server). A tool `question` left `running` remains frozen for
       * still in the opencode base, which the next round rereads: measured at
       * batch 0 of the waiting probe, nothing revives it.
       */
      await closePendingQuestion().catch(() => {});
      /**
       * WHAT WE DRAINED WITHOUT KNOWING TO PLAY IT COMES BACK IN A FILE (MIN-286).
       *
       * `pullSteering` CONSUMES, and we only drain knowing that we are going to cut to
       * repost behind — except that the round can come out between the two: ceiling
       * expenditure reached on the cut round, deadline, run concluded elsewhere,
       * cut suffered. The message was then consumed in base and living in
       * `pendingPrompt`, a local variable that dies with the microVM: accepted at
       * the screen, lost forever, and the run wouldn't even wake up — it's
       * the line that re-tails it.
       *
       * The happy path does not go this way: `postPending` has already emptied the bag.
       */
       const unposted = pendingPrompt
         .filter((part) => part.steered)
         .map((part) => part.message);
      pendingPrompt = [];
      if (unposted.length > 0) await cp.pushSteering(unposted).catch(() => {});
    }

    /**
     * THE ROUND CUT IN FLIGHT, RETURNED TO THE LEDGER (MIN-286, lot 3, file §2.23).
     *
     * All but one of the outputs of the loop above go through a `abort`:
     * spending ceiling, “Stop”, steering, deadline, question of model. And
     * measured on binary: opencode charges NOTHING for an aborted round — no
     * `finish`, therefore no `usage`, therefore no line. The supplier has
     * Invoice. The proxy is the only one who saw it happen; we take back from him what
     * no more rounds will come to fetch.
     *
     * `costUsd` is added to the round total **after** the cap, voluntarily:
     * this round is already cut, opposing it again to the ceiling would not change
     * just a message. What matters is that he is on the ledger, therefore on the quota
     * account and invoice.
     */
    costUsd += await turnLedger.recordOrphans(cp, proxy);

    /**
     * WHAT IS NOT ASSEMBLED IS COUNTED (MIN-361). Neutral event — invisible to
     * thread, accounting in base, like `current_repo`: this is the only way to
     * know, after the fact, that a round has read out of the file, without raising this
     * that he read there. Best-effort: a lost account does not cost the tour.
     */
    if (withheldOutputs > 0) {
      console.log(`[supervisor] ${withheldOutputs} tool output(s) stayed on this machine`);
      await cp
        .emit("status", { phase: "local_output_withheld", outputs: withheldOutputs })
        .catch(() => {});
    }

    // ── The opencode state, exported for the next round ──────────────────────
    let opencodeState: OpencodeCheckpointState | undefined;
    try {
      // Incremental since the LAST export, periodic included: the cursor is
      // that of the accumulator, not that of the previous round.
      opencodeState = await syncJournal();
    } catch (err) {
      // A newspaper that we have not been able to export does not lose the trick: it loses the
      // RESUME, and the next round will start with a new session. To say, therefore,
      // and not to swallow in silence.
      console.error("[supervisor] history export failed:", (err as Error).message);
    }

    // ── The push, the diff, the report ──────────────────── ─────────────────────
    /**
     * A trick that has asked its questions has NO answers, and it's the same rule
     * than the house loop (`reply: ""` on `ask_user`): the question card
     * closes the thread, there is no final word to display, and the commit takes
     * its generic message rather than a sentence written before the question.
     *
     * SUBSTITUTED AND REWRITTEN HERE, once for its THREE destinations (MIN-361):
     * the `summary` event, the commit message
     * ([commit-message.ts](../commit-message.ts)) and the `reply` of the report, which
     * becomes `agent_runs.outcome`. Only the first passed through the register of
     * secrets; the other two took the word of the model as it was -
     * therefore, on a machine, the paths that he had just mentioned, even in a
     * commit message pushed to the forge.
     */
    const reply = askedUser ? "" : outward(replyOf(state, sessionId));
    /**
     * THE FINAL WORD, SAID TO THE WIRE — and this is what ENDS the round on the screen.
     *
     * The thread only knows one end sign: the `summary` event
     * ([agent-event-feed.tsx](../../../../components/agent/agent-event-feed.tsx),
     * `closesTurn`). Without him, the course of the turn remains open, and a turn
     * rest without closure is read as an INTERRUPTED turn: this is what we saw on
     * the first opencode runs — the round ended well, the PR was open, and
     * the thread displayed “interrupted”, then the next round was stacked in
     * the same accordion with the chrono from the previous one.
     *
     * Capped at 8,000 like the home loop, and placed BEFORE the push: the following
     * may fail (push, forge, log export), and the agent response does not
     * must not get lost with it.
     */
    const endedWell = !budgetExhausted && !interrupted && !sessionError && !timedOut;
    if (reply.trim() && endedWell) {
      await cp.emit("summary", { text: cap(reply, 8000) });
    }
    /**
     * The “repository has been touched” lock, set one last time before the push:
     * a round that doesn't open a pull request never made it through the gate, and
     * However, it is this lock that the FOLLOWING turn reads again in its checkpoint.
     */
    // …and what SHELL did to the repository without using a writing tool
    // (`rm`, `mv`, a codemod): without this reading, a trick that did just that
    // thinks he is a virgin, and the next turn reads him as is in his checkpoint.
    await delivery.probeRepoTouched();
    delivery.noteEdits();
    /**
     * THE BACKGROUND JOBS, KILLED BEFORE THE PUSH — and before it only: they
     * served throughout the tour. A server left alive would write to the repository
     * during `git add -A` (a `.next/`, a regenerated build file), and it
     * would keep the microVM awake after the round ends. Same gesture as
     * [turn.ts](turn.ts), in the same place.
     */
    await background.stopAll().catch(() => 0);
    let pushed: VmPushResult | null = null;
    let pushError: string | undefined;
    /**
     * ─────────────────────────────────────────────────────────────────────────
     * IN CURRENT DEPOSIT MODE, THE TOUR DOES NOT COMMIT ANYTHING (MIN-293, decision D2bis-B).
     *
     * The audit left the deliverable open: the tour pushed a branch at each
     * end of turn, like in the cloud. **On someone's record, it's the
     * bad move** — the agent edits where the human works, and it has no
     * reason to decide alone that this work should go to a forge. The branch
     * arrived elsewhere without existing locally (committed in a disposable index,
     * pushed by sha), so we read it in the interface without being able to find it
     * in its own `git branch`: a branch that was not requested, to a
     * a place we cannot see.
     *
     * **The deliverable becomes the work tree.** The agent edits, the thread says what
     * which has moved, and the human rereads in his editor then commits himself —
     * it is the product of Claude Code, and it is consistent with the D2 decision which
     * makes the current deposit the default.
     *
     * ⚠ **WHAT IT COSTS, AND IT HAS TO BE SAYED**: “the product is identical,
     * only the machine changes” is even a little less true. The pull request
     * ceases to be the end of a turn to become an EXPLICIT GESTURE — the tool
     * `create_pr`, that the model always serves and which grows when we do so
     * request. Nothing about MIN-358's machinery dies: it changes
     * simply a trigger.
     */
    if (job.writesToRepo && !current) {
      try {
        pushed = await pushWork(commitMessageFromReply(reply, job.commitRef));
      } catch (err) {
        pushError = outward((err as Error).message);
        console.error("[supervisor] turn-end push failed:", pushError);
      }
    }

    /**
     * THE ORDER OF CAUSES, and it is not indifferent: `budget_exhausted` is
     * a separate status in the protocol, and the function derives a behavior from it
     * own — event `quota_exhausted`, no re-queue, message which distinguishes the
     * ceiling of the RUN of that of the ACCOUNT ([execute.ts](../execute.ts)). put it away
     * under `error` would retry a run that can no longer pay for itself.
     */
    const status: VmTurnReport["status"] = budgetExhausted
      ? "budget_exhausted"
      : interrupted
        ? "interrupted"
        : sessionError || timedOut
          ? "error"
          : "completed";

    /**
     * WHAT THE TOUR HAS CHANGED — and it no longer reads in the same place according to the
     * mode (MIN-293). In clone, it's the difference between the baseline and what we come from
     * to push. In current deposit, there is nothing to push: this is the difference between
     * the baseline and **the work tree**, limited to the perimeter of the tour — without
     * what files that the human already had in progress would go up over time
     * as if the agent had touched them.
     */
    const rawLocalDiff =
      status === "completed" && local && filesFromSha
        ? await readWorkingDiff(host, filesFromSha, {
            patches: true,
            scope: current ? await attributedScope() : undefined,
            maxBytes: LOCAL_WORKING_DIFF_MAX_BYTES,
          }).catch(() => null)
        : null;
    const localDiff = rawLocalDiff
      ? { ...rawLocalDiff, ...(current ? { snapshot: true } : {}) }
      : null;
    const changed =
      status !== "completed"
        ? null
        : localDiff && localDiff.files.length > 0
          ? { files: localDiff.files.map(localDiffStat), truncated: localDiff.truncated }
        : current
          ? await workingTreeChangedFiles(host, filesFromSha, await attributedScope()).catch(
              () => null,
            )
          : pushed?.headSha && pushed.headSha !== filesFromSha
            ? await changedFiles(host, filesFromSha, pushed.headSha).catch(() => null)
            : null;

    // The SAME constructor as the periodic backup: only the sha of
    // files changes, and it only changes here (it was the push that moved it).
    const checkpoint: OpencodeCheckpoint = turnCheckpoint(
      status === "completed" ? pushed?.headSha || filesFromSha : filesFromSha,
      opencodeState,
    );

    return {
      status,
      ...(reply ? { reply } : {}),
      // It is he who puts the session in `awaiting_input` and sends the notification
      // `agent_question` rather than `agent_done` ([vm-rest.ts](../vm-rest.ts)).
      ...(askedUser ? { askedUser: true } : {}),
      ...(timedOut ? { errorCode: "turnTooLong" as const } : {}),
      ...(sessionError ? { errorMessage: cap(outward(sessionError), 1000) } : {}),
      costUsd,
      checkpoint,
      // Nothing is let go: the newspaper no longer passes through the checkpoint,
      // it is written as an append throughout the turn (see `syncJournal`).
      checkpointDropped: [],
      checkpointBytes: JSON.stringify(checkpoint).length,
      pushed,
      workBranch: job.workBranch,
      ...(pushError ? { pushError } : {}),
      ...(changed && (changed.files.length > 0 || localDiff)
        ? { changed: { ...changed, ...(localDiff ? { diff: localDiff } : {}) } }
        : {}),
      sandboxMs: job.bootstrapMs + (now() - startedAt),
    };
  } catch (err) {
    /**
     * A TOUR THAT DIES EVEN SPENT (MIN-286).
     *
     * The happy path takes from the proxy what no round came to get
     * (`recordOrphans`, above); the exceptional path passed by, and the
     * `finally` closed the proxy behind it — the expense left with the
     * microVM. But it is precisely here that it is most probable: the only
     * way to learn that opencode server is dead is the `/event` stream
     * which breaks, and the round in flight has indeed been billed.
     *
     * Best effort and without lifting: we return the lathe in error, not the breakdown of the
     * with the ledger on top.
     */
    const salvaged = ledger ? await ledger.recordOrphans(cp, proxy).catch(() => 0) : 0;
    return failed((err as Error).message, salvaged);
  } finally {
    // Net: a round that exits through an exception has not passed through the stop
    // pre-push, and a dev server would survive the round. `stopAll` is
    // idempotent — a job that has already been killed is no longer alive, so it is not killed again.
    await background.stopAll().catch(() => 0);
    await server?.stop().catch(() => {});
    await proxy.close().catch(() => {});
    await bridge.close().catch(() => {});
  }
}

/** Forge-shaped form of the local patch → historical shape of `files_changed`. */
function localDiffStat(file: WorkingDiff["files"][number]) {
  return {
    path: file.filename,
    status: file.status === "removed" ? "deleted" as const : file.status,
    additions: file.additions,
    deletions: file.deletions,
    ...(file.previous_filename ? { previousPath: file.previous_filename } : {}),
  };
}

/**
 * THE LEDGER OF A ROUND (MIN-286, batch 2) — an `ai_usage` line by ROUND, mother and
 * girls included, under the `run_id` of the run.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHERE DO THE THREE NUMBERS COME FROM, and why they don't come from the same place
 *
 * - **Tokens** come from the opencode wizard message. The mapping is
 *   the one from the plan: `input→prompt_tokens`, `output→completion_tokens`,
 * `cache.read→cached_tokens`, `cache.write→cache_write_tokens`. THE
 * reasoning has no column: it is ALREADY in `output` (measured at
 * batch 0), adding it would count the same tokens twice.
 * - **The cost** comes from the SUPPLIER when the proxy was able to read it, from opencode
 * Otherwise. The batch 0 probe measured the two equals over five generations, this
 * which is not a promise: the day they diverge, it is the invoice which
 * is right. This is also what makes the ledger comparable line to line between
 * both engines — the tipping point for lot 3.
 * - **The `generation_id`** only comes from the proxy: opencode does not expose it
 *   part (section §2.6).
 *
 * `estimated` says “this cost is CALCULATED, not taken from the supplier”. SO :
 * false as soon as the proxy has returned the invoiced cost; also wrong about the cost
 * opencode calculated with OUR price (batch 0 decision, zero difference measured); TRUE
 * when the job has no price — there, opencode returns zero, and a line as zero
 * marked “exact” would be a lie that cannot be caught up again.
 *
 * THE SEQ: the mother continues the numbering of the run (`usageSeqStart`), each
 * daughter takes hers in the band of sub-agents (`subagentUsageSeq`, base
 * 2e9, 1,000 per slot) — the SAME convention as the house loop, otherwise
 * the call order of a run stops being readable in the ledger.
 */
class TurnLedger {
  private parentSeq: number;
  /** Rounds already written by a girl — her progress in her band. */
  private readonly childSeq = new Map<string, number>();

  constructor(
    private readonly job: VmJob,
    /** The mother's session: everything else in the flow is a girl. */
    private readonly parentSession: string,
    /** Who numbers the girls — the SAME register as the thread, otherwise the
     * a girl's expenses and her events would not speak of the same. */
    private readonly subagents: SubagentRegistry,
  ) {
    this.parentSeq = job.usageSeqStart;
  }

  /** Mother's next FREE `seq` — what the checkpoint should carry. */
  get nextParentSeq(): number {
    return this.parentSeq;
  }

  /** Writes the round, and returns what was billed. */
  async record(
    cp: ControlPlaneClient,
    usage: RoundUsage,
    proxy: LlmProxy,
  ): Promise<{ cost: number }> {
    const generation = proxy.take({ model: usage.model, outputTokens: usage.outputTokens });
    const cost = generation?.costUsd ?? usage.costUsd;
    /**
     * `prompt_tokens` IN THE SENSE OF THE SUPPLIER, including cache — and not `input`
     * of opencode, which EXCLUDES it (identity measured at batch 0, file §2.5:
     * `input + cache.read + cache.write = native_tokens_prompt`).
     *
     * The column has a written meaning, and two readers depend on it: the hit rate
     * the cache is read as `cached_tokens / prompt_tokens` (MIN-242 migration), which
     * exceeded 1 on this path, and the line-to-line comparison of the two engines
     * is the switching criterion of lot 3 — the house loop, for its part, writes the
     * OpenRouter's `prompt_tokens`, like `recordOrphans` immediately below.
     */
    const promptTokens = usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
    await cp.recordUsage({
      runId: this.job.ledgerRunId,
      seq: this.seqFor(usage.sessionId),
      feature: this.job.feature,
      billTo: { unattributed: "resolved by the control plane" },
      model: usage.model || this.job.model,
      ...(generation?.id ? { generationId: generation.id } : {}),
      promptTokens,
      completionTokens: usage.outputTokens,
      totalTokens: promptTokens + usage.outputTokens,
      cachedTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      cost,
      estimated: generation?.costUsd == null && !this.job.pricing,
      projectId: this.job.projectId,
    });
    return { cost };
  }

  /**
   * THE ROUNDS CUT IN FLIGHT — the ones that opencode will never say anything about.
   *
   * Measured (file §2.23): an aborted round returns `finish: null`, `cost: 0`,
   * `tokens: 0` and a `MessageAbortedError`, while the supplier has invoiced.
   * The proxy has read the last frame of the stream — it does not cut upstream when
   * the customer leaves. We therefore write the line with ITS numbers.
   *
   * `estimated: false` without hesitation: it’s not a calculation, it’s the amount
   * charged, read in the response. A flow that wouldn't even have returned its `usage`
   * (supplier cut off, network failure) is not written at all: a line with zero
   * would read “this call was free”, which exactly fills the gap.
   *
   * `seq`: the MOTHER gang, always. Proxy doesn't know which session
   * came the request — he sees HTTP, not sessions — and a row
   * under the mother is infinitely better than an expense that does not exist anywhere.
   */
  async recordOrphans(cp: ControlPlaneClient, proxy: LlmProxy): Promise<number> {
    // The race: the upstream finishes AFTER the customer (1.2 seconds measured). Drain without
    // waiting would find nothing.
    await proxy.settle(ORPHAN_SETTLE_MS);
    let total = 0;
    for (const gen of proxy.drain()) {
      const usage = gen.usage;
      if (!usage || gen.costUsd == null) {
        // Nothing billable to write, but it SAYS: it's the only sign
        // that an expense could have gone off the counters.
        console.error(
          `[supervisor] round coupé sans usage du fournisseur (gen ${gen.id ?? "?"}) — non facturé`,
        );
        continue;
      }
      const prompt = usage.promptTokens ?? 0;
      const completion = usage.completionTokens ?? 0;
      await cp.recordUsage({
        runId: this.job.ledgerRunId,
        seq: this.parentSeq++,
        feature: this.job.feature,
        billTo: { unattributed: "resolved by the control plane" },
        model: gen.model || this.job.model,
        ...(gen.id ? { generationId: gen.id } : {}),
        promptTokens: prompt,
        completionTokens: completion,
        totalTokens: usage.totalTokens ?? prompt + completion,
        cachedTokens: usage.cachedTokens ?? 0,
        cacheWriteTokens: usage.cacheWriteTokens ?? 0,
        cost: gen.costUsd,
        estimated: false,
        projectId: this.job.projectId,
      });
      total += gen.costUsd;
    }
    return total;
  }

  /**
   * The `seq` of this round. An unknown session falls into the mother's gang
   * only if the stream didn't say where it came from — better a round of
   * mother misplaced than a lost line.
   */
  private seqFor(sessionId: string): number {
    if (!sessionId || sessionId === this.parentSession) return this.parentSeq++;

    const slot = this.subagents.slotOf(sessionId);
    // The slots start from scratch each ROUND, like the house loop recreates
    // its register of subagents each round (`seqBase: 0`). Two towers which
    // delegate therefore reuse the same band: `ai_usage.seq` has no
    // constraint of uniqueness, and the expense is summed up.
    const used = this.childSeq.get(sessionId) ?? 0;
    this.childSeq.set(sessionId, used + 1);
    return subagentUsageSeq(slot) + used;
  }
}

/**
 * THE REGISTER OF GIRLS IN A TOUR (MIN-286, lot 2, task 12).
 *
 * It doesn't LAUNCH anything — it's opencode that launches, and that's the whole point of the turn.
 * It holds the three things that opencode doesn't hold for us:
 *
 * 1. **A short and stable name** (`sub-1`, `sub-2`), the one that the thread knows
 * since MIN-112: the feed folds the events of a girl under the line
 * `spawn_agent` by `subagent_id` + `parent_call_id`, and a session id
 * opencode (`ses_00960557effe…`) never meant anything to anyone.
 * 2. **The ledger's `seq` gang**: girl n°N writes in
 * `subagentUsageSeq(N-1)`, the SAME convention as the home loop — otherwise
 *    the call order of a run stops being readable in the ledger.
 * 3. **How ​​many spins**, which is the simultaneous ceiling (`maxParallel`). A
 * daughter is alive from her attachment until her `session.idle`.
 */
export class SubagentRegistry {
  private readonly bySession = new Map<
    string,
    { index: number; id: string; callId: string; mode: "explore" | "implement"; done: boolean }
  >();

  constructor(
    /** Agent name → our mode, as the config declared it. */
    private readonly modes: ReadonlyMap<string, "explore" | "implement">,
  ) {}

  /** Attaches a girl to the call from `task` who initiated it. Idempotent. */
  register(child: { sessionId: string; callId: string; agent: string }): void {
    if (this.bySession.has(child.sessionId)) return;
    const index = this.bySession.size;
    this.bySession.set(child.sessionId, {
      index,
      id: `sub-${index + 1}`,
      callId: child.callId,
      // An unknown agent name should not exist (the permission verdict
      // refused it), but if it passed, `implement` is the worst case: it is the one
      // under which the thread shows a girl who can write.
      mode: this.modes.get(child.agent) ?? "implement",
      done: false,
    });
  }

  entry(sessionId: string) {
    return this.bySession.get(sessionId);
  }

  /**
   * The girl's gang. An unknown session still gets one:
   * An expense that you don't know how to account for is better stored away than lost.
   */
  slotOf(sessionId: string): number {
    const known = this.bySession.get(sessionId);
    if (known) return known.index;
    this.register({ sessionId, callId: "", agent: "" });
    return this.bySession.get(sessionId)!.index;
  }

  /** A girl at rest no longer counts in the simultaneous. */
  finish(sessionId: string): void {
    const entry = this.bySession.get(sessionId);
    if (entry) entry.done = true;
  }

  get running(): number {
    let count = 0;
    for (const entry of this.bySession.values()) if (!entry.done) count += 1;
    return count;
  }

  /**
   * The girl who is WRITING right now, if there is one — the writing lock of
   * parent ([subagent.ts](../subagent.ts), `runningImplementId`), rendered here under
   * the short name that the thread displays. The only caller is `create_pr`: the
   * `git add -A` of delivery would otherwise result in half-finished work.
   *
   * In practice the case is rare — at opencode the tool `task` BLOCKS the parent —
   * but a round that calls `task` and `create_pr` side by side reopens it.
   */
  runningImplementId(): string | null {
    for (const entry of this.bySession.values()) {
      if (!entry.done && entry.mode === "implement") return entry.id;
    }
    return null;
  }
}

/**
 * MARKING A GIRL'S EVENT — the same fields as in MIN-112, except for the name.
 *
 * `subagent_id` + `parent_call_id` are what folds the event below the line
 * `spawn_agent` in thread; `subagent_mode` is what it displays. And the id of
 * the tool call is PREFIXED, for the reason it always was: two models
 * can return the same `call_1`, and the thread matches by id.
 */
export function markChildPayload(
  payload: Record<string, unknown>,
  entry: { id: string; callId: string; mode: "explore" | "implement" },
): Record<string, unknown> {
  const id = payload.id;
  return {
    ...payload,
    ...(typeof id === "string" ? { id: `${entry.id}:${id}` } : {}),
    subagent_id: entry.id,
    ...(entry.callId ? { parent_call_id: entry.callId } : {}),
    subagent_mode: entry.mode,
  };
}

/**
 * What the thread should read from a `spawn_agent`, when opencode only knows the
 * the agent name.
 *
 * `toolArgSummary` has already stored the `subagent_type` under `mode` (this is the field
 * that he is waiting for) — except that this `mode` is worth `explore-anthropic-claude-haiku-4-5`,
 * not `explore`. We therefore return the two fields that `spawn_agent` carried, and
 * that replaying a run displays: the mode, and the model of the girl.
 */
export function describeSpawn(
  payload: Record<string, unknown>,
  agents: ReadonlyMap<string, { mode: "explore" | "implement"; modelId?: string; label?: string }>,
): Record<string, unknown> {
  const entry = agents.get(String(payload.mode ?? ""));
  if (!entry) return payload;
  return {
    ...payload,
    mode: entry.mode,
    ...(entry.modelId ? { model: entry.label ?? entry.modelId } : {}),
  };
}

/** The export cursor, aggregate by aggregate. */
export function lastSeqByAggregate(
  previous: Record<string, number>,
  events: Record<string, unknown>[],
): Record<string, number> {
  const out = { ...previous };
  for (const event of events) {
    const id = typeof event.aggregateID === "string" ? event.aggregateID : null;
    const seq = typeof event.seq === "number" ? event.seq : null;
    if (!id || seq === null) continue;
    if (!(id in out) || out[id] < seq) out[id] = seq;
  }
  return out;
}

/**
 * The forge token does not come out either in an event or in the checkpoint (MIN-239): it
 * is readable in `.git/config`, and three tools take it out. The substitution
 * applies to CHAINS of the payload, **in depth** — a tool `preview` is
 * exactly where he landed. She has lived in `redact.ts` since MIN-343,
 * where Numo shares it: just one substitution, not two.
 */
function redactPayload(
  payload: Record<string, unknown>,
  secrets: SecretRedactor,
): Record<string, unknown> {
  return redactDeep(payload, secrets.redact) as Record<string, unknown>;
}
