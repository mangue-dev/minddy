import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { APIError, Sandbox } from "@vercel/sandbox";
import type { NativeHarness } from "@/lib/native-agent-prototype";
import type { SandboxBilling } from "@/lib/agent-sandbox-config";
import { sandboxBillingFor } from "@/lib/agent-sandbox-config";
import { requireCapability } from "@/lib/server/capabilities";
import type { NativeStatus } from "../vm/native-prototype/controller";
import type { PendingTool } from "../vm/native-prototype/relay";

const ROOT = "/vercel/sandbox/.minddy-native";
const RUNTIME_ROOT = "/vercel/sandbox/.minddy-native-runtime";
const CONTROL_PORT = 8787;
export const NATIVE_ALLOCATION_TIMEOUT_MS = 15 * 60_000;

export type NativeAllocation = {
  readonly name: string;
  readonly billing: SandboxBilling;
  request<T = NativeControllerStatus>(operation: string, body?: unknown): Promise<T>;
  destroy(): Promise<void>;
};

export type NativeControllerStatus = NativeStatus & { pendingTools?: PendingTool[] };

function credentials() {
  const { VERCEL_TOKEN: token, VERCEL_TEAM_ID: teamId, VERCEL_PROJECT_ID: projectId } = process.env;
  return token && teamId && projectId ? { token, teamId, projectId } : {};
}

/** Secret payloads travel through private files, never command stdout or argv. */
const CONTROL_HELPER = `
const fs = require('node:fs/promises');
(async () => {
  const [requestFile, responseFile] = process.argv.slice(2);
  const { operation, body, token } = JSON.parse(await fs.readFile(requestFile, 'utf8'));
  const response = await fetch('http://127.0.0.1:${CONTROL_PORT}' + operation, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(25000)
  });
  if (!response.ok) throw new Error('Private controller rejected request');
  const data = await response.text();
  if (Buffer.byteLength(data) > 131072) throw new Error('Private response too large');
  await fs.writeFile(responseFile, data, { mode: 0o600 });
})().catch(() => { process.exitCode = 1; });
`;

function wrapper(sandbox: Sandbox, token: string): NativeAllocation {
  const session = sandbox.currentSession();
  const billing = sandboxBillingFor({ region: session.region, vcpus: session.vcpus, memoryMb: session.memory });
  return {
    name: sandbox.name,
    billing,
    async request<T>(operation: string, body?: unknown): Promise<T> {
      if (!/^\/(status|login\/start|login\/code|cancel|auth\/check|profile\/import|profile\/export|smoke|tool-result|isolation\/check)$/.test(operation)) {
        throw new Error("Invalid private controller operation");
      }
      const id = randomUUID();
      const input = `${ROOT}/transport/${id}.request.json`;
      const output = `${ROOT}/transport/${id}.response.json`;
      try {
        await sandbox.writeFiles([{ path: input, content: Buffer.from(JSON.stringify({ operation, body, token })) }]);
        const secured = await sandbox.runCommand({ cmd: "chmod", args: ["600", input], timeoutMs: 5_000 });
        if (secured.exitCode !== 0) throw new Error("Private transport unavailable");
        const command = await sandbox.runCommand({ cmd: "node", args: [`${ROOT}/control.cjs`, input, output], timeoutMs: 30_000 });
        if (command.exitCode !== 0) throw new Error("Private controller request failed");
        const buffer = await sandbox.readFileToBuffer({ path: output });
        if (!buffer || buffer.length > 131_072) throw new Error("Private controller response unavailable");
        try { return JSON.parse(buffer.toString("utf8")) as T; }
        finally { buffer.fill(0); }
      } finally {
        await sandbox.runCommand({ cmd: "rm", args: ["-f", input, output], timeoutMs: 5_000 });
      }
    },
    async destroy() {
      if (session.status === "running") {
        try { await sandbox.stop(); }
        catch (error) { if (!(error instanceof APIError && error.response.status === 404)) throw error; }
      }
      try { await sandbox.delete({ deleteOrphanSnapshots: true }); }
      catch (error) { if (!(error instanceof APIError && error.response.status === 404)) throw error; }
    },
  };
}

export async function openNativeAllocation(name: string, token: string): Promise<NativeAllocation> {
  requireCapability("vercelSandbox");
  const sandbox = await Sandbox.get({ ...credentials(), name, resume: false });
  return wrapper(sandbox, token);
}

/** The name is persisted under the lease before creation to cover bootstrap crashes. */
export async function createNativeAllocation(name: string, token: string, engine: NativeHarness, onCreated?: (allocation: NativeAllocation) => Promise<void>): Promise<NativeAllocation> {
  requireCapability("vercelSandbox");
  const bundle = await readFile(path.join(process.cwd(), ".agent-vm/native-prototype.js"));
  if (bundle.length > 2_000_000) throw new Error("Native prototype bundle too large");
  const sandbox = await Sandbox.create({
    ...credentials(), name, runtime: "node24", region: "iad1", failoverRegions: [],
    resources: { vcpus: 2 }, timeout: NATIVE_ALLOCATION_TIMEOUT_MS, persistent: false,
  });
  const allocation = wrapper(sandbox, token);
  try {
    await onCreated?.(allocation);
    const directories = await sandbox.runCommand({ cmd: "mkdir", args: ["-p", `${ROOT}/transport`, RUNTIME_ROOT, `${ROOT}/profiles`, `${ROOT}/native-fixture`], timeoutMs: 5_000 });
    if (directories.exitCode !== 0) throw new Error("Native bootstrap failed");
    const secure = await sandbox.runCommand({ cmd: "chmod", args: ["700", ROOT, `${ROOT}/transport`, `${ROOT}/profiles`], timeoutMs: 5_000 });
    if (secure.exitCode !== 0) throw new Error("Native bootstrap failed");
    await sandbox.writeFiles([
      { path: `${ROOT}/controller.cjs`, content: bundle },
      { path: `${ROOT}/control.cjs`, content: Buffer.from(CONTROL_HELPER) },
    ]);
    const packageName = engine === "codex" ? "@openai/codex@0.162.1" : "@anthropic-ai/claude-code@2.1.296";
    const installed = await sandbox.runCommand({ cmd: "npm", args: ["install", "--prefix", RUNTIME_ROOT, "--ignore-scripts", "--no-audit", "--no-fund", packageName], timeoutMs: 120_000 });
    if (installed.exitCode !== 0) throw new Error("Native installation failed");
    if (engine === "claude_code") {
      // The published launcher is a placeholder until postinstall. Link the
      // installed platform binary explicitly instead of running package scripts.
      const linked = await sandbox.runCommand({ cmd: "node", args: ["-e", `const fs=require('node:fs');if(process.platform!=='linux'||!['x64','arm64'].includes(process.arch))process.exit(1);const root=${JSON.stringify(RUNTIME_ROOT)}+'/node_modules';const target='../@anthropic-ai/claude-code-linux-'+process.arch+'/claude';fs.accessSync(root+'/.bin/'+target,fs.constants.X_OK);fs.rmSync(root+'/.bin/claude',{force:true});fs.symlinkSync(target,root+'/.bin/claude');`], timeoutMs: 5_000 });
      if (linked.exitCode !== 0) throw new Error("Native installation failed");
    }
    await sandbox.runCommand({ cmd: "node", args: [`${ROOT}/controller.cjs`], detached: true,
      timeoutMs: NATIVE_ALLOCATION_TIMEOUT_MS,
      env: { NODE_ENV: "production", PATH: `${RUNTIME_ROOT}/node_modules/.bin:/usr/local/bin:/usr/bin:/bin`,
        MINDDY_NATIVE_PROFILE_ROOT: `${ROOT}/profiles`, MINDDY_NATIVE_CONTROLLER_TOKEN: token,
        MINDDY_NATIVE_CONTROLLER_PORT: String(CONTROL_PORT) },
    });
    let ready = false;
    for (let i = 0; i < 10; i++) {
      try { await allocation.request("/status"); ready = true; break; }
      catch { await new Promise((resolve) => setTimeout(resolve, 300)); }
    }
    if (!ready) throw new Error("Native controller unavailable");
    if (engine === "codex") {
      const isolation = await allocation.request<{ supported: boolean; isolated: boolean }>("/isolation/check", { engine });
      if (isolation.supported !== true || isolation.isolated !== true) throw new Error("Native credential isolation unavailable");
    }
    return allocation;
  } catch {
    await allocation.destroy();
    throw new Error("Native allocation bootstrap failed");
  }
}
