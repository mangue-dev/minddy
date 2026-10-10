import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nativeWorkerPaths } from "@/lib/native-agent-worker";
import { layoutForRoot } from "../harness-layout";
import { localHost } from "./local-host";
import { nativeKernelArguments, nativeToolEnvironment, type IsolatedNativeHost } from "./native-isolation";
import { createNativeRuntime, nativeClaudeArguments, nativeCodexConfiguration, nativeReplayPrompt, type NativeRuntime, type NativeRuntimeInput } from "./native-runtime";
import { boundedNativeHistory, runNativeTurn } from "./native-supervisor";
import { nativeWorkerTools, startNativeWorkerMcp } from "./native-worker-mcp";
import { nativeBackgroundRunner } from "./native-background";
import { makeOpencodeDelivery } from "./opencode-delivery";
import { startToolBridge } from "./tool-bridge";
import { importProfile, exportProfile, validateProfile } from "./native-prototype/profile";
import type { ControlPlaneClient } from "./control-plane-client";
import type { VmJob } from "./protocol";

const roots: string[] = [];
const disposers: Array<() => Promise<void>> = [];
afterEach(async () => { await Promise.all(disposers.splice(0).map((close) => close())); await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); vi.restoreAllMocks(); });
function cp(): ControlPlaneClient { return { emit: vi.fn(async () => {}), emitLive: vi.fn(), emitDiff: vi.fn(), recordUsage: vi.fn(async () => {}), heartbeat: async () => true, saveCheckpointQuietly: async () => true, appendJournal: async () => {}, pullSteering: async () => [], pushSteering: vi.fn(async () => {}), hasPendingMessages: async () => false, checkInterrupt: async () => false, clearInterrupt: async () => {}, budgetRemaining: async () => null, syncPlan: async () => {}, callTool: vi.fn(async () => ({ success: true, result: { title: "Owner issue" } })), repoAuthUrl: async () => null, llmKey: async () => null, reportTurn: async () => {} }; }
async function setup(over: Partial<VmJob> = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "minddy-native-worker-test-"))); roots.push(root);
  const layout = layoutForRoot(root, "/fixture/runtime");
  await Promise.all([layout.repoDir, layout.toolOutputDir, layout.typecheckDir, layout.harnessDir].map((dir) => mkdir(dir, { recursive: true })));
  const job = { protocolVersion: 4, engine: "codex", nativeAgent: { engine: "codex", ...nativeWorkerPaths(layout) }, layout, runId: "run", ledgerRunId: "run", projectId: "project", appOrigin: "https://minddy.invalid", model: "unused-native-default", anchor: "issue", interactive: true, chain: false, writesToRepo: true, authUrl: null, subagents: { models: false, favorites: [], maxParallel: 0, allowedIds: [], abovePlanIds: [], maxMultiplier: null }, webSearch: false, webSearchMax: 0, imageInput: false, prInlineComments: 0, editedPaths: [], repoTouched: false, instructions: { paths: [], bytes: 0 }, usageSeqStart: 0, filesFromSha: "", workBranch: "fixture", baseBranch: "main", commitRef: "MIN-676", committer: { name: "Fixture", email: "fixture@example.test" }, bootstrapMs: 0, locale: "en", feature: "agent_code", ...over } as VmJob;
  const plain = localHost(layout);
  const host: IsolatedNativeHost = { ...plain, processIsolation: "sandbox", verifyIsolation: vi.fn(async () => {}), startProcess: () => { throw new Error("Unused fixture operation"); }, close: vi.fn(async () => {}) };
  await mkdir(job.nativeAgent!.privateRoot, { mode: 0o700, recursive: true });
  const profile = { version: 1 as const, engine: "codex" as const, files: [{ path: "auth.json", content: JSON.stringify({ OPENAI_API_KEY: null, tokens: { access_token: "fixture-private-access-token", refresh_token: "fixture-private-refresh-token" } }) }] };
  await writeFile(nativeWorkerPaths(layout).profileImportPath, JSON.stringify(profile), { mode: 0o600 });
  return { job, host, profile, cp: cp() };
}
async function invoke(url: string, token: string, method: string, params = {}) {
  const response = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  return { status: response.status, value: await response.json() as { result?: { content: { text: string }[]; isError?: boolean; tools?: { name: string }[] }; error?: unknown } };
}
const runtimeInput = (root: string): NativeRuntimeInput => ({ cwd: root, privateRoot: join(root, "private"), profileRoot: join(root, "private", "profiles"), anchor: "Trusted Minddy anchor", prompt: "fixture", history: [], mcpUrl: "http://127.0.0.1:1/mcp", mcpToken: "fixture-private-mcp-token", toolNames: ["read_issue"] });

describe("native worker boundary", () => {
  it("denies native profiles and process introspection for every repository subprocess", async () => {
    const { job } = await setup();
    const args = nativeKernelArguments(job, "node", ["fixture.js"]);
    expect(args.join(" ")).toContain(`${JSON.stringify(job.nativeAgent!.privateRoot)}="deny"`);
    expect(args.join(" ")).toContain('"/proc"="deny"'); expect(args.join(" ")).toContain('"/sys"="deny"');
    expect(args.join(" ")).toContain(`${JSON.stringify(job.layout.repoDir)}="write"`);
    expect(nativeKernelArguments({ ...job, writesToRepo: false }, "node", []).join(" ")).toContain(`${JSON.stringify(job.layout.repoDir)}="read"`);
    expect(nativeToolEnvironment("/home", "/tmp")).not.toHaveProperty("CODEX_HOME");
    expect(() => nativeToolEnvironment("/home", "/tmp", { ANTHROPIC_AUTH_TOKEN: "forbidden" })).toThrow();
  });
  it("pins native MCP approval and tools without enabling built-in shell or writes", () => {
    const config = nativeCodexConfiguration(runtimeInput("/fixture"));
    expect(config.features.shell_tool).toBe(false); expect(config.features.view_image).toBe(false);
    expect(config.features.apps).toBe(false); expect(config.features.plugins).toBe(false); expect(config.features.hooks).toBe(false);
    expect(config.mcp_servers.minddy.default_tools_approval_mode).toBe("approve");
    expect(config.permissions.minddy_native_worker.filesystem["/fixture/private"]).toBe("deny");
    const claude = nativeClaudeArguments(runtimeInput("/fixture"));
    expect(claude).toContain("--restricted"); expect(claude).toContain("--strict-mcp-config"); expect(claude).toContain("--disable-slash-commands"); expect(claude).not.toContain("--bare");
    expect(claude[claude.indexOf("--tools") + 1]).toBe(""); expect(claude).toContain("mcp__minddy__read_issue");
  });
  it("bounds and redacts portable context instead of exposing opaque native sessions", () => {
    const history = boundedNativeHistory(Array.from({ length: 100 }, () => ({ role: "user" as const, text: "secret".repeat(4000) })), (value) => value.replaceAll("secret", "[redacted]"));
    expect(history.length).toBeLessThanOrEqual(24); expect(history.reduce((sum, entry) => sum + entry.text.length, 0)).toBeLessThanOrEqual(48_000); expect(JSON.stringify(history)).not.toContain("secret");
    expect(nativeReplayPrompt("new request", history)).toContain("fresh native CLI session");
  });
  it("round-trips only optional Claude account metadata alongside required native authentication", async () => {
    const { job } = await setup();
    const profile = { version: 1 as const, engine: "claude_code" as const, files: [{ path: ".credentials.json", content: JSON.stringify({ claudeAiOauth: { accessToken: "fixture-access", refreshToken: "fixture-refresh" } }) }, { path: ".claude.json", content: JSON.stringify({ oauthAccount: { accountUuid: "fixture" } }) }] };
    await importProfile(job.nativeAgent!.profileRoot, profile); expect(await exportProfile(job.nativeAgent!.profileRoot, "claude_code")).toEqual(profile);
    expect(() => validateProfile({ ...profile, files: [profile.files[1]] })).toThrow();
    expect(() => validateProfile({ ...profile, files: [profile.files[0], profile.files[0]] })).toThrow();
  });
  it("keeps background work in the isolated process wrapper and reads only new bounded output", async () => {
    const { host } = await setup(); let output = "first"; let exitCode: number | null = null;
    const stop = vi.fn(async () => { exitCode = 130; });
    host.startProcess = vi.fn(() => ({ pid: 42, get output() { return output; }, get outputBytes() { return Buffer.byteLength(output); }, get exitCode() { return exitCode; }, done: Promise.resolve({ stdout: "", stderr: "", exitCode: 0 }), stop }));
    const runner = nativeBackgroundRunner(host);
    const started = await runner.start({ jobId: "job-1", invocation: { executable: "node", args: ["server.js"], env: {} }, workdir: "." });
    expect(started.pid).toBe(42); expect(host.startProcess).toHaveBeenCalledWith("node", ["server.js"], expect.objectContaining({ cwd: host.layout.repoDir }));
    expect((await runner.read({ jobId: "job-1", pid: 42, offset: 0 })).chunk).toBe("first"); output += " second";
    expect((await runner.read({ jobId: "job-1", pid: 42, offset: 5 })).chunk).toBe(" second");
    await runner.stop({ jobId: "job-1", pid: 42 }); expect(stop).toHaveBeenCalled(); expect((await runner.read({ jobId: "job-1", pid: 42, offset: 12 })).running).toBe(false);
    await expect(runner.read({ jobId: "job-1", pid: 99, offset: 0 })).rejects.toThrow();
    await expect(runner.start({ jobId: "escape", invocation: { executable: "node", args: [], env: {} }, workdir: "../escape" })).rejects.toThrow();
  });
});

describe("native worker MCP", () => {
  async function server(over: Partial<VmJob> = {}) {
    const context = await setup(over);
    const delivery = makeOpencodeDelivery({ host: context.host, emit: context.cp.emit, filesFromSha: "", remainingMs: () => 60_000 });
    const bridge = await startToolBridge({ job: context.job, cp: context.cp, authorizationToken: "bridge-token", delivery });
    const mcp = await startNativeWorkerMcp({ ...context, bridge, bridgeToken: "bridge-token", token: "mcp-token", delivery, signal: new AbortController().signal, redact: (text) => text.replaceAll("fixture-private-access-token", "[redacted]") });
    disposers.push(mcp.close, bridge.close);
    return { ...context, mcp };
  }
  it("authenticates MCP discovery and forwards actual Minddy tools through the canonical bridge", async () => {
    const { mcp, cp } = await server();
    expect((await invoke(mcp.url, "wrong", "tools/list")).status).toBe(401);
    expect((await invoke(mcp.url, "mcp-token", "tools/list")).value.result?.tools?.some((tool) => tool.name === "read_issue")).toBe(true);
    const result = await invoke(mcp.url, "mcp-token", "tools/call", { name: "read_issue", arguments: { identifier: "MIN-676" } });
    expect(result.value.result?.isError).not.toBe(true); expect(cp.callTool).toHaveBeenCalledWith("read_issue", expect.objectContaining({ args: { identifier: "MIN-676" } }));
    expect(cp.emit).toHaveBeenCalledWith("tool_result", expect.objectContaining({ name: "read_issue", success: true }));
    vi.mocked(cp.callTool).mockResolvedValueOnce({ success: false, result: { ok: false, note: "Explicit handler refusal without an error property" } });
    const refused = await invoke(mcp.url, "mcp-token", "tools/call", { name: "read_issue", arguments: { identifier: "MIN-676" } });
    expect(refused.value.result?.isError).toBe(true); expect(cp.emit).toHaveBeenLastCalledWith("tool_result", expect.objectContaining({ name: "read_issue", success: false }));
  });
  it("uses guarded real edits and commands while refusing escape paths, git metadata and credential files", async () => {
    const { mcp, job, cp } = await server();
    const call = async (name: string, args: Record<string, unknown>) => (await invoke(mcp.url, "mcp-token", "tools/call", { name, arguments: args })).value.result;
    expect((await call("write_file", { path: "fixture.txt", content: "before" }))?.isError).not.toBe(true);
    expect((await call("edit_file", { path: "fixture.txt", old_string: "before", new_string: "after" }))?.isError).not.toBe(true);
    expect(await readFile(join(job.layout.repoDir, "fixture.txt"), "utf8")).toBe("after");
    expect((await call("run_command", { command: "node -e 'process.stdout.write(\"fixture-private-access-token\")'" }))?.content[0].text).toContain("[redacted]");
    const failedCommand = await call("run_command", { command: "node -e 'process.stderr.write(\"Build failed\"); process.exit(7)'" });
    expect(failedCommand?.isError).toBe(true); expect(failedCommand?.content[0].text).toContain("Build failed");
    expect(cp.emit).toHaveBeenLastCalledWith("tool_result", expect.objectContaining({ name: "run_command", success: false, exit_code: 7 }));
    for (const path of ["../escape", ".git/config", ".env", job.nativeAgent!.privateRoot]) expect((await call("read_file", { path }))?.isError).toBe(true);
    await symlink(job.nativeAgent!.privateRoot, join(job.layout.repoDir, "private-link")); expect((await call("read_file", { path: "private-link/auth.json" }))?.isError).toBe(true);
    expect((await call("run_command", { command: "git push origin HEAD" }))?.isError).toBe(true);
  });
  it("exposes commands but refuses repository writes on review workers", async () => {
    const { mcp, job } = await server({ writesToRepo: false });
    const names = nativeWorkerTools(job).map((tool) => tool.name);
    expect(names).toContain("run_command"); expect(names).not.toContain("write_file"); expect(names).not.toContain("list_projects");
    expect(nativeWorkerTools({ ...job, interactive: false }).map((tool) => tool.name)).not.toContain("ask_user");
    expect((await invoke(mcp.url, "mcp-token", "tools/call", { name: "write_file", arguments: { path: "bad", content: "bad" } })).value.result?.isError).toBe(true);
  });
});

describe("native supervisor lifecycle", () => {
  it("imports auth after the kernel gate, uses real MCP, masks secrets and exports only after child shutdown", async () => {
    const context = await setup(); const order: string[] = [];
    context.host.verifyIsolation = async () => { order.push("kernel"); };
    const runtime: NativeRuntime = { start: async (input) => { order.push("start"); expect(await readFile(join(input.profileRoot, "codex", "auth.json"), "utf8")).toContain("fixture-private-access-token"); await invoke(input.mcpUrl, input.mcpToken, "tools/call", { name: "read_issue", arguments: { identifier: "MIN-676" } }); }, async *events() { yield { type: "completed", reply: "fixture-private-access-token completed" }; }, steer: async () => {}, interrupt: async () => {}, close: async () => { order.push("closed"); } };
    const report = await runNativeTurn(context.job, { prompt: "Read the issue", anchorInstructions: "anchor" }, context.cp, { host: context.host, runtime, installCli: async () => { order.push("install"); return "/fixture/bin"; } });
    expect(order).toEqual(["install", "kernel", "start", "closed"]); expect(report.status).toBe("completed"); expect(report.nativeAuthExportReady).toBe(true); expect(report.reply).toBe("[redacted] completed"); expect(JSON.stringify(report)).not.toContain("fixture-private-access-token");
    expect(JSON.parse(await readFile(context.job.nativeAgent!.profileExportPath, "utf8"))).toEqual(context.profile);
    await expect(readFile(nativeWorkerPaths(context.job.layout).profileImportPath)).rejects.toMatchObject({ code: "ENOENT" });
    expect(context.cp.recordUsage).not.toHaveBeenCalled(); expect(report.costUsd).toBe(0); expect(report.checkpoint?.native?.history).toHaveLength(2);
  });
  it("does not import auth or start native inference when kernel isolation fails", async () => {
    const context = await setup(); context.host.verifyIsolation = async () => { throw new Error("failed"); };
    const runtime = { start: vi.fn(), close: vi.fn(async () => {}) } as unknown as NativeRuntime;
    const report = await runNativeTurn(context.job, { prompt: "fixture", anchorInstructions: "anchor" }, context.cp, { host: context.host, runtime, installCli: async () => "/fixture" });
    expect(runtime.start).not.toHaveBeenCalled(); expect(report.status).toBe("error"); expect(report.nativeAuthExportReady).toBe(false);
    expect(await readFile(nativeWorkerPaths(context.job.layout).profileImportPath, "utf8")).toContain("fixture-private-access-token");
  });
  it("exports auth without a paid model turn when the hosted compute cap is exhausted", async () => {
    const context = await setup({ budgetUsd: 0 });
    const runtime = { start: vi.fn(), close: vi.fn(async () => {}) } as unknown as NativeRuntime;
    const report = await runNativeTurn(context.job, { prompt: "fixture", anchorInstructions: "anchor" }, context.cp, { host: context.host, runtime, installCli: async () => "/fixture" });
    expect(runtime.start).not.toHaveBeenCalled(); expect(report.status).toBe("budget_exhausted"); expect(report.nativeAuthExportReady).toBe(true);
  });
  it("terminates a silent native child at the wall deadline and retains portable auth/context", async () => {
    const context = await setup(); let wake: (() => void) | undefined; let closed = false;
    const runtime: NativeRuntime = { start: async () => {}, async *events() { yield { type: "status", phase: "running" }; while (!closed) await new Promise<void>((resolve) => { wake = resolve; }); }, steer: async () => {}, interrupt: vi.fn(async () => {}), close: async () => { closed = true; wake?.(); } };
    const report = await runNativeTurn(context.job, { prompt: "fixture", anchorInstructions: "anchor" }, context.cp, { host: context.host, runtime, installCli: async () => "/fixture", turnDeadlineMs: 30 });
    expect(runtime.interrupt).toHaveBeenCalled(); expect(report.errorCode).toBe("turnTooLong"); expect(report.nativeAuthExportReady).toBe(true); expect(report.checkpoint?.native?.history).toHaveLength(1);
  });
  it("mediates a required question through Numo and pauses without claiming completion", async () => {
    const context = await setup(); let wake: (() => void) | undefined; let closed = false;
    const runtime: NativeRuntime = { start: async (input) => { const result = await invoke(input.mcpUrl, input.mcpToken, "tools/call", { name: "ask_user", arguments: { questions: [{ question: "Which repository behavior should change?", options: [{ label: "Blue", description: "fixture-private-access-token" }] }] } }); expect(result.value.result?.isError).not.toBe(true); }, async *events() { yield { type: "status", phase: "running" }; while (!closed) await new Promise<void>((resolve) => { wake = resolve; }); }, steer: async () => {}, interrupt: async () => {}, close: async () => { closed = true; wake?.(); } };
    const report = await runNativeTurn(context.job, { prompt: "fixture", anchorInstructions: "anchor" }, context.cp, { host: context.host, runtime, installCli: async () => "/fixture" });
    expect(report.status).toBe("interrupted"); expect(report.askedUser).toBe(true); expect(report.nativeAuthExportReady).toBe(true); expect(context.cp.emit).toHaveBeenCalledWith("question", expect.objectContaining({ questions: expect.any(Array) }));
    const history = report.checkpoint!.native!.history;
    expect(history.map((message) => message.role)).toEqual(["user", "assistant"]);
    const resumedPrompt = nativeReplayPrompt("Blue", history);
    expect(resumedPrompt).toContain("Which repository behavior should change?"); expect(resumedPrompt).toContain("Blue"); expect(resumedPrompt).not.toContain("fixture-private-access-token");
  });
  it("preserves only unposted steering after a later native delivery fails", async () => {
    const context = await setup(); let closed = false; let wake: (() => void) | undefined;
    const messages = [{ id: "first", text: "Accepted steering" }, { id: "second", text: "Unposted steering" }];
    context.cp.pullSteering = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce(messages);
    context.cp.hasPendingMessages = async () => true;
    const runtime: NativeRuntime = { start: async () => {}, async *events() { yield { type: "status", phase: "running" }; while (!closed) await new Promise<void>((resolve) => { wake = resolve; }); }, steer: vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("Native transport stopped")), interrupt: async () => {}, close: async () => { closed = true; wake?.(); } };
    const report = await runNativeTurn(context.job, { prompt: "fixture", anchorInstructions: "anchor" }, context.cp, { host: context.host, runtime, installCli: async () => "/fixture", lifecycleBeatMs: 1 });
    expect(report.status).toBe("error"); expect(context.cp.pushSteering).toHaveBeenCalledWith([messages[1]]);
    expect(report.checkpoint?.native?.history.map((message) => message.text)).toEqual(["fixture", "Accepted steering"]);
  });
});

describe("native CLI protocol", () => {
  const fixture = `const {createInterface}=require('node:readline');const send=x=>process.stdout.write(JSON.stringify(x)+'\\n');createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);if(r.id===undefined)return;let result={};if(r.method==='account/read')result={account:{type:'chatgpt'}};if(r.method==='thread/start')result={thread:{id:'thread'}};if(r.method==='mcpServerStatus/list')result={data:[{name:'minddy',tools:{read_issue:{name:'read_issue'}}}]};if(r.method==='turn/start'){result={turn:{id:'turn'}};setTimeout(()=>{send({method:'item/agentMessage/delta',params:{delta:'Native reply'}});send({method:'turn/completed',params:{turn:{status:'completed'}}})},40)}send({id:r.id,result})});`;
  it("negotiates native auth/thread/MCP and receives completion without provider transcripts", async () => {
    const { job } = await setup(); let args: string[] = [];
    const runtime = createNativeRuntime("codex", { spawn: (_engine, cli, env, cwd) => { args = cli; expect(env).not.toHaveProperty("ANTHROPIC_API_KEY"); return spawn(process.execPath, ["-e", fixture], { env, cwd, detached: true, stdio: "pipe" }); } });
    disposers.push(runtime.close); await runtime.start(runtimeInput(job.layout.repoDir));
    const events = []; for await (const event of runtime.events()) { events.push(event); if (event.type === "completed") break; }
    expect(args).toContain("project_doc_max_bytes=0"); expect(events).toContainEqual({ type: "completed", reply: "Native reply" });
  });
  it("refuses a native MCP catalogue that differs from the allowed tool manifest", async () => {
    const { job } = await setup();
    const runtime = createNativeRuntime("codex", { spawn: (_engine, _args, env, cwd) => spawn(process.execPath, ["-e", fixture], { env, cwd, detached: true, stdio: "pipe" }) }); disposers.push(runtime.close);
    await expect(runtime.start({ ...runtimeInput(job.layout.repoDir), toolNames: ["write_file"] })).rejects.toThrow("catalogue");
  });
  it("uses an empty trusted Claude cwd and rejects an unexpected built-in shell catalogue", async () => {
    const { job } = await setup(); let nativeCwd = "";
    const script = `const {createInterface}=require('node:readline');createInterface({input:process.stdin}).once('line',()=>process.stdout.write(JSON.stringify({type:'system',subtype:'init',tools:['Bash'],mcp_servers:[{name:'minddy',status:'connected'}]})+'\\n'));`;
    const runtime = createNativeRuntime("claude_code", { spawn: (_engine, _args, env, cwd) => { nativeCwd = cwd; return spawn(process.execPath, ["-e", script], { env, cwd, detached: true, stdio: "pipe" }); } }); disposers.push(runtime.close);
    const input = runtimeInput(job.layout.repoDir); await runtime.start(input);
    for await (const event of runtime.events()) if (event.type === "failed") { expect(event.nativeCode).toBe("nativeMcpUnavailable"); break; }
    expect(nativeCwd).toBe(join(input.privateRoot, "cli-cwd")); expect(nativeCwd).not.toBe(input.cwd);
  });
});
