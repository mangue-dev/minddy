import "server-only";

import { harnessBundleSource } from "./harness-bundle";
import { assertUsableLayout } from "./harness-layout";
import { vmBundlePath, vmJobPath, type VmJob } from "./vm/protocol";
import type { AgentSandbox } from "./sandbox";

/**
 * STARTING THE LOOP IN THE MICROVM (MIN-224) — the last gesture of the
 * function before she gives up.
 *
 * Three writings and a launch: the harness bundle, the tour job, then
 * `node main.js` to `detached: true`. The function does NOT expect it; she persists
 * the order ID and returns. From there, the conversation lives
 * in the VM, and the function only exists as a control plane.
 *
 * NO `timeoutMs` ON THE ORDER, and this is deliberate. The SDK enforces it
 * to the exec, including on a detached command: placing one would cap the
 * turn, what migration exists precisely to remove. The tower ceiling
 * is the one that the loop gives itself (`VM_TURN_SOFT_DEADLINE_MS`), because a
 * loop that stops writes its checkpoint — where a command killed by the
 * plateforme ne laisse rien.
 *
 * EVERYTHING LIVES OUTSIDE THE DEPOSIT. The harness and the model now share the
 * same disc: without that, the `git add -A` at the end of the turn would take the bundle AND
 * the job — therefore the complete history of the conversation — in a commit to the repository
 * of the user, then in his pull request.
 */

/**
 * WHERE THE BUNDLE READS, AND WHY MORE HERE (MIN-293).
 *
 * The stored reading and its error message lived in this file, which
 * was the only reader. There is a second one since the machine of
 * the user downloads it, and he needs one more thing: THE FINGERPRINT.
 * The two are therefore collected in [harness-bundle.ts](harness-bundle.ts) —
 * a single read, a single cache, a single message when `npm run build:agent-vm`
 * did not turn. Two copies would have ended up serving two different bundles to
 * microVM and Mac, which is exactly the kind of gap you don't see
 * qu'en production.
 */

/**
 * Write the harness in the microVM and run the trick. Returns the identifier of the
 * command, to persist on the line of the run: it is he, and he alone, who
 * will allow the watchdog to see that the process is dead — an observation,
 * not a presumption after twenty minutes of silence.
 *
 * RISE if any of the three actions fail. The caller treats this as an error
 * boot: the session remains resumeable, with the error visible. A run that we
 * would think it was launched when nothing is working would be much worse — it would remain
 * `running` until someone notices.
 */
export async function startVmLoop(
  sandbox: AgentSandbox,
  /**
   * The job WITHOUT `bootstrapMs`: this field belongs to this function, and to it
   * alone. The caller can therefore neither forget it nor invent one - it's here
   * that we know how long the initiation lasted, because this is where it ends.
   */
  job: Omit<VmJob, "bootstrapMs">,
  /**
   * When the function started working on this round (`callStart`). Used to
   * measure the boot, which the loop will add to its own wall-clock: the
   * microVM was already running when we woke it up (see `VmJob.bootstrapMs`).
   */
  callStartMs: number,
): Promise<string> {
  /**
   * THE LAYOUT IS CHECKED FIRST, even before reading the bundle (MIN-354). THE
   * harness also refuses it (`parseVmJob`), but only once the microVM
   * woken up and the repository cloned: saying it here causes the boot to fail — somehow
   * something that the function logs and from which the session resumes — rather
   * just a trick thrown for nothing. And `repoDir` is the security root of
   * writing safeguards: it is controlled where it is written.
   */
  assertUsableLayout(job.layout);

  /**
   * THE PATHS COME FROM THE JOB, and it is he who carries them because it is he
   * that the harness will read. Three writes and one launch in the same place: if the
   * layout changes, nothing here can get out of sync with what the harness believes.
   */
  const { harnessDir } = job.layout;
  const bundlePath = vmBundlePath(job.layout);
  const jobPath = vmJobPath(job.layout);

  // The reading/memorization of the bundle lives in the function, the opening of the
  // directory lives in the microVM: these two jobs are independent. THE
  // serialize added an entire sandbox round trip before the first line
  // of the harness, especially visible on the cloud startup.
  const [bundle] = await Promise.all([
    harnessBundleSource(),
    sandbox.mkDir(harnessDir).catch(() => {}),
  ]);
  await sandbox.writeFiles([{ path: bundlePath, content: bundle }]);

  /**
   * TWO SCRIPTURES AND NOT ONE, and that is the price of measure. The job must cover
   * the duration of the boot, so it can only be serialized AFTER what the
   * compose — waking up the microVM, the clone, and the 280 KB bundle
   * above. A single `writeFiles` would require freezing the number before its most
   * grosse part.
   *
   * The additional round trip costs ~200 ms on a boot which is counted in
   * seconds (~22 s cold). What remains beyond measure — this writing
   * and the launch — is counted in hundreds of milliseconds, and we
   * UNDER-billing: this is the common sense of error.
   */
  const withBootstrap: VmJob = { ...job, bootstrapMs: Date.now() - callStartMs };
  // The job carries the history of the conversation: it is the larger of the two,
  // and it is for him that `harnessDir` is out of the repository.
  await sandbox.writeFiles([{ path: jobPath, content: JSON.stringify(withBootstrap) }]);

  const command = await sandbox.runCommand({
    cmd: "node",
    // The path to the job in ARGUMENT: it's the only thing that the harness cannot
    // not learn from the job itself (see `vmJobPath`).
    args: [bundlePath, jobPath],
    cwd: harnessDir,
    detached: true,
  });
  return command.cmdId;
}
