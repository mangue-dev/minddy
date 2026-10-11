import { spawn } from "node:child_process";
import { access, mkdir, readFile, rm, symlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { NativeHarness } from "@/lib/native-agent-prototype";

export const NATIVE_WORKER_VERSIONS = { codex: "0.162.1", claude_code: "2.1.296" } as const;

async function command(program: string, args: string[], env: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { env, stdio: ["ignore", "pipe", "ignore"], detached: true });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => { if (output.length < 4096) output += chunk.toString("utf8").slice(0, 4096 - output.length); });
    const timeout = setTimeout(() => { try { if (child.pid) process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); } }, 120_000);
    child.once("error", () => { clearTimeout(timeout); reject(new Error("Native CLI bootstrap failed")); });
    child.once("close", (code) => { clearTimeout(timeout); if (code === 0) resolve(output); else reject(new Error("Native CLI bootstrap failed")); });
  });
}

/** Only pinned published packages install, with package lifecycle scripts disabled. */
export async function installNativeWorkerCli(engine: NativeHarness, root: string): Promise<string> {
  if (process.platform !== "linux" || !["x64", "arm64"].includes(process.arch)) throw new Error("Native CLI workers require supported Linux architecture");
  await mkdir(root, { recursive: true, mode: 0o700 });
  const home = join(root, "install-home"); await mkdir(home, { recursive: true, mode: 0o700 });
  const env: NodeJS.ProcessEnv = { NODE_ENV: "production", PATH: `${dirname(process.execPath)}:${process.env.PATH ?? "/usr/bin:/bin"}`, HOME: home, LANG: "C.UTF-8", CI: "1" };
  const packages = ["@openai/codex@0.162.1", ...(engine === "claude_code" ? ["@anthropic-ai/claude-code@2.1.296"] : [])];
  await command("npm", ["install", "--prefix", root, "--ignore-scripts", "--no-audit", "--no-fund", ...packages], env);
  const bins = join(root, "node_modules", ".bin");
  for (const harness of engine === "codex" ? ["codex"] as const : ["codex", "claude_code"] as const) {
    const packageDir = harness === "codex" ? "@openai/codex" : "@anthropic-ai/claude-code";
    const manifest = JSON.parse(await readFile(join(root, "node_modules", packageDir, "package.json"), "utf8"));
    if (manifest.version !== NATIVE_WORKER_VERSIONS[harness]) throw new Error("Native CLI version mismatch");
    if (harness === "claude_code") {
      const target = `../@anthropic-ai/claude-code-linux-${process.arch}/claude`;
      await access(join(bins, target)); await rm(join(bins, "claude"), { force: true }); await symlink(target, join(bins, "claude"));
    }
    const version = await command(join(bins, harness === "codex" ? "codex" : "claude"), ["--version"], env);
    if (!version.split(/\s+/).includes(NATIVE_WORKER_VERSIONS[harness])) throw new Error("Native CLI binary version mismatch");
  }
  return bins;
}
