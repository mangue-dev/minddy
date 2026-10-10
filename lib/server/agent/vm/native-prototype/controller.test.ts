import { spawn } from "node:child_process";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { boundedCode, claudeSmokeArguments, CODEX_CAPABILITY_DROP_ARGS, codexFixtureConfig, codexIsolationArguments, NativeController, safeAuthorizationUrl, safeNativeError, type NativeSpawn } from "./controller";
import { exportProfile, importProfile, prepareProfileRoot, validateProfile } from "./profile";
import { NativeToolRelay } from "./relay";
import { startNativeController } from "./main";
import { reservePort } from "../free-port";

const fixture = join(import.meta.dirname, "fixture.mjs");
const roots: string[] = [];
const controllers: NativeController[] = [];
const launch: NativeSpawn = (engine, args, env) => spawn(process.execPath, [fixture, engine, JSON.stringify(args)], { env, detached: true, stdio: "pipe" });
async function setup() {
  const base = await mkdtemp(join(tmpdir(), "minddy-native-fixture-")); roots.push(base);
  const root = join(base, "private");
  const controller = new NativeController(root, launch); controllers.push(controller);
  return { root, controller };
}
const mcp = { url: "http://127.0.0.1:8787/mcp", authorization: "Bearer fixture-authorization" };
const smoke = { mcp, requiredTool: "minddy_list_projects", marker: "MINDDY_FIXTURE_OK" };
afterEach(async () => { await Promise.all(controllers.splice(0).map((controller) => controller.cancel())); await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("private native credential lifecycle", () => {
  it("round-trips only the allowlisted native subscription file", async () => {
    const { root } = await setup();
    const profile = { version: 1 as const, engine: "codex" as const, files: [{ path: "auth.json", content: JSON.stringify({ OPENAI_API_KEY: null, tokens: { access_token: "fake-access", refresh_token: "fake-refresh" } }) }] };
    await importProfile(root, profile);
    expect(await exportProfile(root, "codex")).toEqual(profile);
    expect(() => validateProfile({ ...profile, files: [{ ...profile.files[0], path: "../auth.json" }] })).toThrow();
    expect(() => validateProfile({ ...profile, files: [{ path: "auth.json", content: '{"OPENAI_API_KEY":"fake"}' }] })).toThrow();
  });
  it("rejects symlinked exports and oversized profiles", async () => {
    const { root } = await setup(); await prepareProfileRoot(root);
    await writeFile(join(root, "other.json"), "{}");
    await symlink(join(root, "other.json"), join(root, "codex", "auth.json"));
    await expect(exportProfile(root, "codex")).rejects.toThrow();
    expect(() => validateProfile({ version: 1, engine: "codex", files: [{ path: "auth.json", content: " ".repeat(65537) }] })).toThrow();
  });
  it("rejects a symlinked native profile directory before importing credentials", async () => {
    const { root } = await setup(); await prepareProfileRoot(root);
    await rm(join(root, "codex"), { recursive: true });
    await symlink(join(root, "claude_code"), join(root, "codex"));
    await expect(prepareProfileRoot(root)).rejects.toThrow("profile directory");
  });
  it("uses native device login and exposes no native identity or transcript", async () => {
    const { controller } = await setup();
    expect(await controller.login("codex")).toMatchObject({ phase: "awaiting_user", userCode: "ABCD-EFGH" });
    await vi.waitFor(() => expect(controller.status().phase).toBe("authenticated"));
    expect(JSON.stringify(await controller.check("codex"))).not.toContain("private-fixture");
    expect(await controller.cancel()).toMatchObject({ phase: "cancelled" });
  });
  it("keeps Claude authorization in a bounded live child until provider code input", async () => {
    const { controller, root } = await setup();
    await controller.login("claude_code");
    await vi.waitFor(() => expect(controller.status().verificationUrl).toBe("https://claude.ai/oauth/authorize?state=fixture"));
    expect(JSON.stringify(controller.status())).not.toContain("secret");
    expect(() => controller.code("fake\nsecond command")).toThrow();
    controller.code("native-fixture-code");
    await vi.waitFor(() => expect(controller.status().phase).toBe("authenticated"));
    expect((await exportProfile(root, "claude_code")).files[0].path).toBe(".credentials.json");
  });
  it("runs Codex MCP fixture with denied credential paths and no sandbox override", async () => {
    const { controller } = await setup();
    await expect(controller.smoke({ engine: "codex", ...smoke })).rejects.toThrow("kernel isolation");
    expect(await controller.isolation("codex")).toMatchObject({ isolated: true });
    await controller.smoke({ engine: "codex", ...smoke });
    await vi.waitFor(() => expect(controller.status()).toMatchObject({ phase: "completed", toolObserved: true, markerObserved: true }));
  });
  it("refuses Codex turns when the kernel isolation probe fails", async () => {
    const { root } = await setup();
    const controller = new NativeController(root, (_engine, _args, env) => spawn(process.execPath, ["-e", "process.exit(41)"], { env, detached: true, stdio: "pipe" })); controllers.push(controller);
    expect(await controller.isolation("codex")).toMatchObject({ supported: false, isolated: false });
    await expect(controller.smoke({ engine: "codex", ...smoke })).rejects.toThrow("kernel isolation");
  });
  it("refuses an inference turn when the native MCP catalog lacks the fixture tool", async () => {
    const { root } = await setup();
    const controller = new NativeController(root, (engine, args, env) => spawn(process.execPath, [fixture, engine, JSON.stringify(args), "empty-mcp-catalog"], { env, detached: true, stdio: "pipe" })); controllers.push(controller);
    expect(await controller.isolation("codex")).toMatchObject({ isolated: true });
    await expect(controller.smoke({ engine: "codex", ...smoke })).rejects.toThrow("fixture tool is unavailable");
    expect(controller.status().diagnostics).toMatchObject({ rpcMethod: "mcpServerStatus/list", registeredTools: 0, mcpToolRegistered: false });
  });
  it("runs Claude MCP fixture with native builtin tools disabled", async () => {
    const { controller } = await setup();
    await controller.smoke({ engine: "claude_code", ...smoke });
    await vi.waitFor(() => expect(controller.status()).toMatchObject({ phase: "completed", toolObserved: true, markerObserved: true }));
    const args = claudeSmokeArguments({ engine: "claude_code", ...smoke });
    expect(args[args.indexOf("--tools") + 1]).toBe("");
    expect(args).toContain("--strict-mcp-config");
    expect(args.join(" ")).not.toContain(mcp.authorization);
  });
});

describe("native prototype input boundaries", () => {
  it("serves authenticated stateless MCP and completes owner tool calls over HTTP", async () => {
    const { controller, root } = await setup();
    const port = await reservePort();
    const token = "fixture-controller-capability-1234567890";
    const { server, relay, mcpToken } = startNativeController({ root, token, port, controller });
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const url = `http://127.0.0.1:${port}`;
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const mcpHeaders = { Authorization: `Bearer ${mcpToken}`, "Content-Type": "application/json" };
    relay.configure([{ name: "minddy_list_projects", description: "List projects", inputSchema: { type: "object" } }], "minddy_list_projects");
    try {
      expect((await fetch(`${url}/status`)).status).toBe(401);
      expect((await fetch(`${url}/status`, { headers: mcpHeaders })).status).toBe(401);
      const init = await fetch(`${url}/mcp`, { method: "POST", headers: mcpHeaders, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }) });
      expect(await init.json()).toMatchObject({ id: 1, result: { capabilities: { tools: {} } } });
      const call = fetch(`${url}/mcp`, { method: "POST", headers: mcpHeaders, body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "minddy_list_projects", arguments: {} } }) });
      await vi.waitFor(() => expect(relay.status()).toHaveLength(1));
      const status = await (await fetch(`${url}/status`, { headers })).json();
      expect(status.pendingTools[0]).toMatchObject({ name: "minddy_list_projects", args: {} });
      const completion = await fetch(`${url}/tool-result`, { method: "POST", headers, body: JSON.stringify({ id: status.pendingTools[0].id, result: { content: [{ type: "text", text: "Verified owner project" }] } }) });
      expect(completion.status).toBe(200);
      expect(await (await call).json()).toMatchObject({ id: 2, result: { content: [{ text: "Verified owner project" }] } });
    } finally { relay.cancel(); server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
  });
  it("admits only bounded provider authorization URLs and codes", () => {
    for (const url of ["https://evil.invalid/auth", "https://auth.openai.com/auth?access_token=fake", "https://auth.openai.com/auth#token", "https://auth.openai.com:444/auth", "http://claude.ai/auth"]) expect(safeAuthorizationUrl(url)).toBeUndefined();
    expect(safeAuthorizationUrl("https://auth.openai.com/codex/device")).toBeDefined();
    expect(() => boundedCode("fake\rcommand")).toThrow();
  });
  it("retains only native error enums and bounded HTTP status without provider text", () => {
    expect(safeNativeError({ responseStreamConnectionFailed: { httpStatusCode: 401, message: "private fixture" } })).toEqual({ errorCode: "responseStreamConnectionFailed", httpStatus: 401 });
    expect(safeNativeError("private fixture")).toEqual({});
    expect(safeNativeError({ privateFixture: { httpStatusCode: 401 } })).toEqual({});
    expect(safeNativeError({ httpConnectionFailed: { httpStatusCode: 9000 } })).toEqual({ errorCode: "httpConnectionFailed" });
  });
  it("negotiates supported streamable MCP versions and advertises the read-only fixture", async () => {
    const relay = new NativeToolRelay();
    relay.configure([{ name: "minddy_list_projects", description: "List projects", inputSchema: { type: "object" } }], "minddy_list_projects");
    expect(await relay.request({ id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } })).toMatchObject({ result: { protocolVersion: "2025-03-26" } });
    expect(await relay.request({ id: 2, method: "tools/list" })).toMatchObject({ result: { tools: [{ annotations: { readOnlyHint: true, destructiveHint: false } }] } });
    expect(await relay.request({ id: 3, method: "resources/list" })).toMatchObject({ error: { code: -32601 } });
    expect(relay.diagnosticStatus()).toEqual({ initialized: 1, listed: 1, calls: 0, completed: 0, unsupportedMethods: 1 });
  });
  it("protects all native profile files including newly written files", () => {
    expect(codexFixtureConfig("/private/profiles")).toMatchObject({ default_permissions: "minddy_native_fixture", permissions: { minddy_native_fixture: { filesystem: { "/private/profiles": "deny", "/proc": "deny", "/sys": "deny" } } }, features: { shell_tool: false, code_mode: false, view_image: false } });
  });
  it("probes the exact managed profile and controller process surfaces without capabilities", () => {
    const args = codexIsolationArguments("/private", "/private/profiles/probe.txt", 1234, 19);
    expect(args).toContain('default_permissions="minddy_native_fixture"');
    expect(args).toContain('permissions.minddy_native_fixture.filesystem={":root"="read","/private"="deny","/proc"="deny","/sys"="deny"}');
    expect(args.slice(-6)).toEqual(["/private/profiles/probe.txt", "/private/control.cjs", "/private/transport", "/proc/1234/environ", "/proc/1234/fd/19", "/proc/1234/mem"]);
    expect(CODEX_CAPABILITY_DROP_ARGS).toEqual(["--bounding-set=-all", "--inh-caps=-all", "--ambient-caps=-all", "--no-new-privs", "--"]);
  });
  it("relays only declared MCP tools to the authenticated owner executor", async () => {
    const relay = new NativeToolRelay();
    relay.configure([{ name: "minddy_list_projects", description: "List projects", inputSchema: { type: "object", properties: {} } }], "minddy_list_projects");
    const result = relay.request({ id: 7, method: "tools/call", params: { name: "minddy_list_projects", arguments: {} } });
    const pending = relay.status()[0];
    expect(pending.name).toBe("minddy_list_projects");
    relay.complete(pending.id, { content: [{ type: "text", text: "Owner project fixture" }] });
    expect(await result).toMatchObject({ id: 7, result: { content: [{ text: "Owner project fixture" }] } });
    expect(relay.status()).toEqual([]);
    await expect(relay.request({ id: 8, method: "tools/call", params: { name: "minddy_delete_project" } })).rejects.toThrow();
  });
  it("cancels pending native MCP calls without retaining their arguments", async () => {
    const relay = new NativeToolRelay();
    relay.configure([{ name: "minddy_list_projects", description: "List projects", inputSchema: { type: "object" } }], "minddy_list_projects");
    const result = relay.request({ id: 7, method: "tools/call", params: { name: "minddy_list_projects" } });
    relay.cancel();
    expect(await result).toMatchObject({ result: { isError: true } });
    expect(relay.status()).toEqual([]);
  });
});
