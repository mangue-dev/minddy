import "server-only";

import { Sandbox as VercelSandbox, type NetworkPolicy } from "@vercel/sandbox";
import { requireCapability } from "@/lib/server/capabilities";
import { SelfHostedSandbox } from "./self-hosted-sandbox";

import {
  SANDBOX_RUNTIME,
  type RepoHost,
  type ShellOptions,
  type ShellResult,
} from "./repo-host";
import type { HarnessLayout } from "./harness-layout";
import { resolveAgentExecutionBackend } from "@/lib/capabilities";
import { rotateAgentForgeCredential } from "./network-policy";

/**
 * Code Agent Vercel Sandbox Layer (MIN-46) — the microVM itself: its
 * creation, its awakening, its network policy, its shutdown.
 *
 * WHAT GONE FROM HERE (MIN-224). All gestures on the DEPOSIT — clone,
 * reading, editing, grep, background jobs, commit, push — now live in
 * [repo-host.ts](repo-host.ts), written against four primitives rather than against
 * the SDK. This file only keeps the RPC adapter (`sandboxHost`): the same
 * logic runs, identically, on the local disk when the loop lives IN the
 * microVM. What remains here is what only makes sense from the function — we don't
 * not create the machine from the machine.
 *
 * IDENTITY & RECOVERY: a Sandbox is identified by a DETERMINIST `name`
 * (`agent-<run.id>`, persisted in agent_runs.sandbox_id). `getOrCreateAgentSandbox`
 * is idempotent: if the microVM (or its persistent SNAPSHOT) still exists, it
 * is AWAKENED with its filesystem restored (quick recovery, no re-clone);
 * otherwise `onCreate` clones the working branch on a new VM. `persistent: true`
 * (automatic restoration of FS between sessions via snapshots) is the DEFAULT of the SDK
 * since its v2 - we still ask it, explicitly: it is on him that all depends
 * recovery, it does not have to disappear in a default. `snapshotExpiration` and
 * `keepLastSnapshots`, they do not repeat a defect: they TIGHTEN two which
 * cost (see below). The git (WIP branch pushed on each break) remains the
 * durable net beyond snapshot expiration. AUTH: reuses
 * VERCEL_TOKEN/TEAM_ID/PROJECT_ID (like custom domains, MIN-36); on Vercel
 * l'OIDC suffit.
 */

/**
 * Maximum lifespan of a SESSION of the microVM (it survives the gap between two chunks).
 * This is the ceiling of the PLAN — 24 hours on Pro; the 45 minutes that we wore here were the
 * Hobby landing, therefore our ceiling and not that of the platform. The API does it
 * respecter : 24 h passe, 25 h repart en 400.
 *
 * He is NOT the governor of spending. An idle VM is shut down after ~5 min
 * by the inactivity reaper (`drain.ts`), and this number is only read in two cases:
 * a lathe that works longer than that without ever resting (he lost his VM
 * hot in full work and repaid a cold start), and a microVM that the
 * reaper did not know how to cut (`stopSandboxByName` swallows its errors after having posed
 * `sandbox_stopped_at`, so it will not come back) — this one will now live much longer
 * a long time before dying out on its own. Rare leak, limited cost, and this is the prerequisite
 * hardware of an orchestrator that lives IN the VM: the VM must last as long
 * that the turn.
 */
const SANDBOX_TIMEOUT_MS = 24 * 60 * 60_000;
/** Retention of persistent snapshots (fast recovery): tightens the SDK default,
 * which is 30 DAYS. Beyond that, we fall back on the re-clone of the git branch
 * (lasts forever). */
const SANDBOX_SNAPSHOT_EXPIRATION_MS = 7 * 24 * 60 * 60_000;

export interface AgentSandboxCommand {
  readonly cmdId: string;
  readonly exitCode: number | null;
  stdout(): Promise<string>;
  stderr(): Promise<string>;
  wait(opts?: { signal?: AbortSignal }): Promise<void>;
}

export interface AgentSandboxCommandResult extends AgentSandboxCommand {}

export interface AgentSandbox {
  readonly name: string;
  readonly networkPolicy?: NetworkPolicy;
  runCommand(input: {
    cmd: string;
    args?: string[];
    cwd?: string;
    timeoutMs?: number;
    signal?: AbortSignal;
    env?: Record<string, string>;
    detached?: boolean;
  }): Promise<AgentSandboxCommandResult>;
  readFileToBuffer(input: { path: string }): Promise<Buffer | null>;
  writeFiles(files: Array<{ path: string; content: string }>): Promise<void>;
  mkDir(path: string): Promise<void>;
  stop(): Promise<void>;
  getCommand(commandId: string): Promise<AgentSandboxCommand | null>;
}

export type Sandbox = AgentSandbox;

/**
 * Everything `repo-host.ts` does to the repository, rendered by RPC round trips to
 * the microVM. This is the path of the OLD form (the loop in the function) and
 * that of the function when it begins a run of the new one: a clone, a
 * `writeFiles`, a reading of `AGENTS.md`.
 *
 * `layout` is EXPLICIT since MIN-354, even if it is always `cloudLayout()`
 * here: this path speaks to a microVM, and a microVM always has the layout of the
 * cloud. Passing it rather than assuming it is what makes the day when a host
 * is talking to something else, there is nothing to find in this file.
 */
export function sandboxHost(sandbox: AgentSandbox, layout: HarnessLayout): RepoHost {
  return {
    layout,
    processIsolation: "sandbox",
    exec: async (command: string, opts?: ShellOptions): Promise<ShellResult> => {
      const res = await sandbox.runCommand({
        cmd: "sh",
        args: ["-c", command],
        cwd: opts?.cwd ?? layout.repoDir,
        timeoutMs: opts?.timeoutMs,
        signal: opts?.signal,
        env: opts?.env,
      });
      const [stdout, stderr] = await Promise.all([res.stdout(), res.stderr()]);
      return { exitCode: res.exitCode ?? 1, stdout, stderr };
    },
    readFile: async (absPath: string): Promise<string | null> => {
      const buf = await sandbox.readFileToBuffer({ path: absPath });
      return buf ? buf.toString("utf8") : null;
    },
    writeFile: async (absPath: string, content: string): Promise<void> => {
      await sandbox.writeFiles([{ path: absPath, content }]);
    },
    mkdir: async (absPath: string): Promise<void> => {
      await sandbox.mkDir(absPath);
    },
  };
}

/**
 * Explicit Sandbox credentials (dev / non-Vercel). Empties on Vercel → OIDC
 * takes over automatically.
 */
function sandboxCredentials(): { token: string; teamId: string; projectId: string } | Record<string, never> {
  const token = process.env.VERCEL_TOKEN?.trim();
  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  const projectId = process.env.VERCEL_PROJECT_ID?.trim();
  if (token && teamId && projectId) return { token, teamId, projectId };
  return {};
}

/**
 * Recovers the microVM named `name` by WAKE UP its session (filesystem restored
 * from the persistent snapshot → fast recovery, `onCreate` NOT called), otherwise in
 * creates a new one and calls `onCreate` (which clones the working branch). A snapshot
 * expired is treated as "not found" → recreates + `onCreate`. Optional boot
 * from AGENT_SANDBOX_SNAPSHOT_ID (pre-heated image) for fresh creation.
 *
 * NETWORK POLICY (MIN-223) — `networkPolicy` is set at creation and refreshed
 * every time a persistent sandbox resumes.
 *
 * The policy survives a resumed session, including the credentials embedded in
 * its transforms. The previous run key is revoked when the VM stops, so a
 * resumed sandbox must not execute until the new policy and key are installed.
 *
 * A refresh failure is therefore a bootstrap failure, not a warning. Propagating
 * it prevents confusing provider 401s and lets the run-level bounded 5xx retry
 * schedule handle a transient Vercel outage.
 */
export async function getOrCreateAgentSandbox(opts: {
  name: string;
  onCreate: (sandbox: AgentSandbox) => Promise<void>;
  /** Policy of MIN-223. Absent = previous behavior (open network, no
   * injection) — while the callers wire it. */
  networkPolicy?: NetworkPolicy;
}): Promise<{ sandbox: AgentSandbox; created: boolean }> {
  if (resolveAgentExecutionBackend(process.env) === "self-hosted") {
    requireCapability("agentExecution");
    const result = await SelfHostedSandbox.getOrCreate(opts.name);
    if (result.created) await opts.onCreate(result.sandbox);
    return result;
  }
  // SDK import is inert, but any compute operation must be a
  // explicit choice. Without a Vercel backend configured, we stop short of the SDK.
  requireCapability("vercelSandbox");
  const creds = sandboxCredentials();
  const snapshotId = process.env.AGENT_SANDBOX_SNAPSHOT_ID?.trim();
  let created = false;
  const base = {
    ...creds,
    name: opts.name,
    timeout: SANDBOX_TIMEOUT_MS,
    persistent: true,
    snapshotExpiration: SANDBOX_SNAPSHOT_EXPIRATION_MS,
    // Each session shutdown creates an ADDITIONAL snapshot, all alive for 7 days, so
    // that only one is ever used for recovery: the storage billed followed the number of
    // breaks in the run, not its size. We only keep the last one - the ousted leave
    // right away (`deleteEvicted` is true by default), and nothing here returns
    // never on a previous snapshot (no `currentSnapshotId` in the repository).
    keepLastSnapshots: { count: 1 },
    resume: true,
    ...(opts.networkPolicy ? { networkPolicy: opts.networkPolicy } : {}),
    onCreate: async (fresh: VercelSandbox) => {
      created = true;
      await opts.onCreate(fresh as unknown as AgentSandbox);
    },
  };
  const sandbox = snapshotId
    ? await VercelSandbox.getOrCreate({ ...base, source: { type: "snapshot", snapshotId } })
    : await VercelSandbox.getOrCreate({ ...base, runtime: SANDBOX_RUNTIME });

  if (opts.networkPolicy && !created) {
    await sandbox.update({ networkPolicy: opts.networkPolicy });
  }
  return { sandbox: sandbox as unknown as AgentSandbox, created };
}

/** Stable name of the microVM to persist in agent_runs.sandbox_id. */
export function sandboxName(sandbox: AgentSandbox): string {
  return sandbox.name;
}

/**
 * Stops a microVM by its NAME without waking it up (`resume: false`), to reap it
 * of inactivity: we cut the VM to rest while keeping its persistent snapshot,
 * so that the session remains resumable (quick wake-up to the next message).
 * Best-effort — never raises (already stopped/expired/not found).
 */
export async function stopSandboxByName(name: string): Promise<void> {
  if (resolveAgentExecutionBackend(process.env) === "self-hosted") {
    const sandbox = await SelfHostedSandbox.get(name).catch(() => null);
    await sandbox?.stop().catch(() => {});
    return;
  }
  if (!requireSandboxCapability()) return;
  try {
    const creds = sandboxCredentials();
    const sandbox = await VercelSandbox.get({ ...creds, name, resume: false });
    await sandbox.stop();
  } catch {
    // best-effort.
  }
}

/**
 * The microVM of a run, by name, WITHOUT waking it up — to READ it while
 * his turn turns (the current diff, MIN-266). `null` when there is nothing to
 * read: session expired, VM asleep by reaper, API down.
 *
 * `resume: false` for the same reason as `isLoopCommandAlive` just below, and
 * it counts double here: this reading starts from an interface gesture (open the
 * diff view), not a cron. Wake up the microVM from an idle run to paint
 * a diff would restart its compute billing on a click — and the diff of a run at
 * rest is already served by the forge, which costs nothing.
 */
export async function getAgentSandboxByName(name: string): Promise<AgentSandbox | null> {
  if (resolveAgentExecutionBackend(process.env) === "self-hosted") {
    return SelfHostedSandbox.get(name).catch(() => null);
  }
  if (!requireSandboxCapability()) return null;
  try {
    const creds = sandboxCredentials();
    return await VercelSandbox.get({ ...creds, name, resume: false }) as unknown as AgentSandbox;
  } catch {
    return null;
  }
}

/** Rotate forge authentication in trusted infrastructure without returning the
 * credential to the sandbox process that requested the refresh. */
export async function refreshAgentSandboxForgeAccess(
  name: string,
  target: {
    authUrl: string;
    remoteUrl: string;
    provider: "github" | "gitlab";
    repoFullName: string;
    token: string;
  },
): Promise<void> {
  const sandbox = await getAgentSandboxByName(name);
  if (!sandbox) throw new Error("agent sandbox is unavailable");
  if (sandbox instanceof SelfHostedSandbox) {
    await sandbox.refreshGitRelay(target.authUrl);
    return;
  }
  const policy = rotateAgentForgeCredential(sandbox.networkPolicy, {
    provider: target.provider,
    repoFullName: target.repoFullName,
    token: target.token,
    origin: new URL(target.remoteUrl).origin,
  });
  await (sandbox as unknown as VercelSandbox).update({ networkPolicy: policy });
}

function requireSandboxCapability(): boolean {
  try {
    requireCapability("vercelSandbox");
    return true;
  } catch {
    return false;
  }
}

/**
 * How long do we let `wait()` answer before concluding “he lives”.
 *
 * MEASURED (2026-08-07, real microVM): on a process already dead, `wait()` renders
 * **270ms**. Five seconds are therefore well above the need — the margin is
 * for transatlantic latency, not for the verdict. On a living process,
 * `wait()` does not return at all: it is the delay itself which makes the response.
 */
const LOOP_COMMAND_WAIT_MS = 5_000;

/**
 * Is the loop process of a `loop_in_vm` (MIN-224) run still alive?
 *
 * `null` = unknown — microVM not found, session expired, API down.
 * The caller must then DO NOTHING: the watchdog only concludes with a
 * done, never on a silence. `false` = the process has rendered, and this is an observation
 * exact death.
 *
 * IT NEEDS `wait()`, AND THAT’S THE WHOLE FILE. An order issued in
 * `detached: true` **never** sees his `exitCode` reconciled as a person
 * does not expect it: measured on a real microVM, a process killed for eight minutes
 * — absent from `ps`, no longer an event in the thread — still returned `exitCode: null`.
 * Reading this field alone therefore caused this watchdog to respond “alive” on
 * ALL deaths, and one run whose loop dies remained `running` forever:
 * the idle sweeper only picks up
 * the runs at rest, and the microVM was running until 24 hours into the session.
 *
 * `wait()` limited gives the three answers without inventing any:
 *
 * - it RETURNS ⇒ the process has finished, whatever its code (137 for a SIGKILL);
 * - he did not return the deadline ⇒ the process is still working;
 * - he brings up something else ⇒ we don’t know, and we keep quiet.
 *
 * The `timedOut` flag rather than the exception name: it's OUR clock
 * who decides, not how the SDK dresses up an abandonment.
 *
 * `resume: false` DELIBERATELY: querying the status of an order should never
 * wake up a microVM that the reaper has just put to sleep — this would restart the
 * compute billing of a run at rest, each time the cron passes.
 */
export async function isLoopCommandAlive(
  sandboxId: string,
  commandId: string,
): Promise<boolean | null> {
  if (resolveAgentExecutionBackend(process.env) === "self-hosted") {
    try {
      const sandbox = await SelfHostedSandbox.get(sandboxId);
      if (!sandbox) return null;
      const command = await sandbox.getCommand(commandId);
      if (!command) return null;
      if (command.exitCode != null) return false;
      const abort = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; abort.abort(); }, LOOP_COMMAND_WAIT_MS);
      try {
        await command.wait({ signal: abort.signal });
        return false;
      } catch {
        return timedOut ? true : null;
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return null;
    }
  }
  if (!requireSandboxCapability()) return null;
  try {
    const creds = sandboxCredentials();
    const sandbox = await VercelSandbox.get({ ...creds, name: sandboxId, resume: false });
    const command = await sandbox.getCommand(commandId);
    if (!command) return null;
    // Already reconciled (order not detached, or someone waited for it before
    // us): nothing more to ask.
    if (command.exitCode != null) return false;

    const abort = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      abort.abort();
    }, LOOP_COMMAND_WAIT_MS);
    try {
      await command.wait({ signal: abort.signal });
      return false;
    } catch {
      return timedOut ? true : null;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}
