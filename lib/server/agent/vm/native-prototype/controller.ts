import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { basename, dirname, join } from "node:path";
import { mkdir, open, rm, writeFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";
import { exportProfile, importProfile, parseEngine, prepareProfileRoot, type NativeEngine } from "./profile";

import { parseCodexModels } from "@/lib/native-agent-models";

type Json = Record<string, unknown>;
export type NativeDiagnostics = { rpcMethod?: string; rpcErrorCode?: number; notification?: string; itemType?: string; itemStatus?: string; turnStatus?: string; errorCode?: string; httpStatus?: number; mcpStartupStatus?: string; callbackMethod?: string; registeredTools?: number; mcpToolRegistered?: boolean; receivedEvents: number };
export type NativeStatus = { engine?: NativeEngine; phase: "idle" | "starting" | "awaiting_user" | "authenticated" | "running" | "completed" | "cancelled" | "failed"; authenticated: boolean; verificationUrl?: string; userCode?: string; toolObserved?: boolean; markerObserved?: boolean; error?: string; diagnostics?: NativeDiagnostics };
export type SmokeInput = { engine: NativeEngine; mcp: { url: string; authorization: string }; requiredTool: string; marker: string };
export type NativeSpawn = (engine: NativeEngine, args: string[], environment: NodeJS.ProcessEnv, tty?: boolean) => ChildProcessWithoutNullStreams;
const AUTH_HOSTS = new Set(["auth.openai.com", "chatgpt.com", "claude.ai", "console.anthropic.com", "platform.claude.com", "auth.anthropic.com"]);
export const CODEX_CAPABILITY_DROP_ARGS = ["--bounding-set=-all", "--inh-caps=-all", "--ambient-caps=-all", "--no-new-privs", "--"] as const;
const NOTIFICATIONS = new Set(["error", "thread/started", "turn/started", "turn/completed", "item/started", "item/completed", "mcpServer/startupStatus/updated", "mcpServer/event/stream/notification", "item/mcpToolCall/progress", "account/login/completed"]);
const ITEM_TYPES = new Set(["mcpToolCall", "agentMessage", "userMessage", "reasoning", "commandExecution", "fileChange", "webSearch", "plan", "dynamicToolCall"]);
const ERROR_CODES = new Set(["contextWindowExceeded", "sessionBudgetExceeded", "usageLimitExceeded", "rateLimitExceeded", "flexUnavailable", "serverOverloaded", "cyberPolicy", "misalignmentPolicyViolation", "tooManyDenials", "internalServerError", "unauthorized", "badRequest", "threadRollbackFailed", "sandboxError", "other", "httpConnectionFailed", "responseStreamConnectionFailed", "responseStreamDisconnected", "responseTooManyFailedAttempts", "activeTurnNotSteerable"]);
export function safeNativeError(value: unknown): Pick<NativeDiagnostics, "errorCode" | "httpStatus"> {
  if (typeof value === "string") return ERROR_CODES.has(value) ? { errorCode: value } : {};
  if (!value || typeof value !== "object") return {};
  for (const key of ERROR_CODES) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const httpStatus = (value as Record<string, { httpStatusCode?: unknown }>)[key]?.httpStatusCode;
    return { errorCode: key, ...(Number.isInteger(httpStatus) && Number(httpStatus) >= 100 && Number(httpStatus) <= 599 ? { httpStatus: Number(httpStatus) } : {}) };
  }
  return {};
}

export function safeAuthorizationUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 4096) return;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !AUTH_HOSTS.has(url.hostname) || url.username || url.password || url.port || url.hash) return;
    if ([...url.searchParams.keys()].some((key) => /^(code|access_token|refresh_token|id_token|token)$/i.test(key))) return;
    return url.toString();
  } catch { return; }
}

export function boundedCode(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 2048 || !new RegExp("^[a-zA-Z0-9_#.=+/-]+$").test(value)) throw new Error("Invalid authorization code");
  return value;
}

export function codexFixtureConfig(profileRoot: string) {
  return {
    default_permissions: "minddy_native_fixture",
    permissions: { minddy_native_fixture: { filesystem: { ":root": "read", [profileRoot]: "deny", "/proc": "deny", "/sys": "deny" }, network: { enabled: false } } },
    features: { shell_tool: false, view_image: false, multi_agent: false, multi_agent_v2: false, code_mode: false, code_mode_only: false, request_permissions_tool: false },
    web_search: "disabled",
  };
}

export function codexIsolationArguments(protectedRoot: string, dummyPath: string, parentPid: number, parentFd: number): string[] {
  const deniedPath = JSON.stringify(protectedRoot);
  const probe = 'const fs=require("node:fs");for(const path of process.argv.slice(1)){try{path.endsWith("/transport")?fs.readdirSync(path):fs.readFileSync(path);process.exit(41)}catch(error){const denied=path.startsWith("/proc/")?["EACCES","EPERM","ENOENT"]:["EACCES","EPERM"];if(!denied.includes(error.code))process.exit(42)}}';
  return ["sandbox", "-c", 'default_permissions="minddy_native_fixture"', "-c", `permissions.minddy_native_fixture.filesystem={":root"="read",${deniedPath}="deny","/proc"="deny","/sys"="deny"}`, "-c", "permissions.minddy_native_fixture.network.enabled=false", "--", process.execPath, "-e", probe, dummyPath, join(protectedRoot, "control.cjs"), join(protectedRoot, "transport"), `/proc/${parentPid}/environ`, `/proc/${parentPid}/fd/${parentFd}`, `/proc/${parentPid}/mem`];
}

export function claudeSmokeArguments(input: SmokeInput): string[] {
  if (!/^minddy_[a-z0-9_]+$/.test(input.requiredTool) || !/^[A-Z0-9_]{8,80}$/.test(input.marker)) throw new Error("Invalid smoke fixture");
  const url = new URL(input.mcp.url);
  if (!(url.protocol === "https:" || (url.protocol === "http:" && url.hostname === "127.0.0.1")) || url.username || url.password || url.hash || !input.mcp.authorization || input.mcp.authorization.length > 4096) throw new Error("Invalid MCP configuration");
  return ["--print", "--verbose", "--output-format", "stream-json", "--input-format", "text", "--tools", "", "--setting-sources", "", "--strict-mcp-config", "--permission-mode", "dontAsk", "--allowedTools", `mcp__minddy__${input.requiredTool}`, "--mcp-config", JSON.stringify({ mcpServers: { minddy: { type: "http", url: url.toString(), headers: { Authorization: "${MINDDY_NATIVE_MCP_AUTHORIZATION}" } } } }), "--", `Call mcp__minddy__${input.requiredTool} once with {}. Do not use any other tool. After the tool succeeds, reply with exactly ${input.marker}.`];
}

export class NativeController {
  private child?: ChildProcessWithoutNullStreams;
  private stopping?: Promise<void>;
  private operation = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private state: NativeStatus = { phase: "idle", authenticated: false };
  private nextId = 0;
  private pending = new Map<number, { resolve(value: Json): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
  private loginId?: string;
  private codexInitialized = false;
  private smokeFixture?: SmokeInput;
  private codexIsolationVerified = false;
  private diagnostics: NativeDiagnostics = { receivedEvents: 0 };
  constructor(readonly root: string, private launch: NativeSpawn = (engine, args, env, tty) => {
    const command = engine === "codex" ? "codex" : "claude";
    if (tty) return spawn("script", ["-q", "-c", "claude auth login --claudeai", "/dev/null"], { env, stdio: "pipe", detached: true });
    // Hosted workers can inherit file capabilities that bubblewrap deliberately rejects.
    if (engine === "codex" && process.platform === "linux") return spawn("setpriv", [...CODEX_CAPABILITY_DROP_ARGS, command, ...args], { env, stdio: "pipe", detached: true });
    return spawn(command, args, { env, stdio: "pipe", detached: true });
  }) {}

  status(): NativeStatus { return { ...this.state, diagnostics: { ...this.diagnostics } }; }
  private environment(engine: NativeEngine): NodeJS.ProcessEnv {
    const home = join(this.root, engine);
    // Only bootstrap variables survive; ambient provider credentials never enter a child.
    return { PATH: `${dirname(process.execPath)}:${process.env.PATH ?? "/usr/bin:/bin"}`, HOME: home, LANG: "C.UTF-8", TERM: "dumb", NODE_ENV: "production", ...(engine === "codex" ? { CODEX_HOME: home } : { CLAUDE_CONFIG_DIR: home }), BROWSER: "/bin/false" };
  }
  private fail(message = "Native CLI operation failed") { this.state = { engine: this.state.engine, phase: "failed", authenticated: false, error: message }; }
  private armDeadline(ms: number) { this.timer = setTimeout(() => { void this.cancel().then(() => this.fail("Native CLI operation timed out"), () => this.fail("Native CLI process stop unconfirmed")); }, ms); this.timer.unref(); }
  private clearTimer() { if (this.timer) clearTimeout(this.timer); this.timer = undefined; }
  private stop(): Promise<void> {
    this.clearTimer();
    if (this.stopping) return this.stopping;
    const child = this.child;
    this.child = undefined;
    this.codexInitialized = false;
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(new Error("Native CLI stopped")); }
    this.pending.clear();
    if (!child) return Promise.resolve();
    const signal = (name: NodeJS.Signals) => { try { if (child.pid) process.kill(-child.pid, name); else child.kill(name); } catch { try { child.kill(name); } catch { /* Only physical close confirms termination. */ } } };
    this.stopping = new Promise<void>((resolve, reject) => {
      const forced = setTimeout(() => signal("SIGKILL"), 1000);
      const deadline = setTimeout(() => {
        clearTimeout(forced); child.removeListener("close", confirmed);
        reject(new Error("Native CLI process stop unconfirmed"));
      }, 5000);
      const confirmed = () => { clearTimeout(forced); clearTimeout(deadline); resolve(); };
      child.once("close", confirmed); signal("SIGTERM");
    });
    const task = this.stopping;
    // Keep an uncertain stop fenced rather than authorizing a later export.
    void task.then(() => { if (this.stopping === task) this.stopping = undefined; }, () => {});
    return task;
  }
  async cancel() {
    ++this.operation;
    this.smokeFixture = undefined;
    if (this.state.engine === "codex" && this.loginId && this.child) {
      try { await this.rpc("account/login/cancel", { loginId: this.loginId }); } catch { /* Termination also cancels the bounded native login. */ }
    }
    await this.stop();
    this.loginId = undefined;
    this.state = { engine: this.state.engine, phase: "cancelled", authenticated: false };
    return this.status();
  }
  private rpc(method: string, params: Json): Promise<Json> {
    this.diagnostics.rpcMethod = method;
    delete this.diagnostics.rpcErrorCode;
    const child = this.child;
    if (!child) return Promise.reject(new Error("Native CLI unavailable"));
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error("Native CLI request timed out")); }, 20_000);
      this.pending.set(id, { resolve, reject, timer });
      child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }
  private async startCodex() {
    if (this.stopping) await this.stopping;
    if (this.child && this.codexInitialized) return;
    await prepareProfileRoot(this.root);
    const child = this.launch("codex", ["app-server", "-c", "cli_auth_credentials_store=\"file\"", "-c", "features.shell_tool=false", "-c", "features.view_image=false", "-c", "features.multi_agent=false", "-c", "web_search=\"disabled\""], this.environment("codex"));
    this.child = child;
    let buffer = "";
    const generation = this.operation;
    child.stderr.resume();
    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      if (buffer.length > 256 * 1024) { void this.stop().catch(() => {}); this.fail("Native protocol exceeded its limit"); return; }
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
        let data: Json; try { data = JSON.parse(line); } catch { continue; }
        this.diagnostics.receivedEvents = Math.min(65535, this.diagnostics.receivedEvents + 1);
        if (typeof data.method === "string" && NOTIFICATIONS.has(data.method)) this.diagnostics.notification = data.method;
        if (typeof data.id === "number" && this.pending.has(data.id)) {
          const pending = this.pending.get(data.id)!; this.pending.delete(data.id); clearTimeout(pending.timer);
          if (data.error) { const code = (data.error as Json).code; if (Number.isInteger(code) && Math.abs(Number(code)) <= 1_000_000) this.diagnostics.rpcErrorCode = Number(code); pending.reject(new Error("Native CLI rejected request")); } else pending.resolve((data.result ?? {}) as Json);
        } else if (data.id !== undefined && typeof data.method === "string") {
          this.diagnostics.callbackMethod = ["item/commandExecution/requestApproval", "item/fileChange/requestApproval", "item/tool/requestUserInput", "mcpServer/elicitation/request", "item/tool/call"].includes(data.method) ? data.method : "unsupported";
          // Unknown server callbacks, including tool approvals, are denied.
          child.stdin.write(`${JSON.stringify({ id: data.id, error: { code: -32601, message: "Unsupported private prototype request" } })}\n`);
        } else if (data.method === "account/login/completed" && generation === this.operation) {
          const params = data.params as Json;
          if (params?.loginId !== this.loginId) continue;
          if (params.success === true) { this.clearTimer(); this.state = { engine: "codex", phase: "authenticated", authenticated: true }; } else this.fail("Native authorization was not completed");
        } else if (data.method === "mcpServer/startupStatus/updated") {
          const status = (data.params as Json)?.status;
          if (["starting", "ready", "failed", "cancelled"].includes(String(status))) this.diagnostics.mcpStartupStatus = String(status);
        } else if (data.method === "error") {
          Object.assign(this.diagnostics, safeNativeError(((data.params as Json)?.error as Json)?.codexErrorInfo));
        } else if ((data.method === "item/completed" || data.method === "item/started") && this.state.phase === "running" && this.smokeFixture) {
          const item = (data.params as { item?: Json })?.item;
          if (typeof item?.type === "string" && ITEM_TYPES.has(item.type)) this.diagnostics.itemType = item.type;
          if (typeof item?.status === "string" && ["inProgress", "completed", "failed"].includes(item.status)) this.diagnostics.itemStatus = item.status;
          if (data.method !== "item/completed") continue;
          if (item?.type === "mcpToolCall" && item.server === "minddy" && item.tool === this.smokeFixture.requiredTool && item.status === "completed" && !item.error) this.state.toolObserved = true;
          if (item?.type === "agentMessage" && typeof item.text === "string" && item.text.trim() === this.smokeFixture.marker) this.state.markerObserved = true;
        } else if (data.method === "turn/completed" && this.state.phase === "running") {
          this.clearTimer();
          const turn = (data.params as { turn?: Json })?.turn;
          if (typeof turn?.status === "string" && ["completed", "interrupted", "failed", "inProgress"].includes(turn.status)) this.diagnostics.turnStatus = turn.status;
          Object.assign(this.diagnostics, safeNativeError((turn?.error as Json)?.codexErrorInfo));
          if (turn?.status === "completed" && this.state.toolObserved && this.state.markerObserved) this.state.phase = "completed";
          else this.fail("Native MCP smoke did not complete");
        }
      }
    });
    child.on("error", () => { if (generation === this.operation) this.fail("Native CLI could not start"); });
    child.on("close", () => { if (this.child === child) { this.child = undefined; if (generation === this.operation) this.fail("Native CLI exited"); } });
    await this.rpc("initialize", { clientInfo: { name: "minddy_private_native_prototype", version: "1.0.0" } });
    child.stdin.write(`${JSON.stringify({ method: "initialized", params: {} })}\n`);
    this.codexInitialized = true;
  }
  async login(engineValue: unknown) {
    const engine = parseEngine(engineValue);
    await this.cancel();
    this.state = { engine, phase: "starting", authenticated: false };
    this.armDeadline(10 * 60 * 1000);
    try {
      if (engine === "codex") {
        await this.startCodex();
        const result = await this.rpc("account/login/start", { type: "chatgptDeviceCode" });
        const verificationUrl = safeAuthorizationUrl(result.verificationUrl);
        if (result.type !== "chatgptDeviceCode" || typeof result.loginId !== "string" || !verificationUrl || typeof result.userCode !== "string" || !/^[A-Z0-9-]{4,32}$/i.test(result.userCode)) throw new Error("Invalid native authorization response");
        this.loginId = result.loginId;
        this.state = { engine, phase: "awaiting_user", authenticated: false, verificationUrl, userCode: result.userCode };
      } else {
        await prepareProfileRoot(this.root);
        const child = this.launch(engine, ["auth", "login", "--claudeai"], this.environment(engine), true);
        this.child = child;
        const generation = this.operation;
        let fragment = "";
        const read = (chunk: Buffer) => {
          // Native PTYs emit ANSI control sequences; discard them before extracting URLs.
          // eslint-disable-next-line no-control-regex
          fragment = (fragment + chunk.toString("utf8").replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")).slice(-8192);
          // eslint-disable-next-line no-control-regex
          for (const match of fragment.matchAll(/https:\/\/[^\s<>"\x1b]+/g)) {
            const verificationUrl = safeAuthorizationUrl(match[0]);
            if (verificationUrl) this.state = { engine, phase: "awaiting_user", authenticated: false, verificationUrl };
          }
        };
        child.stdout.on("data", read); child.stderr.on("data", read);
        child.on("error", () => { if (generation === this.operation) this.fail("Native CLI could not start"); });
        child.on("close", (code) => {
          if (this.child === child) this.child = undefined;
          if (generation !== this.operation) return;
          this.clearTimer(); fragment = "";
          if (code === 0) void this.check(engine).catch(() => this.fail()); else this.fail("Native authorization was not completed");
        });
      }
      return this.status();
    } catch { await this.stop(); this.fail(); return this.status(); }
  }
  code(value: unknown) {
    const code = boundedCode(value);
    if (this.state.engine !== "claude_code" || this.state.phase !== "awaiting_user" || !this.child) throw new Error("No native authorization pending");
    this.child.stdin.write(`${code}\n`);
    return this.status();
  }
  async check(engineValue: unknown) {
    const engine = parseEngine(engineValue);
    if (this.child && this.state.phase === "awaiting_user") throw new Error("Authorization is pending");
    if (this.state.engine && this.state.engine !== engine) await this.cancel();
    if (engine === "codex") {
      await this.startCodex();
      const result = await this.rpc("account/read", { refreshToken: true });
      const authenticated = (result.account as Json | undefined)?.type === "chatgpt";
      this.state = { engine, phase: authenticated ? "authenticated" : "idle", authenticated };
    } else {
      await this.stop();
      await prepareProfileRoot(this.root);
      const child = this.launch(engine, ["auth", "status", "--json"], this.environment(engine));
      this.child = child;
      let output = "";
      const authenticated = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), 20_000);
        child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString("utf8"); if (output.length > 8192) child.kill("SIGKILL"); }); child.stderr.resume();
        child.on("error", () => { clearTimeout(timer); resolve(false); });
        child.on("close", (code) => { clearTimeout(timer); if (this.child === child) this.child = undefined; try { const result = JSON.parse(output); resolve(code === 0 && result.loggedIn === true && result.authMethod === "claude.ai"); } catch { resolve(false); } output = ""; });
      });
      // A status timeout or spawn error must retain the physical-stop fence.
      if (this.child === child) {
        try { await this.stop(); }
        catch { this.fail("Native CLI process stop unconfirmed"); throw new Error("Native CLI process stop unconfirmed"); }
      }
      this.state = { engine, phase: authenticated ? "authenticated" : "idle", authenticated };
    }
    return this.status();
  }
  async models(engineValue: unknown) {
    const engine = parseEngine(engineValue);
    if (engine !== "codex" || this.state.phase === "awaiting_user" || this.state.phase === "running") throw new Error("Native catalog unavailable");
    const state = await this.check(engine);
    if (!state.authenticated) throw new Error("Native authentication unavailable");
    const models: unknown[] = [];
    let cursor: string | null = null;
    const seenCursors = new Set<string>();
    for (let page = 0; page < 10; page++) {
      const result = await this.rpc("model/list", { limit: 20, includeHidden: false, ...(cursor ? { cursor } : {}) });
      if (!Array.isArray(result.data) || result.data.length > 20) throw new Error("Native catalog unavailable");
      models.push(...result.data);
      if (result.nextCursor === null || result.nextCursor === undefined) return parseCodexModels(models);
      if (typeof result.nextCursor !== "string" || result.nextCursor.length > 2048 || seenCursors.has(result.nextCursor)) throw new Error("Native catalog unavailable");
      cursor = result.nextCursor; seenCursors.add(cursor);
    }
    throw new Error("Native catalog exceeds page limit");
  }
  async import(value: unknown) { await this.cancel(); await importProfile(this.root, value); return this.status(); }
  async export(engine: unknown) { if (this.state.phase === "running" || this.state.phase === "awaiting_user") throw new Error("Native operation must finish before export"); await this.stop(); return exportProfile(this.root, parseEngine(engine)); }
  async smoke(input: SmokeInput) {
    if (input.engine === "codex" && !this.codexIsolationVerified) throw new Error("Native kernel isolation must pass before a Codex turn");
    const args = claudeSmokeArguments(input);
    const check = await this.check(input.engine);
    if (!check.authenticated) throw new Error("Native subscription authentication required");
    if (input.engine === "codex") {
      const protectedRoot = dirname(this.root);
      const cwd = join(dirname(protectedRoot), `native-fixture-${basename(protectedRoot)}`);
      await mkdir(cwd, { recursive: true, mode: 0o700 });
      const config = {
        ...codexFixtureConfig(protectedRoot),
        mcp_servers: { minddy: { url: input.mcp.url, http_headers: { Authorization: input.mcp.authorization } } },
      };
      const thread = await this.rpc("thread/start", { cwd, approvalPolicy: "never", ephemeral: true, config });
      const threadId = (thread.thread as Json)?.id;
      if (typeof threadId !== "string") throw new Error("Native thread did not start");
      const catalog = await this.rpc("mcpServerStatus/list", { threadId, serverName: "minddy", detail: "toolsAndAuthOnly" });
      const server = Array.isArray(catalog.data) ? catalog.data.find((entry: Json) => entry.name === "minddy") as Json | undefined : undefined;
      const tools = server?.tools && typeof server.tools === "object" ? Object.values(server.tools) as Json[] : [];
      this.diagnostics.registeredTools = Math.min(65535, tools.length);
      this.diagnostics.mcpToolRegistered = tools.some((tool) => tool.name === input.requiredTool);
      if (!this.diagnostics.mcpToolRegistered) throw new Error("Native MCP fixture tool is unavailable");
      this.smokeFixture = input;
      this.state = { engine: input.engine, phase: "running", authenticated: true, toolObserved: false, markerObserved: false };
      this.armDeadline(2 * 60 * 1000);
      await this.rpc("turn/start", { threadId, input: [{ type: "text", text: `Call the Minddy MCP tool ${input.requiredTool} once with {}. Do not use any other tool or read files. After the tool succeeds, reply with exactly ${input.marker}.`, text_elements: [] }] });
      return this.status();
    }
    const child = this.launch(input.engine, args, { ...this.environment(input.engine), MINDDY_NATIVE_MCP_AUTHORIZATION: input.mcp.authorization });
    this.child = child;
    this.state = { engine: input.engine, phase: "running", authenticated: true, toolObserved: false, markerObserved: false };
    this.armDeadline(2 * 60 * 1000);
    let buffer = "";
    child.stderr.resume();
    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      if (buffer.length > 256 * 1024) { void this.stop().catch(() => {}); this.fail("Native protocol exceeded its limit"); return; }
      let index: number;
      while ((index = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
        try {
          const event = JSON.parse(line);
          for (const block of event.message?.content ?? []) {
            if (block.type === "tool_use" && block.name === `mcp__minddy__${input.requiredTool}`) this.state.toolObserved = true;
            if (block.type === "text" && block.text?.trim() === input.marker) this.state.markerObserved = true;
          }
          if (event.type === "result" && event.is_error === false && event.result?.trim() === input.marker) this.state.markerObserved = true;
        } catch { /* Only structured native events affect evidence. */ }
      }
    });
    const generation = this.operation;
    child.on("error", () => { if (generation === this.operation) this.fail("Native CLI could not start"); });
    child.on("close", (code) => {
      if (this.child === child) this.child = undefined;
      if (generation !== this.operation) return;
      this.clearTimer(); buffer = "";
      if (code === 0 && this.state.toolObserved && this.state.markerObserved) this.state.phase = "completed";
      else this.fail("Native MCP smoke did not complete");
    });
    return this.status();
  }
  async isolation(engineValue: unknown) {
    const engine = parseEngine(engineValue);
    if (this.stopping) await this.stopping;
    if (this.child) throw new Error("Native operation must finish before isolation check");
    if (engine === "claude_code") return { engine, supported: true, isolated: true, mechanism: "builtin-tools-disabled" };
    await prepareProfileRoot(this.root);
    const dummyPath = join(this.root, `isolation-${randomUUID()}.txt`);
    await writeFile(dummyPath, "private noncredential isolation fixture", { flag: "wx", mode: 0o600 });
    const parentFile = await open(dummyPath, "r");
    process.env.MINDDY_NATIVE_ISOLATION_SENTINEL = randomBytes(16).toString("hex");
    const child = this.launch("codex", codexIsolationArguments(dirname(this.root), dummyPath, process.pid, parentFile.fd), this.environment("codex"));
    this.child = child;
    child.stdout.resume(); child.stderr.resume();
    let isolated = false;
    let nativeExitCode: number | null = null;
    try {
      isolated = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(false); }, 20_000);
        child.on("error", () => { clearTimeout(timer); resolve(false); });
        child.on("close", (code) => { clearTimeout(timer); nativeExitCode = code; resolve(code === 0); });
      });
    } finally { if (this.child === child) this.child = undefined; await parentFile.close(); delete process.env.MINDDY_NATIVE_ISOLATION_SENTINEL; await rm(dummyPath, { force: true }); }
    this.codexIsolationVerified = isolated;
    return { engine, supported: isolated, isolated, mechanism: "native-kernel-deny-read", nativeExitCode, controllerEnvironmentDenied: isolated, controllerFileDescriptorsDenied: isolated, controllerMemoryDenied: isolated };
  }
}
