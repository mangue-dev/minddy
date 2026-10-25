import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { app } from "electron";

import {
  localRuntimeProcessSpec,
  localRuntimeStopSpec,
} from "@/lib/desktop/local-runtime-platform";
import { createLocalRuntimeLifecycle } from "@/lib/desktop/local-runtime-lifecycle";
import { toolchainPathPrefix } from "./local-toolchain";
import { LOCAL_INSTANCE_ORIGIN } from "@/lib/desktop/local-account";

export const LOCAL_SELF_HOST_ORIGIN = LOCAL_INSTANCE_ORIGIN;
const LOCAL_RUNTIME_FILE = "local-runtime.json";

function runtimeFile(): string {
  return path.join(app.getPath("userData"), LOCAL_RUNTIME_FILE);
}

/** Accepts only a minddy clone that exposes the supported local launcher. */
export function validateLocalRuntimeRoot(root: string): string {
  const normalized = path.resolve(root);
  let packageJson: { scripts?: Record<string, unknown> };
  try {
    packageJson = JSON.parse(readFileSync(path.join(normalized, "package.json"), "utf8"));
  } catch {
    throw new Error("Choose the minddy folder created during local installation.");
  }
  if (packageJson.scripts?.["self-host:local"] !== "node scripts/self-hosting-local.mjs") {
    throw new Error("This folder does not contain the supported minddy local launcher.");
  }
  return normalized;
}

export function readLocalRuntimeRoot(): string | null {
  try {
    const raw: unknown = JSON.parse(readFileSync(runtimeFile(), "utf8"));
    if (typeof raw !== "object" || raw === null || typeof (raw as { root?: unknown }).root !== "string") return null;
    return validateLocalRuntimeRoot((raw as { root: string }).root);
  } catch {
    return null;
  }
}

export function writeLocalRuntimeRoot(root: string): string {
  const normalized = validateLocalRuntimeRoot(root);
  writeFileSync(runtimeFile(), `${JSON.stringify({ root: normalized }, null, 2)}\n`, "utf8");
  return normalized;
}

async function isHealthy(signal: AbortSignal): Promise<boolean> {
  try {
    return (await fetch(`${LOCAL_SELF_HOST_ORIGIN}/api/health`, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(5_000)]),
    })).ok;
  } catch {
    return false;
  }
}

/** Starts Supabase and minddy together, then resolves when the app is ready. */
export function startLocalRuntime(root: string): Promise<void> {
  return lifecycle.start(root);
}

function stopProcess(runtime: ChildProcess): void {
  if (runtime.exitCode === null && runtime.signalCode === null) {
    const spec = runtime.pid ? localRuntimeStopSpec(process.platform, runtime.pid) : null;
    if (spec) {
      // `cmd.exe` is only the launcher. Terminate its complete process tree so
      // pnpm, Supabase, and the local Next.js server do not survive app exit.
      spawn(spec.command, spec.args, {
        stdio: "ignore",
        windowsHide: spec.windowsHide,
      }).on("error", () => { runtime.kill("SIGTERM"); });
    } else {
      runtime.kill("SIGTERM");
    }
  }
}

const lifecycle = createLocalRuntimeLifecycle({
  healthy: isHealthy,
  spawn: (root: string) => {
    const validatedRoot = validateLocalRuntimeRoot(root);
    const spec = localRuntimeProcessSpec(process.platform, process.env.SHELL, toolchainPathPrefix());
    const env = { ...process.env };
    if (spec.pathPrefix) {
      const key = Object.keys(env).find((name) => name.toUpperCase() === "PATH") ?? "PATH";
      env[key] = `${spec.pathPrefix};${env[key] ?? ""}`;
    }
    return spawn(spec.command, spec.args, { cwd: validatedRoot, env, stdio: "ignore", windowsHide: spec.windowsHide });
  },
  stop: stopProcess,
});

/** Whether the launcher this app started for that folder is still running. */
export function ownsLocalRuntime(root: string): boolean {
  return lifecycle.ownsLiveRuntime(validateLocalRuntimeRoot(root));
}

/** Lets the launcher stop both the web process and its local Supabase backend. */
export function stopLocalRuntime(): void {
  lifecycle.stop();
}
