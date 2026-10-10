import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { dirname, join } from "node:path";
import { mkdir } from "node:fs/promises";
import type { NativeHarness } from "@/lib/native-agent-prototype";
import type { NativeWorkerMessage } from "@/lib/native-agent-worker";
import { CODEX_CAPABILITY_DROP_ARGS, safeNativeError } from "./native-prototype/controller";

export type NativeEvent =
  | { type: "text"; text: string; delta: boolean }
  | { type: "status"; phase: "starting" | "running" | "reasoning" | "tool" }
  | { type: "completed"; reply: string }
  | { type: "failed"; code: "providerUnavailable"; nativeCode?: string }
  | { type: "usage"; input?: number; output?: number; cached?: number };
export interface NativeRuntimeInput { cwd: string; anchor: string; prompt: string; history: NativeWorkerMessage[]; mcpUrl: string; mcpToken: string; privateRoot: string; profileRoot: string; toolNames?: string[]; }
export interface NativeRuntime {
  start(input: NativeRuntimeInput): Promise<void>;
  events(): AsyncIterable<NativeEvent>;
  steer(text: string): Promise<void>;
  interrupt(): Promise<void>;
  close(): Promise<void>;
}
export type NativeRuntimeSpawn = (engine: NativeHarness, args: string[], env: NodeJS.ProcessEnv, cwd: string) => ChildProcessWithoutNullStreams;

/** Fresh sandboxes reconstruct bounded context; opaque native session IDs never travel. */
export function nativeReplayPrompt(prompt: string, history: NativeWorkerMessage[]): string {
  if (!history.length) return prompt;
  const replay = history.slice(-24).map((message) => `${message.role === "user" ? "User" : "Assistant"}: ${message.text.slice(0, 8000)}`).join("\n\n").slice(-48_000);
  return `This is a fresh native CLI session. The previous Minddy worker conversation is reconstructed below as context. Recheck current repository and ticket state before acting.\n\n${replay}\n\nCurrent request:\n${prompt}`;
}

export function nativeClaudeArguments(input: NativeRuntimeInput): string[] {
  return ["--print", "--verbose", "--restricted", "--disable-slash-commands", "--input-format", "stream-json", "--output-format", "stream-json", "--include-partial-messages", "--tools", "", "--setting-sources", "", "--strict-mcp-config", "--permission-mode", "dontAsk", ...(input.toolNames?.length ? ["--allowedTools", ...input.toolNames.map((name) => `mcp__minddy__${name}`)] : []), "--append-system-prompt", input.anchor, "--mcp-config", JSON.stringify({ mcpServers: { minddy: { type: "http", url: input.mcpUrl, headers: { Authorization: "${MINDDY_NATIVE_MCP_AUTHORIZATION}" } } } })];
}

export function nativeCodexConfiguration(input: NativeRuntimeInput) {
  return { default_permissions: "minddy_native_worker", permissions: { minddy_native_worker: { filesystem: { ":root": "read", [input.privateRoot]: "deny", "/proc": "deny", "/sys": "deny" }, network: { enabled: false } } }, features: { shell_tool: false, view_image: false, multi_agent: false, multi_agent_v2: false, code_mode: false, code_mode_only: false, request_permissions_tool: false, apps: false, enable_mcp_apps: false, plugins: false, recommended_plugins: false, hooks: false, tool_suggest: false }, web_search: "disabled", mcp_servers: { minddy: { url: input.mcpUrl, default_tools_approval_mode: "approve", ...(input.toolNames ? { enabled_tools: input.toolNames } : {}), http_headers: { Authorization: `Bearer ${input.mcpToken}` } } } };
}

export function createNativeRuntime(engine: NativeHarness, options: { spawn?: NativeRuntimeSpawn } = {}): NativeRuntime {
  const launch = options.spawn ?? ((engine, args, env, cwd) => engine === "codex" ? spawn("setpriv", [...CODEX_CAPABILITY_DROP_ARGS, "codex", ...args], { env, cwd, detached: true, stdio: "pipe" }) : spawn("claude", args, { env, cwd, detached: true, stdio: "pipe" }));
  let child: ChildProcessWithoutNullStreams | undefined;
  let stopping: Promise<void> | undefined;
  let expectedClaudeTools: string[] = [];
  let nextId = 0; let threadId = ""; let turnId = ""; let reply = ""; let closed = false;
  const pending = new Map<number, { resolve(value: Record<string, unknown>): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  const queue: NativeEvent[] = [];
  let wake: (() => void) | undefined;
  const push = (event: NativeEvent) => { if (closed) return; if (queue.length >= 4096) { queue.length = 0; queue.push({ type: "failed", code: "providerUnavailable", nativeCode: "nativeProtocolLimit" }); void stop().catch(() => {}); } else queue.push(event); wake?.(); wake = undefined; };
  const fail = (nativeCode?: string) => push({ type: "failed", code: "providerUnavailable", ...(nativeCode ? { nativeCode } : {}) });
  const rpc = (method: string, params: Record<string, unknown>) => new Promise<Record<string, unknown>>((resolve, reject) => {
    if (!child) { reject(new Error("Native worker process is unavailable")); return; }
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error("Native worker protocol request timed out")); }, 25_000);
    pending.set(id, { resolve, reject, timer }); child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
  });
  const stop = (): Promise<void> => {
    if (stopping) return stopping;
    const current = child; child = undefined;
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error("Native worker process stopped")); } pending.clear();
    if (!current) return Promise.resolve();
    const kill = (signal: NodeJS.Signals) => { try { if (current.pid) process.kill(-current.pid, signal); else current.kill(signal); } catch { try { current.kill(signal); } catch { /* Only physical close confirms termination. */ } } };
    stopping = new Promise<void>((resolve, reject) => {
      const forced = setTimeout(() => kill("SIGKILL"), 1500);
      const deadline = setTimeout(() => {
        clearTimeout(forced); current.removeListener("close", confirmed);
        reject(new Error("Native worker process stop unconfirmed"));
      }, 5000);
      const confirmed = () => { clearTimeout(forced); clearTimeout(deadline); resolve(); };
      current.once("close", confirmed); kill("SIGTERM");
    });
    const task = stopping;
    // A failed stop remains a fence: later close calls cannot authorize export.
    void task.then(() => { if (stopping === task) stopping = undefined; }, () => {});
    return task;
  };
  const envFor = (input: NativeRuntimeInput): NodeJS.ProcessEnv => {
    const home = join(input.profileRoot, engine);
    return { NODE_ENV: "production", PATH: `${dirname(process.execPath)}:${process.env.PATH ?? "/usr/bin:/bin"}`, HOME: home, LANG: "C.UTF-8", TERM: "dumb", CI: "1", BROWSER: "/bin/false", ...(engine === "codex" ? { CODEX_HOME: home } : { CLAUDE_CONFIG_DIR: home, MINDDY_NATIVE_MCP_AUTHORIZATION: `Bearer ${input.mcpToken}` }) };
  };
  const observe = (process: ChildProcessWithoutNullStreams) => {
    let buffer = "";
    process.stderr.resume();
    process.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8"); if (Buffer.byteLength(buffer) > 1024 * 1024) { fail("nativeProtocolLimit"); void stop().catch(() => {}); return; }
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
        let event: Record<string, any>; try { event = JSON.parse(line); } catch { continue; }
        if (engine === "codex") {
          if (typeof event.id === "number" && pending.has(event.id)) { const entry = pending.get(event.id)!; clearTimeout(entry.timer); pending.delete(event.id); if (event.error) entry.reject(new Error("Native worker protocol request rejected")); else entry.resolve(event.result ?? {}); continue; }
          if (event.id !== undefined && typeof event.method === "string") { process.stdin.write(`${JSON.stringify({ id: event.id, error: { code: -32601, message: "Use the guarded Minddy MCP tools" } })}\n`); continue; }
          const params = event.params ?? {};
          if (event.method === "turn/started") { turnId = params.turn?.id ?? turnId; push({ type: "status", phase: "running" }); }
          if (event.method === "item/agentMessage/delta" && typeof params.delta === "string") { reply = (reply + params.delta).slice(-64_000); push({ type: "text", text: params.delta, delta: true }); }
          if (event.method === "item/started" && params.item?.type === "reasoning") push({ type: "status", phase: "reasoning" });
          if (event.method === "item/started" && params.item?.type === "mcpToolCall") push({ type: "status", phase: "tool" });
          if (event.method === "item/completed" && params.item?.type === "agentMessage" && typeof params.item.text === "string") { reply = params.item.text.slice(-64_000); push({ type: "text", text: reply, delta: false }); }
          if (event.method === "turn/completed") { turnId = ""; if (params.turn?.status === "completed") push({ type: "completed", reply }); else fail(safeNativeError(params.turn?.error?.codexErrorInfo).errorCode); }
          if (event.method === "error") fail(safeNativeError(params.error?.codexErrorInfo).errorCode);
        } else {
          if (event.type === "system" && event.subtype === "init") {
            const tools = Array.isArray(event.tools) ? event.tools : [];
            const servers = Array.isArray(event.mcp_servers) ? event.mcp_servers : [];
            const permitted = new Set([...expectedClaudeTools, "EndConversation"]);
            if (tools.some((tool: unknown) => typeof tool !== "string" || !permitted.has(tool)) || expectedClaudeTools.some((tool) => !tools.includes(tool)) || event.plugins?.length || event.plugin_errors?.length || event.mcp_server_errors?.length || !servers.some((server: { name?: unknown; status?: unknown }) => server.name === "minddy" && server.status === "connected")) { fail("nativeMcpUnavailable"); void stop().catch(() => {}); }
          }
          const delta = event.event?.delta;
          if (event.type === "stream_event" && delta?.type === "text_delta" && typeof delta.text === "string") { reply = (reply + delta.text).slice(-64_000); push({ type: "text", text: delta.text, delta: true }); }
          if (event.type === "assistant") { const text = (event.message?.content ?? []).filter((block: any) => block.type === "text" && typeof block.text === "string").map((block: any) => block.text).join("\n"); if (text) { reply = text.slice(-64_000); push({ type: "text", text: reply, delta: false }); } }
          if (event.type === "result") { if (event.is_error === true) fail(); else { if (typeof event.result === "string") reply = event.result.slice(-64_000); push({ type: "completed", reply }); } }
        }
      }
    });
    process.once("error", () => fail("nativeStartFailed"));
    process.once("close", () => { if (child === process) { child = undefined; fail("nativeProcessExited"); } });
  };
  const prompt = async (text: string) => {
    reply = "";
    if (engine === "codex") { const result = await rpc("turn/start", { threadId, input: [{ type: "text", text, text_elements: [] }] }); turnId = (result.turn as { id?: string })?.id ?? turnId; }
    else { if (!child) throw new Error("Native worker process is unavailable"); child.stdin.write(`${JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "text", text }] } })}\n`); }
  };
  return {
    async start(input) {
      if (stopping) await stopping;
      push({ type: "status", phase: "starting" });
      expectedClaudeTools = (input.toolNames ?? []).map((name) => `mcp__minddy__${name}`);
      const args = engine === "codex" ? ["app-server", "-c", 'cli_auth_credentials_store="file"', "-c", "project_doc_max_bytes=0", "-c", "features.apps=false", "-c", "features.plugins=false", "-c", "features.hooks=false", "-c", "features.tool_suggest=false", "-c", `projects.${JSON.stringify(input.cwd)}.trust_level="untrusted"`] : nativeClaudeArguments(input);
      const cwd = engine === "codex" ? input.cwd : join(input.privateRoot, "cli-cwd");
      if (engine === "claude_code") await mkdir(cwd, { recursive: true, mode: 0o700 });
      child = launch(engine, args, envFor(input), cwd); observe(child);
      if (engine === "codex") {
        await rpc("initialize", { clientInfo: { name: "minddy_native_worker", version: "1.0.0" } }); child.stdin.write('{"method":"initialized","params":{}}\n');
        const auth = await rpc("account/read", { refreshToken: true }); if ((auth.account as { type?: string })?.type !== "chatgpt") throw new Error("Native subscription requires reconnection");
        const thread = await rpc("thread/start", { cwd: input.cwd, developerInstructions: input.anchor, approvalPolicy: "never", ephemeral: true, config: nativeCodexConfiguration(input) });
        threadId = (thread.thread as { id?: string })?.id ?? ""; if (!threadId) throw new Error("Native worker thread did not start");
        const catalogue = await rpc("mcpServerStatus/list", { threadId, serverName: "minddy", detail: "toolsAndAuthOnly" });
        const server = Array.isArray(catalogue.data) ? catalogue.data.find((server) => server.name === "minddy") : undefined;
        if (!server?.tools || !Object.keys(server.tools).length) throw new Error("Native worker MCP catalogue is unavailable");
        if (input.toolNames && (Object.keys(server.tools).length !== input.toolNames.length || input.toolNames.some((name) => !Object.hasOwn(server.tools, name)))) throw new Error("Native worker MCP catalogue does not match the allowed tools");
      }
      await prompt(nativeReplayPrompt(input.prompt, input.history));
    },
    async *events() { while (!closed) { if (queue.length) yield queue.shift()!; else await new Promise<void>((resolve) => { wake = resolve; }); } },
    async steer(text) { if (engine === "codex" && turnId) await rpc("turn/steer", { threadId, expectedTurnId: turnId, input: [{ type: "text", text, text_elements: [] }] }); else await prompt(text); },
    async interrupt() { if (engine === "codex" && turnId && child) { await rpc("turn/interrupt", { threadId, turnId }).catch(() => {}); } else await stop(); },
    async close() {
      try { await stop(); }
      finally { closed = true; wake?.(); wake = undefined; queue.length = 0; }
    },
  };
}
