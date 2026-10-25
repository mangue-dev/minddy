import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { app } from "electron";

import {
  DOCKER_DAEMON_PROBE,
  installerCommand,
  lastOutputLine,
  installMessage,
  loginShellPathProbe,
  type InstallMessage,
  type InstallMessageCode,
  type ProbeOutput,
} from "@/lib/desktop/local-installer";
import { localRuntimeStopSpec, posixQuote } from "@/lib/desktop/local-runtime-platform";
import {
  DOCKER_CODE_REQUIREMENT,
  DOCKER_LINUX_SCRIPT_URL,
  MANAGED_PNPM_VERSION,
  MANAGED_SUPABASE_CLI_VERSION,
  MINGIT_RELEASE_API,
  NODE_SHASUMS_URL,
  dockerDesktopUrl,
  downloadPercent,
  linuxPrivilegedScript,
  minGitAsset,
  nodeArchiveFromShasums,
  nodeArchiveUrl,
  signedByDocker,
  toolchainArch,
  toolchainPathEntries,
  type ToolchainAction,
} from "@/lib/desktop/local-toolchain";

/** The app-owned folder of managed tools (see `lib/desktop/local-toolchain.ts`). */
function toolchainRoot(): string {
  return path.join(app.getPath("userData"), "toolchain");
}

/** The managed and Docker Desktop folders that exist, to put first on PATH. */
export function toolchainPathPrefix(): string[] {
  return toolchainPathEntries(process.platform, toolchainRoot(), os.homedir()).filter((entry) => existsSync(entry));
}

let loginPath: Promise<string | undefined> | null = null;

/** The login shell's PATH, asked once: a Dock-launched app does not inherit it. */
function resolveLoginPath(): Promise<string | undefined> {
  loginPath ??= new Promise((resolve) => {
    const probe = loginShellPathProbe(process.platform, process.env.SHELL);
    if (!probe) {
      resolve(process.env.PATH ?? process.env.Path);
      return;
    }
    let output = "";
    const child = spawn(probe.command, probe.args, {
      stdio: ["ignore", "pipe", "ignore"],
      signal: AbortSignal.timeout(10_000),
    });
    child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.once("error", () => resolve(process.env.PATH));
    child.once("close", (code) => resolve(code === 0 && output.trim() ? output.trim() : process.env.PATH));
  });
  return loginPath;
}

/** The environment of every installer command: managed tools first on PATH. */
async function toolEnvironment(): Promise<NodeJS.ProcessEnv> {
  const base = await resolveLoginPath();
  const env: NodeJS.ProcessEnv = { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: "0", FORCE_COLOR: "0" };
  // `cmd.exe` would otherwise run a `git.exe` planted in the working folder
  // (the parent of the chosen install folder) before the one on PATH.
  if (process.platform === "win32") env.NoDefaultCurrentDirectoryInExePath = "1";
  // Windows names it `Path`; a second `PATH` key would leave the child guessing.
  const key = Object.keys(env).find((name) => name.toUpperCase() === "PATH") ?? "PATH";
  env[key] = [...toolchainPathPrefix(), base].filter(Boolean).join(path.delimiter);
  return env;
}

export interface RunResult extends ProbeOutput {
  output: string;
}

/** Runs one tool without a shell (POSIX) and collects its output tail. */
export async function runTool(
  argv: readonly string[],
  options: {
    cwd?: string;
    timeoutMs?: number;
    signal?: AbortSignal;
    onOutput?: (line: string) => void;
  } = {},
): Promise<RunResult> {
  // A cancel that landed between two steps starts nothing.
  if (options.signal?.aborted) return { ok: false, stdout: "", output: "" };
  const env = await toolEnvironment();
  const spec = installerCommand(process.platform, argv);
  return new Promise((resolve) => {
    let stdout = "";
    let output = "";
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      resolve({ ok, stdout, output });
    };
    const child = spawn(spec.command, spec.args, {
      cwd: options.cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      windowsVerbatimArguments: spec.windowsVerbatimArguments,
      // Its own process group on POSIX, so a cancel stops what it started too
      // (`supabase start`, `next build` under the launcher), not just itself.
      detached: process.platform !== "win32",
    });
    const kill = () => {
      const stop = child.pid ? localRuntimeStopSpec(process.platform, child.pid) : null;
      if (stop) {
        spawn(stop.command, stop.args, { stdio: "ignore", windowsHide: true }).on("error", () => child.kill());
        return;
      }
      try {
        if (child.pid) process.kill(-child.pid, "SIGTERM");
        else child.kill("SIGTERM");
      } catch {
        child.kill("SIGTERM");
      }
    };
    const abort = () => { kill(); finish(false); };
    const timer = options.timeoutMs ? setTimeout(abort, options.timeoutMs) : undefined;
    options.signal?.addEventListener("abort", abort, { once: true });
    const collect = (chunk: Buffer, isStdout: boolean) => {
      const text = chunk.toString();
      if (isStdout) stdout += text;
      // Only the tail is ever shown; keep memory bounded on long builds.
      output = (output + text).slice(-8_000);
      const line = lastOutputLine(text);
      if (line) options.onOutput?.(line);
    };
    child.stdout.on("data", (chunk: Buffer) => collect(chunk, true));
    child.stderr.on("data", (chunk: Buffer) => collect(chunk, false));
    child.once("error", () => finish(false));
    child.once("close", (code) => finish(code === 0));
  });
}

/**
 * macOS ships `/usr/bin/git` as a stub that opens the command line tools
 * dialog when run. Probing it would pop that dialog during a mere check, so
 * on macOS Git counts as missing when the stub is all there is.
 */
export async function macGitStubOnly(): Promise<boolean> {
  if (process.platform !== "darwin") return false;
  if ((await runTool(["xcode-select", "-p"], { timeoutMs: 10_000 })).ok) return false;
  const env = await toolEnvironment();
  const dirs = (env.PATH ?? "").split(path.delimiter).filter(Boolean);
  const found = dirs.map((dir) => path.join(dir, "git")).find((candidate) => existsSync(candidate));
  return !found || found === "/usr/bin/git";
}

/** A failure the page can show: a catalog code, or the command's own line. */
export class InstallFailure extends Error {
  constructor(readonly detail: InstallMessage) {
    super("code" in detail ? detail.code : detail.text);
  }
}

const fail = (code: InstallMessageCode, values?: Record<string, string>) => new InstallFailure(installMessage(code, values));

async function download(
  url: string,
  file: string,
  signal: AbortSignal,
  onProgress: (percent: number) => void,
): Promise<string> {
  const response = await fetch(url, {
    signal,
    headers: { "User-Agent": `minddy-desktop/${app.getVersion()}` },
  });
  if (!response.ok || !response.body) throw new InstallFailure({ text: `${new URL(url).host}: HTTP ${response.status}` });
  const total = Number(response.headers.get("content-length")) || null;
  const hash = createHash("sha256");
  let received = 0;
  let last = -1;
  const meter = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      hash.update(chunk);
      received += chunk.length;
      const percent = downloadPercent(received, total);
      if (percent !== null && percent !== last) {
        last = percent;
        onProgress(percent);
      }
      done(null, chunk);
    },
  });
  await pipeline(
    Readable.fromWeb(response.body as import("node:stream/web").ReadableStream<Uint8Array>),
    meter,
    createWriteStream(file),
    { signal },
  );
  return hash.digest("hex");
}

async function fetchText(url: string, signal: AbortSignal, accept?: string): Promise<string> {
  const response = await fetch(url, {
    signal,
    headers: { "User-Agent": `minddy-desktop/${app.getVersion()}`, ...(accept ? { Accept: accept } : {}) },
  });
  if (!response.ok) throw new InstallFailure({ text: `${new URL(url).host}: HTTP ${response.status}` });
  return response.text();
}

interface Context {
  signal: AbortSignal;
  temp: string;
  /** Live detail for the running step. */
  detail: (message: InstallMessage) => void;
  /** Linux: the privileged script already ran for this attempt. */
  linuxDone: Set<ToolchainAction>;
  plan: readonly ToolchainAction[];
}

async function must(result: Promise<RunResult>, fallback: InstallMessageCode): Promise<RunResult> {
  const settled = await result;
  if (!settled.ok) {
    const line = lastOutputLine(settled.output);
    throw line ? new InstallFailure({ text: line }) : fail(fallback);
  }
  return settled;
}

const outputLine = (ctx: Context) => (line: string) => ctx.detail({ text: line });

async function downloadVerified(ctx: Context, url: string, file: string, sha256?: string): Promise<void> {
  const digest = await download(url, file, ctx.signal, (percent) =>
    ctx.detail(installMessage("downloadProgress", { percent: String(percent) })),
  );
  if (sha256 && digest !== sha256) throw fail("verifyFailed");
}

/** Extracts an archive with the system `tar` (bsdtar reads zip on Windows). */
async function extractInto(ctx: Context, archive: string, target: string): Promise<string> {
  const staging = mkdtempSync(path.join(ctx.temp, "extract-"));
  const flags = archive.endsWith(".zip") || process.platform === "win32" ? "-xf" : "-xzf";
  await must(runTool(["tar", flags, archive, "-C", staging], { signal: ctx.signal }), "verifyFailed");
  rmSync(target, { recursive: true, force: true });
  mkdirSync(path.dirname(target), { recursive: true });
  const entries = readdirSync(staging);
  // Node.js archives hold one top folder; MinGit's zip holds the tree itself.
  renameSync(entries.length === 1 ? path.join(staging, entries[0]) : staging, target);
  return target;
}

async function installNode(ctx: Context): Promise<void> {
  const shasums = await fetchText(NODE_SHASUMS_URL, ctx.signal);
  const archive = nodeArchiveFromShasums(shasums, process.platform, toolchainArch(process.arch));
  if (!archive) throw fail("verifyFailed");
  // A fixed local name: nothing read from the network reaches a command line.
  const file = path.join(ctx.temp, process.platform === "win32" ? "node.zip" : "node.tar.gz");
  await downloadVerified(ctx, nodeArchiveUrl(archive.file), file, archive.sha256);
  await extractInto(ctx, file, path.join(toolchainRoot(), "node"));
}

async function installWithNpm(ctx: Context, args: string[]): Promise<void> {
  await must(
    runTool(["npm", ...args, "--no-audit", "--no-fund", "--loglevel", "error"], { signal: ctx.signal, onOutput: outputLine(ctx) }),
    "localStartFailed",
  );
}

async function installWindowsGit(ctx: Context): Promise<void> {
  const release: unknown = JSON.parse(await fetchText(MINGIT_RELEASE_API, ctx.signal, "application/vnd.github+json"));
  const asset = minGitAsset(release, toolchainArch(process.arch));
  if (!asset) throw fail("verifyFailed");
  const file = path.join(ctx.temp, "mingit.zip");
  await downloadVerified(ctx, asset.url, file, asset.sha256);
  await extractInto(ctx, file, path.join(toolchainRoot(), "git"));
}

async function waitFor(ctx: Context, check: () => Promise<boolean>, timeoutMs: number, message: InstallMessageCode): Promise<boolean> {
  ctx.detail(installMessage(message));
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (ctx.signal.aborted) return false;
    if (await check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  return false;
}

async function installMacGit(ctx: Context): Promise<void> {
  // Opens Apple's own dialog; the person confirms, macOS installs.
  await runTool(["xcode-select", "--install"], { signal: ctx.signal });
  const installed = await waitFor(
    ctx,
    async () => !(await macGitStubOnly()) && (await runTool(["git", "--version"], { timeoutMs: 10_000 })).ok,
    45 * 60_000,
    "gitWaiting",
  );
  if (!installed) throw fail("gitWaiting");
}

async function dockerResponds(): Promise<RunResult> {
  return runTool(DOCKER_DAEMON_PROBE, { timeoutMs: 15_000 });
}

async function waitForDocker(ctx: Context): Promise<void> {
  let denied = false;
  const ready = await waitFor(
    ctx,
    async () => {
      const result = await dockerResponds();
      // On Linux a refused socket will not change before a new sign-in:
      // say so now rather than after twenty minutes.
      denied = process.platform === "linux" && /permission denied/i.test(result.output);
      return result.ok || denied;
    },
    20 * 60_000,
    "dockerWaiting",
  );
  if (denied) throw fail("linuxSessionRestart");
  if (ready) return;
  throw fail("dockerTimeout");
}

function startDockerDesktop(): void {
  if (process.platform === "darwin") {
    spawn("open", ["-a", "Docker"], { stdio: "ignore", detached: true }).on("error", () => {}).unref();
  } else if (process.platform === "win32") {
    spawn("C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe", [], { stdio: "ignore", detached: true })
      .on("error", () => {})
      .unref();
  }
}

async function installMacDocker(ctx: Context): Promise<void> {
  const url = dockerDesktopUrl("darwin", toolchainArch(process.arch))!;
  const dmg = path.join(ctx.temp, "Docker.dmg");
  await downloadVerified(ctx, url, dmg);
  const mount = path.join(ctx.temp, "docker-volume");
  mkdirSync(mount);
  await must(runTool(["hdiutil", "attach", "-nobrowse", "-readonly", "-mountpoint", mount, dmg], { signal: ctx.signal }), "verifyFailed");
  try {
    const bundle = path.join(mount, "Docker.app");
    await must(runTool(["codesign", "--verify", "--deep", "--strict", `-R=${DOCKER_CODE_REQUIREMENT}`, bundle]), "verifyFailed");
    const identity = await runTool(["codesign", "-dv", "--verbose=2", bundle]);
    if (!signedByDocker(identity.output)) throw fail("verifyFailed");
    const copied = await runTool(["ditto", bundle, "/Applications/Docker.app"], { signal: ctx.signal });
    if (!copied.ok) {
      // A standard account cannot write /Applications: macOS asks for an
      // administrator, in its own dialog.
      const command = `ditto ${posixQuote(bundle)} '/Applications/Docker.app'`;
      await must(
        runTool(["osascript", "-e", `do shell script ${JSON.stringify(command)} with administrator privileges`], { signal: ctx.signal }),
        "localStartFailed",
      );
    }
  } finally {
    await runTool(["hdiutil", "detach", mount, "-quiet"]);
  }
  startDockerDesktop();
  await waitForDocker(ctx);
}

async function installWindowsDocker(ctx: Context): Promise<void> {
  const url = dockerDesktopUrl("win32", toolchainArch(process.arch))!;
  const installer = path.join(ctx.temp, "Docker Desktop Installer.exe");
  await downloadVerified(ctx, url, installer);
  const literal = installer.replaceAll("'", "''");
  await must(
    runTool([
      "powershell",
      "-NoProfile",
      "-Command",
      `$s = Get-AuthenticodeSignature -LiteralPath '${literal}'; if ($s.Status -eq 'Valid' -and $s.SignerCertificate.Subject -match '(^|, )CN=Docker Inc(,|$)') { exit 0 } else { exit 1 }`,
    ]),
    "verifyFailed",
  );
  ctx.detail(installMessage("dockerInstallerOpen"));
  // The installer needs elevation: Start-Process asks through UAC, then the
  // installer shows Docker's own license and options.
  await must(
    runTool(
      ["powershell", "-NoProfile", "-Command", `Start-Process -FilePath '${literal}' -ArgumentList 'install' -Verb RunAs -Wait`],
      { signal: ctx.signal },
    ),
    "dockerTimeout",
  );
  startDockerDesktop();
  await waitForDocker(ctx);
}

/** Linux: Git, Docker Engine and its service in one `pkexec` prompt. */
async function linuxPrivileged(ctx: Context): Promise<void> {
  const needs = (action: ToolchainAction) => ctx.plan.includes(action);
  let dockerScript = "";
  if (needs("docker")) {
    dockerScript = path.join(ctx.temp, "get-docker.sh");
    writeFileSync(dockerScript, await fetchText(DOCKER_LINUX_SCRIPT_URL, ctx.signal), { mode: 0o700 });
  }
  const script = path.join(ctx.temp, "minddy-system-tools.sh");
  writeFileSync(
    script,
    linuxPrivilegedScript({
      git: needs("git"),
      docker: needs("docker"),
      startDocker: needs("docker-start"),
      user: os.userInfo().username,
      dockerScript,
    }),
    { mode: 0o700 },
  );
  ctx.detail(installMessage("systemPasswordPrompt"));
  await must(runTool(["pkexec", "sh", script], { signal: ctx.signal, onOutput: outputLine(ctx) }), "linuxManual");
  for (const action of ["git", "docker", "docker-start"] as const) ctx.linuxDone.add(action);
}

async function installAction(action: ToolchainAction, ctx: Context): Promise<void> {
  const root = toolchainRoot();
  if (process.platform === "linux" && (action === "git" || action === "docker" || action === "docker-start")) {
    if (!ctx.linuxDone.has(action)) await linuxPrivileged(ctx);
    if (action !== "git") await waitForDocker(ctx);
    return;
  }
  switch (action) {
    case "node":
      return installNode(ctx);
    case "pnpm":
      return installWithNpm(ctx, ["install", "--global", `pnpm@${MANAGED_PNPM_VERSION}`, "--prefix", path.join(root, "pnpm")]);
    case "supabase":
      return installWithNpm(ctx, ["install", `supabase@${MANAGED_SUPABASE_CLI_VERSION}`, "--prefix", path.join(root, "supabase")]);
    case "git":
      return process.platform === "win32" ? installWindowsGit(ctx) : installMacGit(ctx);
    case "docker":
      return process.platform === "win32" ? installWindowsDocker(ctx) : installMacDocker(ctx);
    case "docker-start":
      startDockerDesktop();
      return waitForDocker(ctx);
  }
}

/**
 * Installs the planned tools in order, reporting each as a step. Throws the
 * message to show on the failed step.
 */
export async function installToolchain(
  plan: readonly ToolchainAction[],
  signal: AbortSignal,
  report: (action: ToolchainAction, state: "running" | "done", detail?: InstallMessage) => void,
): Promise<void> {
  if (plan.length === 0) return;
  mkdirSync(toolchainRoot(), { recursive: true });
  // On the same volume as the toolchain: the extracted folders are moved in
  // with a rename, which fails across volumes (a tmpfs `/tmp` on Linux).
  const temp = mkdtempSync(path.join(toolchainRoot(), ".tmp-"));
  const linuxDone = new Set<ToolchainAction>();
  try {
    for (const action of plan) {
      let last = 0;
      const ctx: Context = {
        signal,
        temp,
        plan,
        linuxDone,
        detail: (message) => {
          // Raw output is throttled (npm prints hundreds of lines a second);
          // what the step waits for always shows.
          const now = Date.now();
          if ("text" in message && now - last < 250) return;
          last = now;
          report(action, "running", message);
        },
      };
      report(action, "running");
      await installAction(action, ctx);
      if (signal.aborted) throw fail("installCanceled");
      report(action, "done");
    }
  } catch (error) {
    if (signal.aborted) throw fail("installCanceled");
    if (error instanceof InstallFailure) throw error;
    throw error instanceof Error ? new InstallFailure({ text: error.message }) : fail("localStartFailed");
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}
