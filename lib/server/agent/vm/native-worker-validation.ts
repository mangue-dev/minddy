import { constants } from "node:fs";
import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { ControlPlaneClient } from "./control-plane-client";
import type { VmJob, VmToolResponse } from "./protocol";
import { runNativeTurn } from "./native-supervisor";

type FixtureInput = { job: VmJob; requiredTool: string; requiredArgs: Record<string, unknown>; marker: string };

/** Private SDK mailbox fixture: no cloud callback, auth output, or model transcript. */
export async function runNativeWorkerValidation(inputPath: string) {
  const input = JSON.parse(await readFile(inputPath, "utf8")) as FixtureInput;
  await rm(inputPath);
  if (!input.job.nativeAgent || input.job.authUrl !== null || input.job.pullRequestDelivery?.required || !/^[A-Z0-9_]{8,80}$/.test(input.marker) || !["read_issue", "read_page"].includes(input.requiredTool)) throw new Error("Invalid native worker validation fixture");
  const root = join(input.job.nativeAgent.privateRoot, "validation");
  await mkdir(root, { mode: 0o700, recursive: true });
  const pending = join(root, "pending.json"); const final = join(root, "result.json");
  let calls = 0; let successfulCalls = 0; let stopped = false;
  let writeObserved = false; let readObserved = false; let commandObserved = false;
  const write = async (path: string, value: unknown) => { const temp = `${path}.${randomUUID()}`; await writeFile(temp, JSON.stringify(value), { flag: "wx", mode: 0o600 }); await rename(temp, path); };
  const cp: ControlPlaneClient = {
    emit: async (type, payload) => { if (type !== "tool_result" || payload.success !== true || typeof payload.preview !== "string") return; if (payload.name === "run_command" && payload.exit_code === 0) commandObserved = true; try { const result = JSON.parse(payload.preview); if (payload.name === "write_file" && result.written === "native_worker_fixture.txt") writeObserved = true; if (payload.name === "read_file" && typeof result.content === "string" && result.content.includes(input.marker)) readObserved = true; } catch { /* Non-JSON domain outputs do not attest to repository execution. */ } }, emitLive: () => {}, emitDiff: () => {}, recordUsage: async () => {}, saveCheckpointQuietly: async () => true, heartbeat: async () => true, appendJournal: async () => {}, pullSteering: async () => [], pushSteering: async () => {}, hasPendingMessages: async () => false, checkInterrupt: async () => stopped, clearInterrupt: async () => {}, budgetRemaining: async () => null, syncPlan: async () => {}, repoAuthUrl: async () => null, llmKey: async () => null, reportTurn: async () => {},
    callTool: async (name, body) => {
      if (name !== input.requiredTool || JSON.stringify(body.args) !== JSON.stringify(input.requiredArgs) || calls++ >= 3) return { success: false, result: { error: "Only the authorized owner fixture tool is available" } };
      const id = randomUUID(); const response = join(root, `${id}.json`);
      await write(pending, { id, name, body });
      const deadline = Date.now() + 45_000;
      while (Date.now() < deadline) {
        try {
          const handle = await open(response, constants.O_RDONLY | constants.O_NOFOLLOW);
          let result: VmToolResponse;
          try { const stat = await handle.stat(); if (stat.size > 100_000) throw new Error("Fixture response too large"); result = JSON.parse(await handle.readFile("utf8")); } finally { await handle.close(); }
          await rm(response); await rm(pending, { force: true });
          if (result.success) successfulCalls++;
          return result;
        } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("Fixture response invalid"); }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      return { success: false, result: { error: "Owner fixture relay timed out" } };
    },
  };
  const file = "native_worker_fixture.txt";
  const command = `node -e 'const fs=require("node:fs");if(fs.readFileSync("${file}","utf8")!=="${input.marker}")process.exit(1);for(const p of ${JSON.stringify([input.job.nativeAgent.privateRoot, "/proc", "/sys"])}){try{fs.readdirSync(p);process.exit(2)}catch(e){if(!["EACCES","EPERM","ENOENT"].includes(e.code))process.exit(3)}}'`;
  const prompt = `Execute this authorized private fixture using only Minddy MCP tools. First call ${input.requiredTool} with exactly ${JSON.stringify(input.requiredArgs)} and require success. Then call write_file with path ${file} and content exactly ${input.marker}; read_file the same file and check the marker. Finally use run_command with exactly this command: ${command}. Require exitCode 0. Do not create or publish a pull request. Finish with exactly ${input.marker}.`;
  try {
    const report = await runNativeTurn(input.job, { prompt, anchorInstructions: "This is an authorized private Minddy native-worker fixture in a disposable repository." }, cp, { turnDeadlineMs: 180_000 });
    const fileMatches = (await readFile(join(input.job.layout.repoDir, file), "utf8").catch(() => "")) === input.marker;
    await write(final, { status: report.status, errorCode: report.errorCode, nativeAuthExportReady: report.nativeAuthExportReady === true, calls, successfulCalls, writeObserved, readObserved, commandObserved, fileMatches, markerMatches: report.reply?.trim() === input.marker, checkpointEngine: report.checkpoint?.native?.engine, checkpointHistoryCount: report.checkpoint?.native?.history.length ?? 0, costUsd: report.costUsd, sandboxMs: report.sandboxMs });
  } finally { stopped = true; await rm(pending, { force: true }); }
}

if (process.argv[2]) void runNativeWorkerValidation(process.argv[2]).catch(() => { console.error("Native worker validation failed"); process.exitCode = 1; });
