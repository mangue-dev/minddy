import "server-only";

import { resolveAgentExecutionBackend } from "@/lib/capabilities";
import { AGENT_SANDBOX_RUNTIME_ENV } from "./sandbox-resources";

import { harnessBundleSource } from "./harness-bundle";
import { assertUsableLayout, cloudLayout, type HarnessLayout } from "./harness-layout";
import { vmBundlePath, vmJobPath, type VmJob } from "./vm/protocol";
import type { NativeHarness } from "@/lib/native-agent-prototype";
import type { AgentSandbox } from "./sandbox";

/** Prepare the pinned CLI while Git clones the independent repository directory. */
export async function prepareFreshSandbox(
  sandbox: AgentSandbox,
  engine: NativeHarness | null,
  clone: () => Promise<void>,
): Promise<void> {
  if (!engine) { await clone(); return; }
  const layout = cloudLayout();
  const prepare = async () => {
    await writeHarnessBundle(sandbox, layout);
    const command = await sandbox.runCommand({
      cmd: "node", args: [vmBundlePath(layout), "--prepare-native-cli", engine],
      cwd: layout.harnessDir, timeoutMs: 180_000,
      ...(resolveAgentExecutionBackend(process.env) === "vercel"
        ? { env: AGENT_SANDBOX_RUNTIME_ENV } : {}),
    });
    if (command.exitCode !== 0) throw new Error("Native CLI bootstrap failed");
  };
  // Join both operations before allocation cleanup can retire the sandbox.
  const results = await Promise.allSettled([clone(), prepare()]);
  for (const result of results) if (result.status === "rejected") throw result.reason;
}

async function writeHarnessBundle(sandbox: AgentSandbox, layout: HarnessLayout): Promise<void> {
  const [bundle] = await Promise.all([
    harnessBundleSource(), sandbox.mkDir(layout.harnessDir).catch(() => {}),
  ]);
  await sandbox.writeFiles([{ path: vmBundlePath(layout), content: bundle }]);
}

/**
 * Launch the detached worker outside the checkout. Its job records the elapsed
 * bootstrap time, including sandbox creation and repository/CLI preparation.
 * No command timeout applies: the worker owns its deadline and checkpoint.
 */
export async function startVmLoop(
  sandbox: AgentSandbox,
  job: Omit<VmJob, "bootstrapMs">,
  callStartMs: number,
): Promise<string> {
  assertUsableLayout(job.layout);
  const { harnessDir } = job.layout;
  const bundlePath = vmBundlePath(job.layout);
  const jobPath = vmJobPath(job.layout);
  await writeHarnessBundle(sandbox, job.layout);

  // Measure after writing the bundle; the job contains private conversation data.
  const withBootstrap: VmJob = { ...job, bootstrapMs: Date.now() - callStartMs };
  await sandbox.writeFiles([{ path: jobPath, content: JSON.stringify(withBootstrap) }]);

  const routingHints =
    withBootstrap.appOrigin && withBootstrap.controlToken
      ? [withBootstrap.appOrigin, withBootstrap.controlToken]
      : [];
  const command = await sandbox.runCommand({
    cmd: "node",
    // Routing hints allow failure reporting if the one-shot job becomes unreadable.
    args: [bundlePath, jobPath, ...routingHints],
    cwd: harnessDir,
    // Apply the profile on every turn, including a resumed persistent sandbox.
    ...(resolveAgentExecutionBackend(process.env) === "vercel"
      ? { env: AGENT_SANDBOX_RUNTIME_ENV }
      : {}),
    detached: true,
  });
  return command.cmdId;
}
