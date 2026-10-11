import { randomUUID } from "node:crypto";
import { realpath } from "node:fs/promises";
import { posix } from "node:path";
import { createServer } from "node:http";
import { checkCommand } from "../command-guard";
import { formatRunCommandResult, fullOutputDocument, spillsToDisk, toolOutputFileName } from "../command-output";
import { applyEdit } from "../edit";
import { assertNotGit, resolveReadable, resolveWithin } from "../repo-path";
import { deleteWorkFile, globRepo, grepRepo, listDir, moveWorkFile, readWorkFile, readWorkFileWindow, writeToolOutput, writeWorkFile } from "../repo-host";
import { isSecretFile } from "../secret-scan";
import { cap, toolArgSummary } from "../tool-summary";
import { realPathOf } from "./local-guard";
import { domainToolsFor, localToolsFor } from "./opencode-tools";
import type { OpencodeDelivery } from "./opencode-delivery";
import type { IsolatedNativeHost } from "./native-isolation";
import type { VmJob } from "./protocol";
import { TOOL_SUCCESS_HEADER, type ToolBridge } from "./tool-bridge";
import type { ControlPlaneClient } from "./control-plane-client";

type Schema = Record<string, unknown>;
type Tool = { name: string; description: string; inputSchema: Schema; annotations: { readOnlyHint: boolean; destructiveHint: boolean; openWorldHint: boolean } };
const text = { type: "string" };
const number = { type: "integer", minimum: 1 };
const repositoryDefinitions: Array<[string, string, Record<string, Schema>, string[], boolean]> = [
  ["read_file", "Read a repository file or saved tool output with numbered lines.", { path: text, offset: number, limit: { ...number, maximum: 500 } }, ["path"], true],
  ["list_dir", "List a repository directory or saved tool output directory.", { path: text }, [], true],
  ["grep", "Search repository files or a saved tool output for a pattern.", { pattern: text, path: text, glob: text }, ["pattern"], true],
  ["glob", "List repository files matching a glob.", { pattern: text, path: text }, ["pattern"], true],
  ["write_file", "Create or overwrite a repository file. Read existing files before editing.", { path: text, content: text }, ["path", "content"], false],
  ["edit_file", "Replace exact text in a repository file. Ambiguous matches fail unless replace_all is true.", { path: text, old_string: text, new_string: text, replace_all: { type: "boolean" } }, ["path", "old_string", "new_string"], false],
  ["delete_file", "Delete a repository file.", { path: text }, ["path"], false],
  ["move_file", "Move a repository file.", { path: text, destination: text }, ["path", "destination"], false],
  ["run_command", "Run a guarded repository command, including tests and builds. Commands execute in an isolated kernel sandbox.", { command: text, workdir: text, timeout_ms: { ...number, maximum: 180000 } }, ["command"], false],
];
const readonlyDomain = /^(read_|get_|list_|search_|fetch_|web_search$|lookup_|grep$|glob$)/;

export function nativeWorkerTools(job: VmJob): Tool[] {
  const bridged = [...domainToolsFor(job), ...localToolsFor(job)].filter(({ function: tool }) => tool.name !== "list_projects").map(({ function: tool }) => ({ name: tool.name, description: tool.description, inputSchema: tool.parameters as Schema, annotations: { readOnlyHint: readonlyDomain.test(tool.name), destructiveHint: false, openWorldHint: true } }));
  return [...bridged, ...(job.interactive ? [{ name: "ask_user", description: "Ask the user a necessary question through Numo. The worker pauses and resumes in a fresh sandbox when the user replies.", inputSchema: { type: "object", properties: { questions: { type: "array", minItems: 1, maxItems: 4, items: { type: "object", properties: { question: text, header: text, options: { type: "array", items: { type: "object", properties: { label: text, description: text }, required: ["label"] } } }, required: ["question"] } } }, required: ["questions"] }, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false } }] : []), ...repositoryDefinitions.filter((entry) => job.writesToRepo || entry[4] || entry[0] === "run_command").map(([name, description, properties, required, readOnlyHint]) => ({ name, description, inputSchema: { type: "object", properties, required, additionalProperties: false }, annotations: { readOnlyHint, destructiveHint: name === "delete_file", openWorldHint: name === "run_command" } }))];
}

export interface NativeWorkerMcpOptions {
  job: VmJob; host: IsolatedNativeHost; bridge: ToolBridge; bridgeToken: string; token: string; cp: ControlPlaneClient; delivery: OpencodeDelivery; signal: AbortSignal; redact(text: string): string;
  onCall?(): void;
  askUser?(args: Record<string, unknown>, callId: string): Promise<unknown>;
}

/** Native harnesses share the canonical Minddy bridge and kernel-isolated repository tools. */
export async function startNativeWorkerMcp(options: NativeWorkerMcpOptions) {
  const { job, host, delivery, signal } = options;
  const tools = nativeWorkerTools(job);
  const allowed = new Map(tools.map((tool) => [tool.name, tool]));
  const repository = new Set(repositoryDefinitions.map(([name]) => name));
  let active = 0; let sequence = 0;
  const string = (args: Record<string, unknown>, key: string, fallback?: string) => {
    const value = args[key] ?? fallback;
    if (typeof value !== "string" || value.length > 100_000) throw new Error("Invalid tool string argument");
    return value;
  };
  const path = async (raw: string, write = false) => {
    if (raw.startsWith("/")) {
      const absolute = posix.normalize(raw);
      if (absolute === host.layout.repoDir || absolute.startsWith(`${host.layout.repoDir}/`)) raw = posix.relative(host.layout.repoDir, absolute) || ".";
      else if (write || absolute !== host.layout.toolOutputDir && !absolute.startsWith(`${host.layout.toolOutputDir}/`)) throw new Error("Path escapes the repository");
      else raw = absolute;
    }
    const absolute = write ? resolveWithin(host.layout.repoDir, raw) : resolveReadable(host.layout.repoDir, [host.layout.toolOutputDir], raw);
    assertNotGit(host.layout.repoDir, absolute, raw);
    if (isSecretFile(raw)) throw new Error("Credential files are unavailable");
    const actual = await realPathOf(absolute, realpath);
    const contained = (root: string) => actual === root || actual.startsWith(`${root}/`);
    if (!contained(host.layout.repoDir) && (write || !contained(host.layout.toolOutputDir))) throw new Error("Symlink escapes the repository");
    assertNotGit(host.layout.repoDir, actual, raw);
    return raw;
  };
  const runRepository = async (name: string, args: Record<string, unknown>) => {
    if (signal.aborted) throw new Error("Native worker is stopping");
    const writer = !allowed.get(name)?.annotations.readOnlyHint;
    if (writer && name !== "run_command" && !job.writesToRepo) throw new Error("Repository writes are unavailable");
    const file = name === "run_command" || name === "glob" || name === "grep" ? "" : await path(string(args, "path", "."), writer);
    if (name === "read_file") return readWorkFileWindow(host, file, { offset: typeof args.offset === "number" ? Math.max(1, args.offset) : 1, limit: typeof args.limit === "number" ? Math.max(1, Math.min(500, args.limit)) : 200 });
    if (name === "list_dir") return listDir(host, file);
    if (name === "glob") return globRepo(host, string(args, "pattern"), await path(string(args, "path", ".")));
    if (name === "grep") return grepRepo(host, { pattern: string(args, "pattern"), path: await path(string(args, "path", ".")), ...(typeof args.glob === "string" ? { glob: args.glob } : {}) });
    if (name === "run_command") {
      const command = string(args, "command");
      const verdict = checkCommand(command, { local: false });
      if (!verdict.allowed) throw new Error(verdict.reason);
      const workdir = await path(string(args, "workdir", "."));
      const result = await host.exec(command, { cwd: resolveWithin(host.layout.repoDir, workdir), timeoutMs: typeof args.timeout_ms === "number" ? Math.min(180_000, Math.max(1000, args.timeout_ms)) : 120_000, signal });
      delivery.noteShell(command, result.exitCode); await delivery.probeRepoTouched();
      let fullPath: string | null = null;
      if (spillsToDisk(result)) fullPath = await writeToolOutput(host, toolOutputFileName(command, ++sequence), options.redact(fullOutputDocument(command, result))).catch(() => null);
      return formatRunCommandResult(result, fullPath);
    }
    delivery.noteEdit(file);
    if (name === "write_file") { await writeWorkFile(host, file, string(args, "content")); return { written: file }; }
    if (name === "delete_file") { await deleteWorkFile(host, file); return { deleted: file }; }
    if (name === "move_file") { const destination = await path(string(args, "destination"), true); delivery.noteEdit(destination); await moveWorkFile(host, file, destination); return { moved: file, destination }; }
    const original = await readWorkFile(host, file);
    if (original === null) throw new Error("Repository file is unavailable");
    const edit = applyEdit(file, original, string(args, "old_string"), string(args, "new_string"), args.replace_all === true);
    await writeWorkFile(host, file, edit.content); return { edited: file, diff: edit.diff };
  };
  const invoke = async (name: string, args: Record<string, unknown>) => {
    const tool = allowed.get(name);
    if (!tool || active >= 8 || signal.aborted) return { content: [{ type: "text", text: "Tool unavailable on this worker" }], isError: true };
    for (const key of (tool.inputSchema.required as string[] | undefined) ?? []) if (!(key in args)) return { content: [{ type: "text", text: "Missing required tool argument" }], isError: true };
    active++; options.onCall?.();
    const callId = `native-${randomUUID()}`;
    await options.cp.emit("tool_call", { id: callId, name, ...toolArgSummary(name, name === "move_file" ? { from: args.path, to: args.destination } : args) }).catch(() => {});
    let output = ""; let failed = false;
    try {
      if (name === "ask_user") { if (!options.askUser) throw new Error("Questions are unavailable"); output = JSON.stringify(await options.askUser(args, callId)); }
      else if (repository.has(name)) output = JSON.stringify(await runRepository(name, args));
      else {
        const response = await fetch(`${options.bridge.url}/tool/${encodeURIComponent(name)}`, { method: "POST", headers: { authorization: `Bearer ${options.bridgeToken}`, "content-type": "application/json" }, body: JSON.stringify({ args, callID: callId, sessionID: "native-worker" }), signal: AbortSignal.any([signal, AbortSignal.timeout(180_000)]) });
        if (!response.ok) throw new Error("Minddy tool transport failed");
        output = await response.text();
        failed = response.headers.get(TOOL_SUCCESS_HEADER) !== "true";
      }
    } catch { failed = true; output = "The guarded tool failed or was refused. Check its arguments, repository scope, and worker capabilities."; }
    finally { active--; }
    output = options.redact(output).slice(0, 100_000);
    let exitCode: number | undefined;
    if (name === "run_command") { try { const value = JSON.parse(output).exitCode; if (typeof value === "number") { exitCode = value; failed ||= value !== 0; } } catch { /* A refused command has no process exit status. */ } }
    await options.cp.emit("tool_result", { id: callId, name, success: !failed, preview: cap(output, 400), ...(exitCode === undefined ? {} : { exit_code: exitCode }) }).catch(() => {});
    return { content: [{ type: "text", text: output }], ...(failed ? { isError: true } : {}) };
  };
  const server = createServer((req, res) => {
    const respond = (status: number, value?: unknown) => { res.writeHead(status, { "content-type": "application/json" }); res.end(value === undefined ? undefined : JSON.stringify(value)); };
    if (req.headers.authorization !== `Bearer ${options.token}`) { respond(401, { error: "Unauthorized" }); return; }
    if (req.method !== "POST") { respond(405); return; }
    void (async () => {
      let body = "";
      for await (const chunk of req) { body += chunk.toString(); if (Buffer.byteLength(body) > 131_072) { respond(413); req.destroy(); return; } }
      const request = JSON.parse(body) as { id?: unknown; method?: string; params?: Record<string, unknown> };
      if (request.id === undefined) { respond(202); return; }
      let result: unknown;
      if (request.method === "initialize") { const requested = request.params?.protocolVersion; result = { protocolVersion: ["2024-11-05", "2025-03-26", "2025-06-18"].includes(String(requested)) ? requested : "2025-03-26", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "minddy-native-worker", version: "1.0.0" } }; }
      else if (request.method === "tools/list") result = { tools };
      else if (request.method === "ping") result = {};
      else if (request.method === "tools/call") { const args = request.params?.arguments; result = await invoke(String(request.params?.name ?? ""), args && typeof args === "object" && !Array.isArray(args) ? args as Record<string, unknown> : {}); }
      else { respond(200, { jsonrpc: "2.0", id: request.id, error: { code: -32601, message: "Method unavailable" } }); return; }
      respond(200, { jsonrpc: "2.0", id: request.id, result });
    })().catch(() => { if (!res.headersSent) respond(400, { error: "Invalid MCP request" }); });
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Native MCP listener unavailable");
  return { url: `http://127.0.0.1:${address.port}/mcp`, toolNames: tools.map((tool) => tool.name), close: () => new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); }) };
}
