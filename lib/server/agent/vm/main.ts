import { readFile } from "node:fs/promises";

import { cloudLayout } from "../harness-layout";
import { createControlPlaneClient } from "./control-plane-client";
import { reservePort } from "./free-port";
import { localHost } from "./local-host";
import { opencodeSupervisorDeps } from "./opencode-host";
import { runOpencodeTurn } from "./supervisor";
import { isLocalJob, parseVmJob, vmJobPath, type VmJob, type VmTurnReport } from "./protocol";

/**
 * HARNESS ENTRANCE (MIN-224) — the point the caster starts at
 * `detached: true` before returning hand.
 *
 * `node main.js <chemin du job>`, and that's it. The bundle is written at the start
 * of the round, next to its job; both live OUTSIDE the repository, so that the end of
 * round never takes them into a commit of the user's repository — and, in
 * current repository mode (MIN-358), so that they do not even appear in his
 * `git status` (cf. `HarnessLayout.harnessDir`).
 *
 * THE JOB PATH COMES FROM THE ARGUMENT, NOT FROM A CONSTANT (MIN-354), and that is
 * the only thing this process learns other than from the job itself: all the
 * remains — repository, tools releases, harness, opencode — is IN the job. The egg and
 * the chicken unravel there, and nowhere else.
 *
 * WHAT THIS FILE GUARANTEES, and this is its only real reason for being: **the trick
 * ALWAYS reports**. The function has given up, no one is waiting for it,
 * and a process that dies without speaking leaves a `running` * run that only the guard dog
 * will eventually recognize as dead — several minutes later, on the
 * last periodic checkpoint, with work lost in between. Hence the global
 * `try`, and the minimal report it returns when all else has failed.
 *
 * IN A MICROVM, the process holds NO secrets. The firewall places the key of the
 * model after exiting the VM, and the control plane proves the identity of the run
 * by an OIDC of the platform: `env | grep -i key` does not return anything here, as
 * measured in MIN-223. There is no
 * firewall, so this process holds TWO things:
 *
 * 1. **a local execution token** (`controlToken`), carried by the job and placed
 * on each of its calls to the control plane. It is readable by what the
 * round executes; what makes it tenable is not a stash, it's what it
 * DOES NOT OPEN — see `handleControlPlaneRequest` and
 * [local-exec-token.ts](../local-exec-token.ts) ;
 * 2. **the model key**, which is NOT in the job: it is requested at
 * start of the tour (`/llm-key`) and only lives in the memory of the LLM
 * proxy ([llm-proxy.ts](llm-proxy.ts)), therefore outside the environment of the server
 * opencode, which the model reads with a simple `env`. It is always mined at
 * hard ceiling: it is the ceiling, and it alone, which limits what a hostile model
 * can do with it.
 */

/**
 * THERE IS ONLY ONE ENGINE (MIN-286) — opencode, and the job referral a
 * disappeared with the home loop.
 *
 * A job WITHOUT `opencodeInput` is a fault of the function, not a variant: on
 * raises rather than posting an empty round, and the `try` of `main` turns that into a
 * error report — that is, something that is visible.
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
  return await runOpencodeTurn(job, job.opencodeInput, cp, host, {
    ...opencodeSupervisorDeps({ port: opencodePort, layout: job.layout }),
    opencodePort,
  });
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
  const raw = JSON.parse(await readFile(jobPathFromArgv(), "utf8")) as {
    appOrigin?: string;
    controlToken?: string;
  };
  const cp = createControlPlaneClient(
    raw.appOrigin ?? "",
    // A getter, because the token lasts fifteen minutes and one round of hours:
    // this is where the renewal will be connected (MIN-294), without touching the
    // customer. Today he still delivers what the job required.
    () => raw.controlToken ?? null,
  );
  const startedAt = Date.now();

  let job: VmJob | null = null;
  let report: VmTurnReport;
  try {
    job = parseVmJob(raw);
    report = await runOpencodeTurnHere(
      job,
      cp,
      localHost(job.layout, isLocalJob(job) ? "host" : "sandbox"),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[agent-vm] turn crashed:", message);
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
  (err) => {
    // We only arrive here if the REPORT itself has not been passed — plan of
    // control unreachable, or job unreadable. Nothing to save from the VM: the
    // watchdog will note the death and put the session to rest on its
    // last checkpoint. The non-zero exit code is what it will read.
    console.error("[agent-vm] fatal:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  },
);
