import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir, open, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { RepoHost, ShellOptions, ShellResult } from "../repo-host";
import type { VmJob } from "./protocol";
import { CODEX_CAPABILITY_DROP_ARGS } from "./native-prototype/controller";

const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
export type KernelSpawn = (command: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv }) => ChildProcessWithoutNullStreams;
export interface NativeProcess {
  readonly pid: number;
  readonly output: string;
  readonly outputBytes: number;
  readonly exitCode: number | null;
  done: Promise<ShellResult>;
  stop(): Promise<void>;
}
export interface IsolatedNativeHost extends RepoHost {
  verifyIsolation(): Promise<void>;
  startProcess(executable: string, args: string[], opts?: ShellOptions): NativeProcess;
  close(): Promise<void>;
}

/** Repository subprocesses receive no native, control-plane or ambient credentials. */
export function nativeToolEnvironment(home: string, temp: string, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { NODE_ENV: "production", PATH: `${dirname(process.execPath)}:${process.env.PATH ?? "/usr/bin:/bin"}`, HOME: home, TMPDIR: temp, LANG: "C.UTF-8", CI: "1", TERM: "dumb" };
  // These values configure the existing credential-free GitHub Unix relay.
  if (process.env.GH_TOKEN === "minddy-placeholder") for (const key of ["GH_TOKEN", "GH_CONFIG_DIR", "GH_HOST", "GH_REPO", "GH_PROMPT_DISABLED", "GH_NO_UPDATE_NOTIFIER"]) if (process.env[key]) env[key] = process.env[key];
  for (const [key, value] of Object.entries(extra)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || /TOKEN|SECRET|KEY|AUTH|^CODEX|^CLAUDE|^MINDDY|^VERCEL|^SUPABASE/i.test(key)) throw new Error("Native repository environment refuses credential variables");
    env[key] = value;
  }
  return env;
}

export function nativeKernelArguments(job: VmJob, executable: string, args: string[], writable = job.writesToRepo): string[] {
  if (!job.nativeAgent) throw new Error("Native job context is required");
  const filesystem: Record<string, string> = { ":root": "read", [job.layout.repoDir]: writable ? "write" : "read", [job.layout.toolOutputDir]: "write", [job.layout.typecheckDir]: "write", [join(job.layout.root, "native-tool-home")]: "write", [join(job.layout.root, "native-tool-tmp")]: "write", [job.nativeAgent.privateRoot]: "deny", "/proc": "deny", "/sys": "deny" };
  // Codex protects Git metadata inside writable roots unless explicitly granted.
  // Hosted native workers use a fresh clone, whose delivery must stage and commit.
  if (writable) filesystem[join(job.layout.repoDir, ".git")] = "write";
  const rules = Object.entries(filesystem).map(([path, access]) => `${JSON.stringify(path)}=${JSON.stringify(access)}`).join(",");
  return ["sandbox", "-c", 'default_permissions="minddy_native_tools"', "-c", `permissions.minddy_native_tools.filesystem={${rules}}`, "-c", "permissions.minddy_native_tools.network.enabled=true", "-c", `projects.${JSON.stringify(job.layout.repoDir)}.trust_level="untrusted"`, "--", executable, ...args];
}

const FILE_HELPER = `const fs=require('node:fs');const input=JSON.parse(process.argv[1]);try{if(input.operation==='read'){const file=fs.openSync(input.path,'r');try{if(fs.fstatSync(file).size>8388608)process.exit(44);process.stdout.write(fs.readFileSync(file,'utf8'));}finally{fs.closeSync(file)}}else if(input.operation==='write'){fs.writeFileSync(input.path,input.content)}else if(input.operation==='mkdir'){fs.mkdirSync(input.path,{recursive:true})}else process.exit(45)}catch(error){process.exit(error.code==='ENOENT'?43:46)}`;

export function createIsolatedNativeHost(job: VmJob, options: { spawn?: KernelSpawn } = {}): IsolatedNativeHost {
  if (!job.nativeAgent || process.platform !== "linux" && !options.spawn) throw new Error("Native workers require Linux kernel isolation");
  const launch = options.spawn ?? ((command, args, opts) => spawn(command, args, { ...opts, detached: true, stdio: "pipe" }));
  const home = join(job.layout.root, "native-tool-home");
  const temp = join(job.layout.root, "native-tool-tmp");
  const active = new Set<NativeProcess>();
  let verified = false;

  const start = (executable: string, args: string[], opts: ShellOptions = {}, probing = false): NativeProcess => {
    if (!verified && !probing) throw new Error("Native repository kernel isolation has not been verified");
    if (opts.signal?.aborted) return { pid: 0, output: "", outputBytes: 0, exitCode: 130, done: Promise.resolve({ exitCode: 130, stdout: "", stderr: "aborted" }), stop: async () => {} };
    const assignments = Object.entries(opts.env ?? {}).map(([key, value]) => {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new Error("Invalid repository environment variable");
      return `${key}=${value}`;
    });
    // User-controlled loader variables are applied only inside the kernel sandbox.
    const target = assignments.length ? "/usr/bin/env" : executable;
    const targetArgs = assignments.length ? [...assignments, executable, ...args] : args;
    const child = launch("setpriv", [...CODEX_CAPABILITY_DROP_ARGS, "codex", ...nativeKernelArguments(job, target, targetArgs)], { cwd: opts.cwd ?? job.layout.repoDir, env: nativeToolEnvironment(home, temp) });
    let combined = ""; let bytes = 0; let stdout = ""; let stderr = ""; let exitCode: number | null = null;
    const capped = (current: string, chunk: string) => { const value = current + chunk; return value.length <= MAX_OUTPUT_BYTES ? value : `${value.slice(0, MAX_OUTPUT_BYTES / 2)}\n[Output exceeded the process buffer; the middle was omitted.]\n${value.slice(-MAX_OUTPUT_BYTES / 2)}`; };
    const collect = (chunk: Buffer, error: boolean) => { bytes += chunk.length; combined = Buffer.concat([Buffer.from(combined), chunk]).subarray(-MAX_OUTPUT_BYTES).toString("utf8"); if (error) stderr = capped(stderr, chunk.toString("utf8")); else stdout = capped(stdout, chunk.toString("utf8")); };
    child.stdout.on("data", (chunk: Buffer) => collect(chunk, false)); child.stderr.on("data", (chunk: Buffer) => collect(chunk, true));
    const kill = (signal: NodeJS.Signals) => { try { if (child.pid) process.kill(-child.pid, signal); } catch { child.kill(signal); } };
    let timer: ReturnType<typeof setTimeout> | undefined;
    let finish!: (result: ShellResult) => void;
    const done = new Promise<ShellResult>((resolve) => { finish = resolve; });
    let settled = false;
    const complete = (code: number) => { if (settled) return; settled = true; exitCode = code; if (timer) clearTimeout(timer); opts.signal?.removeEventListener("abort", abort); active.delete(handle); finish({ exitCode: code, stdout, stderr }); };
    const stop = async () => { if (settled) return; kill("SIGTERM"); const forced = setTimeout(() => kill("SIGKILL"), 1000); try { await done; } finally { clearTimeout(forced); } };
    const abort = () => { void stop(); };
    const handle: NativeProcess = { get pid() { return child.pid ?? 0; }, get output() { return combined; }, get outputBytes() { return bytes; }, get exitCode() { return exitCode; }, done, stop };
    active.add(handle);
    child.once("error", () => complete(127)); child.once("close", (code) => complete(code ?? 130));
    if (opts.timeoutMs) timer = setTimeout(() => { void stop(); }, opts.timeoutMs);
    opts.signal?.addEventListener("abort", abort, { once: true });
    if (opts.signal?.aborted) void stop();
    child.stdin.end();
    return handle;
  };

  const file = async (operation: string, path: string, content?: string) => {
    const result = await start(process.execPath, ["-e", FILE_HELPER, JSON.stringify({ operation, path, content })], { timeoutMs: 30_000 }).done;
    if (result.exitCode === 43 && operation === "read") return null;
    if (result.exitCode !== 0) throw new Error("Native isolated filesystem operation failed");
    return result.stdout;
  };

  return {
    layout: job.layout, processIsolation: "sandbox",
    exec: (command, opts) => start("/bin/sh", ["-c", command], opts).done,
    readFile: (path) => file("read", path),
    writeFile: async (path, content) => { await file("write", path, content); },
    mkdir: async (path) => { await file("mkdir", path); },
    startProcess: (executable, args, opts) => start(executable, args, opts),
    close: async () => { await Promise.all([...active].map((process) => process.stop())); },
    async verifyIsolation() {
      await Promise.all([home, temp, job.layout.toolOutputDir, job.layout.typecheckDir].map((path) => mkdir(path, { recursive: true, mode: 0o700 })));
      const dummy = join(job.nativeAgent!.privateRoot, `kernel-probe-${randomUUID()}`);
      await writeFile(dummy, "synthetic native-worker secret sentinel", { flag: "wx", mode: 0o600 });
      const descriptor = await open(dummy, "r");
      const probe = 'const fs=require("node:fs");for(const path of process.argv.slice(1)){try{fs.readFileSync(path);process.exit(41)}catch(error){if(!(path.startsWith("/proc/")?["EACCES","EPERM","ENOENT"]:["EACCES","EPERM"]).includes(error.code))process.exit(42)}}';
      try {
        const result = await start(process.execPath, ["-e", probe, dummy, `/proc/${process.pid}/environ`, `/proc/${process.pid}/fd/${descriptor.fd}`, `/proc/${process.pid}/mem`], { timeoutMs: 20_000 }, true).done;
        if (result.exitCode !== 0) throw new Error("Native repository kernel isolation probe failed");
        verified = true;
      } finally { await descriptor.close(); await rm(dummy, { force: true }); }
    },
  };
}
