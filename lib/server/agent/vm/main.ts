import { readFile, unlink } from "node:fs/promises";

import { cloudLayout } from "../harness-layout";
import { createControlPlaneClient } from "./control-plane-client";
import { reservePort } from "./free-port";
import { localHost } from "./local-host";
import { opencodeSupervisorDeps } from "./opencode-host";
import { prepareSandboxGithubCli } from "./github-cli";
import { runOpencodeTurn } from "./supervisor";
import { runNativeTurn } from "./native-supervisor";
import { isNativeAgentEngine } from "@/lib/agent-engines";
import {
  isLocalJob,
  parseVmJob,
  vmJobPath,
  type VmJob,
  type VmTurnReport,
} from "./protocol";

/**
 * Read a one-shot job outside the checkout and always report turn completion.
 * OpenCode API credentials stay in the network layer. Native profiles live only
 * in the private controller area, which repository commands cannot access.
 */
async function runOpencodeTurnHere(
  job: VmJob,
  cp: ReturnType<typeof createControlPlaneClient>,
  host: ReturnType<typeof localHost>,
): Promise<VmTurnReport> {
  if (!job.opencodeInput) throw new Error("job carries no opencodeInput");
  /**
   * THE OPENCODE PORT, REQUESTED TO THE SYSTEM (MIN-354) — 4096 hard as long as the
   * microVM was ours alone, reserved here since a machine can carry
   * two runs (cf. [free-port.ts](free-port.ts)). The tools bridge listens to
   * on an ephemeral port of itself and returns its URL.
   */
  const opencodePort = await reservePort();
  const cli = isLocalJob(job) ? null : await prepareSandboxGithubCli(job);
  const previousEnv = Object.fromEntries(Object.keys(cli?.env ?? {}).map((key) => [key, process.env[key]]));
  if (cli) Object.assign(process.env, cli.env);
  try {
    return await runOpencodeTurn(job, job.opencodeInput, cp, host, {
      ...opencodeSupervisorDeps({ port: opencodePort, layout: job.layout }),
      opencodePort,
    });
  } finally {
    await cli?.close();
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

/**
 * Where to read the job. The pitcher's argument is authoritative; fallback is the path to the
 * microVM, the only world where there has only ever been one possible root.
 */
function jobPathFromArgv(): string {
  const given = process.argv[2]?.trim();
  return given || vmJobPath(cloudLayout());
}

async function main(): Promise<void> {
  /**
   * THE JOB IS READ RAW, THEN VALIDATED IN THE `try` (MIN-354) — and not before.
   *
   * The refusal of an unknown contract (`parseVmJob`) is an end of turn like a
   * other: it must exit by the same ratio as the rest, otherwise an expired harness
   * leaves a run `running` that only the watchdog will end up seeing as dead. Only `appOrigin` is read outside of validation, because you need
   * an address to say that you are refusing — it is the oldest field in the
   * contract, and the only one about which you cannot do anything else.
   *
   * SINCE MIN-355, THERE HAS BEEN AT ONE SECOND, and for exactly the same reason: on
   * the user's machine, an address is not enough to speak, you also need
   * the token. Reading it out of validation is what keeps the promise of this
   * file true — the trick ALWAYS returns a report, including when that report says
   * "I refuse this job."
   */
  let source = "";
  // These two routing hints are recoverable even when a truncated or otherwise
  // malformed JSON document cannot be validated. They let the failure travel
  // through the same terminal report path as every other rejected job.
  const hinted = (field: "appOrigin" | "controlToken"): string => {
    const match = source.match(
      new RegExp(`"${field}"\\s*:\\s*("(?:\\\\.|[^"\\\\])*")`),
    );
    if (!match) return "";
    try {
      const value = JSON.parse(match[1]);
      return typeof value === "string" ? value : "";
    } catch {
      return "";
    }
  };
  let raw: { appOrigin?: string; controlToken?: string; forgeRefreshPolicy?: string } = {
    appOrigin: process.argv[3]?.trim() || undefined,
    controlToken: process.argv[4]?.trim() || undefined,
  };
  let cp = createControlPlaneClient(
    raw.appOrigin ?? "",
    // A getter, because the token lasts fifteen minutes and one round of hours:
    // this is where the renewal will be connected (MIN-294), without touching the
    // customer. Today he still delivers what the job required.
    () => raw.controlToken ?? null,
    () => raw.forgeRefreshPolicy,
  );
  const startedAt = Date.now();

  let job: VmJob | null = null;
  let report: VmTurnReport;
  try {
    const jobPath = jobPathFromArgv();
    source = await readFile(jobPath, "utf8");
    // The launch file is a one-shot delivery channel, not session state.
    await unlink(jobPath);
    raw = {
      appOrigin: hinted("appOrigin") || raw.appOrigin,
      controlToken: hinted("controlToken") || raw.controlToken,
    };
    cp = createControlPlaneClient(
      raw.appOrigin ?? "",
      () => raw.controlToken ?? null,
      () => raw.forgeRefreshPolicy,
    );
    const parsed = JSON.parse(source) as unknown;
    if (typeof parsed !== "object" || parsed === null) {
      throw new Error("job must be a JSON object");
    }
    raw = parsed as typeof raw;
    job = parseVmJob(raw);
    report = isNativeAgentEngine(job.engine)
      ? await runNativeTurn(job, job.opencodeInput!, cp)
      : await runOpencodeTurnHere(job, cp, localHost(job.layout, isLocalJob(job) ? "host" : "sandbox"));
  } catch (err) {
    const message = isNativeAgentEngine(job?.engine) ? "Native worker could not complete its turn"
      : err instanceof Error ? err.message : String(err);
    console.error("[agent-vm] turn failed", { code: "agent_vm_turn_failed", runId: job?.runId ?? null });
    await cp.emit("error", { message }).catch(() => {});
    /**
     * THE EMERGENCY REPORT, and it carries NO checkpoint. The supervisor has
     * raised, so we have no reason to believe its log pointer is up to date —
     * and a pointer ahead of what has been written would restart the next round
     * of a session that it cannot replay.
     *
     * The last PERIODIC checkpoint, itself, was written to a safe round
     * boundary. The function keeps it as is (see `VmTurnReport.checkpoint`): this
     * report does not replace it, it only says that the round is finished and
     * why.
     */
    report = {
      status: "error",
      errorMessage: message.slice(0, 1000),
      costUsd: 0,
      checkpointDropped: [],
      checkpointBytes: 0,
      pushed: null,
      // `null` when it is the JOB that was refused: nothing about him is worthy of
      // trust, not even the branch of work.
      workBranch: job?.workBranch ?? "",
      // Same rule as healthy exit: booting cost microVM, and a
      // turn which raises should not be the occasion not to charge it.
      sandboxMs: (job?.bootstrapMs ?? 0) + (Date.now() - startedAt),
    };
  }

  await cp.reportTurn(report);
}

main().then(
  () => process.exit(0),
  () => {
    // We only arrive here if the REPORT itself has not been passed — plan of
    // control unreachable, or job unreadable. Nothing to save from the VM: the
    // watchdog will note the death and put the session to rest on its
    // last checkpoint. The non-zero exit code is what it will read.
    console.error("[agent-vm] terminal report failed", { code: "agent_vm_report_failed" });
    process.exit(1);
  },
);
