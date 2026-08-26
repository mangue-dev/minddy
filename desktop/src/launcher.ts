import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { app, session, utilityProcess, type UtilityProcess } from "electron";

import { childEnv } from "@/lib/desktop/child-env";
import {
  localClaimProjectIds,
  nextLocalClaimDelay,
  type LocalClaimOutcome,
} from "@/lib/desktop/local-claim";
import {
  HARNESS_BUNDLE_PATH,
  HARNESS_DIR_NAME,
  HARNESS_MANIFEST_PATH,
  HARNESS_MAX_BYTES,
  bundleDecision,
  harnessBundleFileName,
  harnessRefusalMessage,
  parseHarnessManifest,
  staleBundles,
  verifyBeforeFork,
  verifyDownload,
  type HarnessManifest,
  type HarnessRefusal,
} from "@/lib/desktop/harness-bundle";
import {
  assignmentToJob,
  localLayout,
  localOpencodeDir,
  localRunRoot,
  localRunsDir,
  localTurnRefusalMessage,
  localTurnSecrets,
  parseLocalTurnAssignment,
  staleRunRoots,
  type LocalTurnAssignment,
  type LocalTurnRefusal,
} from "@/lib/desktop/local-turn";
import { opencodeInstallNote, opencodeRefusalMessage } from "@/lib/desktop/opencode-install";
import { withOpencodeInstallLock } from "@/lib/desktop/opencode-install-lock";
import { quitLogNote, type RunningTurn } from "@/lib/desktop/quit-guard";
import { killTargets, readHarnessChildren } from "@/lib/server/agent/vm/child-registry";
import { OPENCODE_VERSION } from "@/lib/server/agent/vm/opencode-version";
import { vmBundlePath, vmJobPath } from "@/lib/server/agent/harness-layout";
import { installOpencode, readOpencodeFacts } from "./opencode-install";
import { describeLocalRepo, localProjectsFor } from "./local-repo";
import { prepareLocalWorktree } from "@/lib/desktop/local-worktree";
import { noteLauncherFailure, openRunLog, type RunLog } from "./run-log";
import { readLocalRepos } from "./repo-store";
import { trace } from "./trace";

/**
 * THE LAUNCHER (MIN-293) — which runs an agent round on this Mac.
 *
 * ## What this file is allowed to contain
 *
 * The `fork`, the `fetch`, the `fs`, and the living tower register. **All
 * decisions live in `lib/desktop/`**, with their tests — the assignment contract
 * and the layout ([local-turn.ts](../../lib/desktop/local-turn.ts)),
 * the harness fingerprint ([harness-bundle.ts](../../lib/desktop/harness-bundle.ts)),
 * the opencode pre-flight ([opencode-install.ts](../../lib/desktop/opencode-install.ts)),
 * the ⌘Q question ([quit-guard.ts](../../lib/desktop/quit-guard.ts)) and the
 * long-lived child registry
 * ([vm/child-registry.ts](../../lib/server/agent/vm/child-registry.ts)).
 * `vitest` does not collect `desktop/src/`, and a launcher is the last place
 * where we want to see a handwritten decision.
 *
 * ## `utilityProcess.fork`, not a detached process
 *
 * **Measured**: Electron 43.4.0 renders Node 24.18.1, exactly the `node24`
 * target of the bundle, and `.agent-vm/main.js` runs as is below. But the choice does not
 * depend on the version of Node — it depends on TWO properties that a detached process does not have:
 *
 * 1. **it dies with the app.** A harness that survives ⌘Q would keep it alive a
 * forge token `contents: write` and a model key, without any more
 * interface to stop them;
 * 2. **it keeps its TCC responsible process.** A process repaired to `launchd`
 * loses it — and macOS does not then refuses it not only `~/Documents`: **the
 * authorization window does not even open.** The refusal is silent, exactly
 * like that of the microphone before MIN-294.
 *
 * ## What the fork returns to the harness, measured and not deduced
 *
 * Probe of 2026-08-15, on Electron 43.4.0: a child of `utilityProcess.fork`
 * receives `process.argv = [<Electron Helper>, <module>, ...args]` — **exactly
 * the convention of `child_process.fork`**. The harness therefore reads its job correctly in
 * `process.argv[2]` ([vm/main.ts](../../lib/server/agent/vm/main.ts)), and nothing
 * is shifted. Also measured: `stdio: "pipe"` gives the two flows, the output code
 * goes back, and the `cwd` is respected.
 *
 * ⚠ And a trap which presented itself in the process: `env` **refuses all value
 * which is not a string**, with a message that does not name the key
 * (`TypeError: Invalid value for env`). Hence `childEnv`
 * ([child-env.ts](../../lib/desktop/child-env.ts)), which REMOVES instead of putting
 * `undefined`.
 *
 * ## Nothing here leaves a turn without a log
 *
 * Each refusal goes through `openRunLog` or `noteLauncherFailure` before returning.
 * This is the reason for MIN-363: a turn that fails BEFORE the harness has spoken
 * has no event, no checkpoint, no `agent_runs` line — the `stdio` of
 * the child is the only thing that speaks, and the journal is the only place to keep it.
 */

/** A lively ride on this machine. */
interface LiveTurn {
  readonly runId: string;
  readonly label?: string;
  readonly child: UtilityProcess;
  readonly log: RunLog;
  readonly root: string;
  readonly harnessDir: string;
}

/**
 * THE REGISTER, by run identifier.
 *
 * An object and not a singleton, because **a machine can carry two runs at the
 * times** where a microVM carried one by construction: two tickets launched at
 * the suite have two roots, two ports, two logs (see `HarnessLayout`).
 */
const live = new Map<string, LiveTurn>();

/**
 * Opencode pre-flights in progress, per machine folder. Preheating starts when
 * launches the app; a very quick click on "send" must join this
 * same work, never launch a second competing `npm install`.
 */
const opencodePreflights = new Map<
  string,
  Promise<
    | { ok: true; note: string | null }
    | { ok: false; reason: "no_npm" | "install_failed"; message: string }
  >
>();

/** Pre-heats in progress, one per origin: stable/preview never share
 * a harness, because their protocol and code may diverge. */
const localAgentWarmups = new Map<string, Promise<boolean>>();
/**
 * An origin only enters the local queue after a successful pre-flight. Without this
 * lock, an installed app unable to find npm could win the claim
 * against a ready development shell, then abort the run that it
 * had just made inaccessible to the other machine.
 */
const localAgentReadyOrigins = new Set<string>();

/** What the launcher renders after receiving an assignment from the server. */
export type LocalTurnResult =
  | { readonly status: "started"; readonly runId: string; readonly logPath: string }
  | {
      readonly status: "refused";
      readonly reason:
        | LocalTurnRefusal
        | HarnessRefusal
        | "no_npm"
        | "install_failed";
      readonly message: string;
    };

/** Current turns — read by the question of ⌘Q. */
export function runningTurns(): RunningTurn[] {
  return [...live.values()].map((turn) => ({
    runId: turn.runId,
    ...(turn.label ? { label: turn.label } : {}),
  }));
}

/**
 * The presence of the clone is its sweater (MIN-371): no heartbeat, no topic
 * held by the page. The next iteration is only scheduled after the previous one finishes, so two requests of this shell never overlap.
 */
export function startLocalClaimLoop(opts: {
  getOrigin: () => string;
  deviceId: string;
}): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const poll = async () => {
    const projectIds = localClaimProjectIds(readLocalRepos());
    let outcome: LocalClaimOutcome = "idle";
    if (projectIds.length > 0) {
      try {
        const origin = opts.getOrigin();
        // The claim is irreversible for the other shells: we do not attempt it
        // once the harness and opencode are actually available here.
        const ready = await prewarmLocalAgent(origin);
        if (ready) {
          outcome = await claimLocalTurn({
            origin,
            deviceId: opts.deviceId,
            projectIds,
          });
        } else {
          outcome = "unavailable";
        }
      } catch (error) {
        trace("local-claim:failed", {
          message: error instanceof Error ? error.message : String(error),
        });
        outcome = "unavailable";
      }
    }
    if (stopped) return;
    timer = setTimeout(() => void poll(), nextLocalClaimDelay(outcome));
  };

  void poll();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

async function claimLocalTurn(opts: {
  origin: string;
  deviceId: string;
  projectIds: string[];
}): Promise<LocalClaimOutcome> {
  const requestedAt = Date.now();
  const answer = await fetchJson(
    `${opts.origin}/api/desktop/local-turn`,
    {
      method: "POST",
      body: JSON.stringify({ deviceId: opts.deviceId, projectIds: opts.projectIds }),
    },
    { quiet: true },
  );
  if (!answer.ok) {
    trace("local-claim:unavailable", { status: answer.status });
    return "unavailable";
  }
  if (
    typeof answer.body === "object" && answer.body !== null &&
    (answer.body as { status?: unknown }).status === "idle"
  ) {
    return "idle";
  }

  const assignment = parseLocalTurnAssignment(answer.body);
  if (!assignment) {
    noteLauncherFailure(
      `${localTurnRefusalMessage("assignment_invalid", "")}\n` +
      `${JSON.stringify(answer.body)?.slice(0, 800) ?? ""}`,
    );
    return "unavailable";
  }

  const serverDiagnostics =
    typeof answer.body === "object" && answer.body !== null &&
    typeof (answer.body as Record<string, unknown>).diagnostics === "object"
      ? ((answer.body as Record<string, unknown>).diagnostics as Record<string, unknown>)
      : undefined;
  const assignmentReadyMs = Date.now() - requestedAt;
  trace("local-turn:assignment-ready", { runId: assignment.runId, elapsedMs: assignmentReadyMs });
  const result = await runAssignment(assignment, opts.origin, {
    requestedAt,
    assignmentReadyMs,
    serverDiagnostics,
  });
  return result.status === "started" ? "claimed" : "refused";
}

/**
 * PREHEAT THE LOCAL PATH WHILE THE APPLICATION OPENS.
 *
 * No jobs, control tokens, LLM keys or user repositories are involved:
 * we just cache the original signed harness and binary
 * machine opencode. The trick keeps its complete controls — notably the
 * rehash of the bundle just before the fork — but its first message no longer pays for
 * a download or installation that could be done upon opening.
 */
export function prewarmLocalAgent(origin: string): Promise<boolean> {
  if (localAgentReadyOrigins.has(origin)) return Promise.resolve(true);
  const active = localAgentWarmups.get(origin);
  if (active) return active;

  const userData = app.getPath("userData");
  const task = Promise.all([
    // No job yet, therefore no protocol to confront. The trick will do it
    // always before running the warmed cache.
    ensureBundle(origin),
    ensureOpencode(localOpencodeDir(userData)),
  ])
    .then(([bundle, opencode]) => {
      const ready = bundle.ok && opencode.ok;
      trace("local-agent:prewarm", {
        origin,
        bundle: bundle.ok ? "ready" : bundle.reason,
        opencode: opencode.ok ? "ready" : opencode.reason,
      });
      if (ready) localAgentReadyOrigins.add(origin);
      return ready;
    })
    .catch((error) => {
      // Preheating is an optimization: a network unavailable at
      // start should neither alert nor prevent the normal pre-flight of the tour.
      trace("local-agent:prewarm-failed", {
        origin,
        message: error instanceof Error ? error.message : String(error),
      });
      return false;
    })
    .finally(() => localAgentWarmups.delete(origin));
  localAgentWarmups.set(origin, task);
  return task;
}

/**
 * PLAY AN ASSIGNMENT — the core of the batch, called both by the historical trigger
 * and by the clone claim loop (MIN-371).
 *
 * The order of the five steps is not irrelevant: **anything that can refuse
 * refuses before the first byte written to disk.** A round that fails after
 * placing a `job.json` leaves behind a lease and a push URL in a
 * file that no one will read again.
 */
export async function runAssignment(
  assignment: LocalTurnAssignment,
  origin: string,
  opts: {
    machinePreflight?: LocalMachinePreflight;
    requestedAt?: number;
    assignmentReadyMs?: number;
    serverDiagnostics?: Record<string, unknown>;
  } = {},
): Promise<LocalTurnResult> {
  const userData = app.getPath("userData");

  // 1. THE DEPOSIT, now revalidated. The attachment dates back perhaps a month: the
  // folder could have been moved, the disk unmounted, the project re-linked elsewhere.
  // No linked repository → no identity to compare against: the folder is validated
  // as a plain git checkout (remote optional).
  const repo = describeLocalRepo(
    assignment.projectId,
    assignment.repoFullName
      ? { fullName: assignment.repoFullName, aliases: assignment.repoPreviousNames ?? [] }
      : null,
  );
  if (repo.status !== "ready") {
    const reason: LocalTurnRefusal = repo.status === "none" ? "no_repo" : "repo_invalid";
    const message = localTurnRefusalMessage(reason, assignment.repoFullName);
    noteLauncherFailure(message);
    return refuse(reason, message);
  }

  // 2. THE HARNESS and OPENCODE. These two pre-flights only depend on data
  // already validated (the origin, the protocol and the machine folder) and do not
  // are not written in the tour repository. Wait for them one after the other
  // unnecessarily added manifest network time at startup/at
  // the installation of opencode — particularly visible at the first token.
  // We keep the refusals and their display order below: only time
  //    d'attente se recouvre.
  const bundlePromise = opts.machinePreflight
    ? validatePreflightBundle(origin, opts.machinePreflight.bundle, assignment.job.protocolVersion)
    : ensureBundle(origin, assignment.job.protocolVersion);
  const opencodeDir = localOpencodeDir(userData);
  const opencodePromise = opts.machinePreflight?.opencode ?? ensureOpencode(opencodeDir);

  // The protocol confronted is that of the JOB that we are going to give him, never a
  // constant compiled in the app: the shell does not speak the protocol, it
  // relay it.
  const bundle = await bundlePromise;
  if (!bundle.ok) {
    const message = harnessRefusalMessage(bundle.reason, origin);
    noteLauncherFailure(message);
    return refuse(bundle.reason, message);
  }

  // 3. OPENCODE, once per machine and not once per turn.
  const opencode = await opencodePromise;
  if (!opencode.ok) {
    noteLauncherFailure(opencode.message);
    return refuse(opencode.reason, opencode.message);
  }

  // 4. THE RUN DISC. The attached checkout can carry the branch, index and
  // the person's WIP. When the session has requested isolation, git creates a
  // worktree under its run root: no file from this human checkout is
  // touch. This gesture happens after the pre-flights, so that a harness or opencode
  // unavailable doesn't even leave a checkout to clean.
  const isolated = assignment.localWorktree;
  const worktree = isolated
    ? prepareLocalWorktree({
        sourceRepo: repo.path,
        runRoot: localRunRoot(userData, assignment.runId),
        baseBranch: typeof assignment.job.baseBranch === "string" ? assignment.job.baseBranch : null,
        workBranch: typeof assignment.job.workBranch === "string" ? assignment.job.workBranch : "",
        authUrl: assignment.job.authUrl,
      })
    : null;
  if (worktree && !worktree.ok) {
    noteLauncherFailure(worktree.message);
    return refuse("repo_invalid", worktree.message);
  }

  // The layout is the only thing the machine adds to the
  // job, and `localLayout` ensures that the harness never lands IN the
  // user's repository — otherwise it would appear in their `git status`.
  const layout = localLayout({
    userDataPath: userData,
    runId: assignment.runId,
    repoPath: worktree?.ok ? worktree.path : repo.path,
    isolated,
  });
  const job = assignmentToJob(assignment, {
    layout,
    appOrigin: origin,
    isolated,
    localProjects: localProjectsFor(assignment.projects),
  });

  const log = openRunLog(
    {
      runId: assignment.runId,
      appVersion: app.getVersion(),
      bundleVersion: bundle.manifest.sha256.slice(0, 12),
      opencodeVersion: OPENCODE_VERSION,
      repoPath: layout.repoDir,
    },
    localTurnSecrets(job),
  );
  if (opts.assignmentReadyMs != null) {
    log.write(`[desktop-timing] assignment-ready +${opts.assignmentReadyMs}ms\n`, "out");
  }
  if (opts.serverDiagnostics) {
    log.write(`[server-timing] ${JSON.stringify(opts.serverDiagnostics)}\n`, "out");
  }
  if (opencode.note) log.write(`${opencode.note}\n`, "out");

  try {
    mkdirSync(layout.harnessDir, { recursive: true });
    mkdirSync(layout.toolOutputDir, { recursive: true });
    mkdirSync(layout.typecheckDir, { recursive: true });
    writeFileSync(vmJobPath(layout), JSON.stringify(job), "utf8");
  } catch (error) {
    const message = `Could not prepare the run folder at ${layout.root}: ${(error as Error).message}`;
    log.write(message, "err");
    log.close("aborted before the harness started");
    return refuse("bundle", message);
  }

  /**
 * 5. THE LAST CHECK, a hair's breadth from the fork.
 *
 * The bundle was verified upon download — but it may have been rewritten
 * since then, and that's precisely the scenario this bundle exists against: the
 * file lives under `userData`, **writable by the model under the same
 * UID**, and a round that rewrites it would capture the lease, the key
 * and the `authUrl` in the next round. We rehash the file we are about to execute.
 */
  /**
 * ⚠ **ONLY ONE READ, AND THIS IS WHAT WE EXECUTE.**
 *
 * Checking the cache file then rereading it to copy it would reopen the
 * window that we have just closed — it is the second reading which would
 * executed, and nothing would say that it returns the same bytes. We read once,
 * we hash THESE bytes, and we write THESE bytes under the root of the run.
 *
 * Copying under the root is not cosmetic: that's what the
 * function already does in the microVM ([vm-launch.ts](../../lib/server/agent/vm-launch.ts)),
 * and above all it guarantees that a ride in flight keeps ITS harness even if a
 * deployment changes the footprint and the household passes behind.
 */
  const staged = readBundle(bundle.path);
  const beforeFork = verifyBeforeFork(staged, bundle.manifest);
  if (!beforeFork.ok) {
    const message = harnessRefusalMessage(beforeFork.reason, origin);
    log.write(message, "err");
    log.close("harness refused at fork");
    // We throw it away: the next round will redownload it rather than finding the
    // same file and refuse again, indefinitely.
    try {
      rmSync(bundle.path, { force: true });
    } catch {
      // Nothing to repair: the verification will still refuse, which is the correct fault.
    }
    return refuse(beforeFork.reason, message);
  }

  const runBundle = vmBundlePath(layout);
  try {
    writeFileSync(runBundle, staged!.source, "utf8");
  } catch (error) {
    const message = `Could not stage the harness at ${runBundle}: ${(error as Error).message}`;
    log.write(message, "err");
    log.close("aborted before the harness started");
    return refuse("bundle", message);
  }

  const child = utilityProcess.fork(runBundle, [vmJobPath(layout)], {
    cwd: layout.harnessDir,
    // The two hits, LUS: a child whose output no one reads ends up
    // block on a full tube, and a ride lasts hours.
    stdio: "pipe",
    serviceName: `minddy-agent-${assignment.runId.slice(0, 8)}`,
    // ⚠ `childEnv`, and especially not `{ ...process.env, X: undefined }`:
    // `utilityProcess.fork` REFUSES a value that is not a string, and it
    // said without naming the key (`TypeError: Invalid value for env`). The fork falls
    // then before the harness has started, where there is nothing to read yet.
    env: childEnv(process.env),
  });

  child.stdout?.on("data", (chunk: Buffer) => log.write(chunk.toString("utf8"), "out"));
  child.stderr?.on("data", (chunk: Buffer) => log.write(chunk.toString("utf8"), "err"));
  child.once("exit", (code) => {
    live.delete(assignment.runId);
    log.close(`exit ${code}`);
    // The opencode server SURVIVES the harness (`spawn` neither detached nor tracked): 143 MB
    // in memory, the port held, and the next round which fails on a `listen`
    // denied. This is where we finish the work that his `finally` could not do.
    reapChildren(layout.harnessDir);
    sweepRunRoots();
    trace("local-turn:exit", { runId: assignment.runId, code });
  });

  live.set(assignment.runId, {
    runId: assignment.runId,
    ...(assignment.job.commitRef ? { label: assignment.job.commitRef } : {}),
    child,
    log,
    root: layout.root,
    harnessDir: layout.harnessDir,
  });
  trace("local-turn:started", {
    runId: assignment.runId,
    root: layout.root,
    ...(opts.requestedAt ? { startupMs: Date.now() - opts.requestedAt } : {}),
  });

  // Cleaning AFTER the fork, never before (see `staleBundles`).
  pruneBundles(bundle.path);

  return { status: "started", runId: assignment.runId, logPath: log.path };
}

/**
 * STOPS A ROUND. `SIGTERM` first — the harness has a `finally` which closes
 * opencode, the LLM proxy and the tools bridge —, then the child register for
 * which it will not have had time to do.
 *
 * We don't WAIT the death of the process: the caller is `before-quit`, where macOS does
 * does not give a deadline that can be met. The register is the backup guarantee,
 * and it runs at the next startup if it could not do anything.
 */
export function stopLocalTurn(runId: string, note = quitLogNote()): void {
  const turn = live.get(runId);
  if (!turn) return;
  live.delete(runId);
  trace("local-turn:stop", { runId });
  try {
    turn.child.kill();
  } catch {
    // Already dead: there is nothing to repair, and the child register follows.
  }
  reapChildren(turn.harnessDir);
  // The final word goes through `close`, who writes it himself: write it too
  // before would put it twice in the log, and a diagnostic report which
  // repeating itself is a report that is poorly reread.
  turn.log.close(note);
}

/** All rounds, for the ⌘Q. */
export function stopAllLocalTurns(note = quitLogNote()): void {
  for (const runId of live.keys()) stopLocalTurn(runId, note);
}

/**
 * STARTUP CLEANUP — the orphans of a main process crash.
 *
 * `stopLocalTurn` covers the ⌘Q; it does not cover a clean kill app, nor a
 * restart of the Mac in the middle of a round. The child register is on the
 * disk: we reread it for each run root and we finish the work.
 *
 * A pid recycled by the system would designate someone else's process —
 * this is the known risk of any pid register, and it is limited here by the makes
 * that the harness UNREGISTERS what it has stopped itself
 * ([opencode-host.ts](../../lib/server/agent/vm/opencode-host.ts)): only left
 * registered what we were never able to kill.
 */
export function sweepOrphanTurns(): void {
  for (const name of runRootNames()) {
    reapChildren(path.join(runsDir(), name, "harness"));
  }
  sweepRunRoots();
}

// ── The harness ─────────────────────────────── ───────────────────────────────

type BundleReady = { ok: true; path: string; manifest: HarnessManifest };
type BundleRefused = { ok: false; reason: HarnessRefusal };
type OpencodePreflight = ReturnType<typeof ensureOpencode>;
type LocalMachinePreflight = {
  bundle: Promise<BundleReady | BundleRefused>;
  opencode: OpencodePreflight;
};

/**
 * Matches the job with the bundle retrieved during server POST. A file that has
 * disappeared or changed in between is re-downloaded from a fresh manifest;
 * the hash will be recalculated again just before the fork.
 */
async function validatePreflightBundle(
  origin: string,
  prepared: Promise<BundleReady | BundleRefused>,
  jobProtocol: number,
): Promise<BundleReady | BundleRefused> {
  const bundle = await prepared;
  if (!bundle.ok) return bundle;
  const decision = bundleDecision(bundle.manifest, measure(bundle.path), jobProtocol);
  if (decision.action === "reuse") return bundle;
  if (decision.action === "refuse") return { ok: false, reason: decision.reason };
  return ensureBundle(origin, jobProtocol);
}

/**
 * The tour bundle, downloaded if necessary. **The manifest is requested EACH
 * round** — two hundred bytes — and the bytes only when the fingerprint has changed.
 */
async function ensureBundle(
  origin: string,
  jobProtocol?: number,
): Promise<BundleReady | BundleRefused> {
  const answer = await fetchJson(`${origin}${HARNESS_MANIFEST_PATH}`);
  if (!answer.ok) return { ok: false, reason: "manifest_unreachable" };
  const manifest = parseHarnessManifest(answer.body);
  if (!manifest) return { ok: false, reason: "manifest_invalid" };

  const file = path.join(harnessDir(), harnessBundleFileName(manifest.sha256));
  const cached = measure(file);
  if (jobProtocol == null) {
    // The cache is not yet executable: only the tour knows the protocol
    // that he received. Here, we win the download while leaving control
    // compatibility with `runAssignment`.
    if (cached?.sha256 === manifest.sha256 && cached.bytes === manifest.bytes) {
      return { ok: true, path: file, manifest };
    }
  } else {
    const decision = bundleDecision(manifest, cached, jobProtocol);
    if (decision.action === "refuse") return { ok: false, reason: decision.reason };
    if (decision.action === "reuse") return { ok: true, path: file, manifest };
  }

  const download = await fetchText(`${origin}${HARNESS_BUNDLE_PATH}`);
  if (!download.ok) return { ok: false, reason: "download_failed" };
  const body = download.body;
  if (Buffer.byteLength(body, "utf8") > HARNESS_MAX_BYTES) {
    return { ok: false, reason: "download_failed" };
  }
  const verdict = verifyDownload(
    { sha256: sha256Of(body), bytes: Buffer.byteLength(body, "utf8") },
    manifest,
  );
  if (!verdict.ok) return { ok: false, reason: verdict.reason };

  try {
    mkdirSync(harnessDir(), { recursive: true });
    writeFileSync(file, body, "utf8");
  } catch (error) {
    console.error("[launcher] harness was not written", error);
    return { ok: false, reason: "download_failed" };
  }
  return { ok: true, path: file, manifest };
}

function pruneBundles(keep: string): void {
  try {
    for (const name of staleBundles(readdirSync(harnessDir()), path.basename(keep))) {
      rmSync(path.join(harnessDir(), name), { force: true });
    }
  } catch {
    // A failed household costs 280 KB, not a turn.
  }
}

// ── opencode ────────────────────────────────────────────────────────────────

async function ensureOpencode(
  installDir: string,
): Promise<
  | { ok: true; note: string | null }
  | { ok: false; reason: "no_npm" | "install_failed"; message: string }
> {
  const active = opencodePreflights.get(installDir);
  if (active) return active;
  const task = ensureOpencodeOnce(installDir).finally(() => opencodePreflights.delete(installDir));
  opencodePreflights.set(installDir, task);
  return task;
}

async function ensureOpencodeOnce(
  installDir: string,
): Promise<
  | { ok: true; note: string | null }
  | { ok: false; reason: "no_npm" | "install_failed"; message: string }
> {
  return withOpencodeInstallLock(installDir, async () => {
    // Re-read after acquiring the process-wide lock: another launcher or
    // harness may have completed the installation while this one waited.
    const { decision, npm, env } = readOpencodeFacts(installDir);
    if (decision.action === "ready") return { ok: true, note: null };
    if (decision.action === "refuse") {
      return {
        ok: false,
        reason: "no_npm",
        message: opencodeRefusalMessage("no_npm"),
      };
    }
    try {
      mkdirSync(installDir, { recursive: true });
    } catch (error) {
      return {
        ok: false,
        reason: "install_failed",
        message: `Could not create ${installDir}: ${(error as Error).message}`,
      };
    }
    const failure = await installOpencode({ installDir, npm: npm!, env });
    if (failure) return { ok: false, reason: "install_failed", message: failure };
    return { ok: true, note: opencodeInstallNote(decision.why) };
  });
}

// ── Children who survive ─────────────────────── ────────────────────────

/**
 * Kills what the harness left behind. **Best-effort, and no lifting**:
 * an already dead pid returns `ESRCH`, which is the correct result.
 */
function reapChildren(harnessDir: string): void {
  const children = readHarnessChildren(harnessDir);
  if (children.length === 0) return;
  for (const target of killTargets(children, { pid: process.pid, ppid: process.ppid })) {
    try {
      process.kill(target.signalTo, "SIGTERM");
      trace("local-turn:reap", { signalTo: target.signalTo, kind: target.kind });
    } catch {
      // Already dead, or pid recycled beyond our reach: nothing to do.
    }
  }
}

// ── The disk ─────────────────────────────── ────────────────────────────────

function harnessDir(): string {
  return path.join(app.getPath("userData"), HARNESS_DIR_NAME);
}

function runsDir(): string {
  return localRunsDir(app.getPath("userData"));
}

function runRootNames(): string[] {
  try {
    return readdirSync(runsDir(), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

function sweepRunRoots(): void {
  const liveNames = new Set(
    [...live.values()].map((turn) => path.basename(turn.root)),
  );
  const entries = runRootNames().map((name) => {
    try {
      return { name, modifiedMs: statSync(path.join(runsDir(), name)).mtimeMs };
    } catch {
      return { name, modifiedMs: Number.NaN };
    }
  });
  for (const name of staleRunRoots(entries, { nowMs: Date.now(), live: liveNames })) {
    try {
      rmSync(path.join(runsDir(), name), { recursive: true, force: true });
      trace("local-turn:pruned", { root: name });
    } catch {
      // A file that resists costs disk, not a turn.
    }
  }
}

/**
 * The LU bundle, with the fingerprint of these bytes. `null` if it is not there.
 *
 * Returns the SOURCE in addition to the fingerprint, and that's the whole point: what we
 * checks must be what we execute. A function that only returns the hash
 * would require rereading the file to use it, and it is this second reading — the one that we have not checked — that would end up in the `fork`.
 */
function readBundle(file: string): { source: string; sha256: string; bytes: number } | null {
  try {
    const source = readFileSync(file, "utf8");
    return { source, sha256: sha256Of(source), bytes: Buffer.byteLength(source, "utf8") };
  } catch {
    return null;
  }
}

/** The footprint and size alone — what the cache decision looks at. */
function measure(file: string): { sha256: string; bytes: number } | null {
  const read = readBundle(file);
  return read ? { sha256: read.sha256, bytes: read.bytes } : null;
}

function sha256Of(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

// ── The network ─────────────────────────────── ────────────────────────────────

/**
 * `session.defaultSession.fetch`, and not the global `fetch`: this is what sends
 * COOKIES from the active origin. Both harness surfaces are
 * authenticated, and the only legitimate caller is someone logged into
 * this window.
 */
/** What a request returns: the body, or the STATUS and the server phrase. */
type Fetched<T> = { ok: true; body: T } | { ok: false; status: number; error: string };

async function fetchText(
  url: string,
  init?: RequestInit,
  opts: { quiet?: boolean } = {},
): Promise<Fetched<string>> {
  try {
    const response = await session.defaultSession.fetch(url, {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
    });
    const text = await response.text();
    if (!response.ok) {
      if (!opts.quiet) console.error(`[launcher] ${url} → ${response.status} ${text.slice(0, 300)}`);
      return { ok: false, status: response.status, error: serverError(text) };
    }
    return { ok: true, body: text };
  } catch (error) {
    if (!opts.quiet) console.error(`[launcher] ${url} injoignable`, error);
    // `0`: nothing responded. Distinguishing it from a real status avoids making
    // pass a network outage for server refusal.
    return { ok: false, status: 0, error: (error as Error).message };
  }
}

async function fetchJson(
  url: string,
  init?: RequestInit,
  opts: { quiet?: boolean } = {},
): Promise<Fetched<unknown>> {
  const text = await fetchText(url, init, opts);
  if (!text.ok) return text;
  try {
    return { ok: true, body: JSON.parse(text.body) };
  } catch {
    // An HTML page (captive portal, corporate proxy) arrives here.
    const preview = text.body.replace(/\s+/g, " ").trim().slice(0, 240);
    return {
      ok: false,
      status: 200,
      error: `the answer was not JSON${preview ? `: ${preview}` : " (empty body)"}`,
    };
  }
}

/** The server's sentence, taken from its `{ error }` — otherwise the body, narrow-minded. */
function serverError(text: string): string {
  try {
    const parsed = JSON.parse(text) as { error?: unknown };
    if (typeof parsed.error === "string" && parsed.error) return parsed.error;
  } catch {
    // No JSON: an error page, a proxy. The beginning of the body already says it all.
  }
  return text.slice(0, 200) || "no answer body";
}

function refuse(
  reason: Extract<LocalTurnResult, { status: "refused" }>["reason"],
  message: string,
): LocalTurnResult {
  trace("local-turn:refused", { reason });
  return { status: "refused", reason, message };
}
