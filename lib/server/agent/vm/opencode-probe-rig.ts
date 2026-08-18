import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import { OPENCODE_VERSION } from "./opencode-version";

/**
 * THE SHARED DECOR OF PERMISSION PROBES (MIN-362).
 *
 * This module is not loaded by ANY production path: it only exists for
 * [opencode-permissions.probe.test.ts](opencode-permissions.probe.test.ts) and
 * [opencode-wait.probe.test.ts](opencode-wait.probe.test.ts), which measure the
 * behavior of the true binary `opencode-ai@${OPENCODE_VERSION}` and keep these
 * measurements from bump to bump. He lives here, next to them, because the setting
 * IS the difficult half of the measurement — and a setting copied into two
 * files is drifting.
 *
 * ─────────────────────── ──────────────────────── ──────────────────────────────
 * THE FAKE SUPPLIER, AND WHY IT COSTS NOTHING
 *
 * What we measure is not the model: it's what opencode does AROUND a
 * tool call — what permission it publishes, in what order, what a “yes”
 * covers, what a `deny` prevents. A real model would make it all
 * non-deterministic (it chooses its tools) and paid. `startProvider` therefore serves
 * an OpenAI-compatible `/v1/chat/completions` which makes EXACTLY the call to
 * tool that we put in the queue, in SSE, as would OpenRouter.
 *
 * ITS LIMIT, AND IT MATTERS: the fake provider has **finished its flow** before
 * the tool executes. So it can't say anything about a session whose model
 * is still waiting on the other side of an open connection — that's what
 * `opencode-wait.probe.test.ts` will fetch with a real provider.
 *
 * ⚠ EACH TOOL RESULT REMINDS IT SUPPLIER. A queue of three turns does not
 * therefore require three prompts: a single prompt unrolls all three.
 * This is what allows you to chain “request → response → new request” in
 * a single turn, and what causes a poorly sized queue to shift everything.
 *
 * ⚠ `realpathSync` ON THE TEMPORARY FOLDER, and this is not flirtatious:
 * `/var/folders/…` is a link to `/private/var/…` on macOS, opencode resolves
 * the path of its session, and a `write` targeting the unresolved form is seen
 * as OUT of the repository — the probe then measures `external_directory` believing
 * to measure `edit`. Two measurements were wrong before we noticed.
 */

/** A tool call, such as the model would issue. */
export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

/** A scripted round: either tool calls, or text which ends the round. */
export type ProviderTurn =
  | { tools: ToolCall[]; text?: undefined }
  | { text: string; tools?: undefined };

export interface FakeProvider {
  /** To be placed in `options.baseURL` of the opencode config. */
  url: string;
  /** The line of turns to serve. Empty → the supplier closes the round. */
  queue: ProviderTurn[];
  /** The request bodies received, in order — this is where the offered tools live. */
  seen: string[];
  /** The names of tools offered to the model in the last query seen. */
  offeredTools(): string[];
  close(): void;
}

/**
 * An OpenAI-compatible provider that renders what it is told to render.
 *
 * The port is chosen by the kernel (`listen(0)`): two probes launched in
 * in parallel do not compete for anything.
 */
export function startProvider(turns: ProviderTurn[] = []): Promise<FakeProvider> {
  const seen: string[] = [];
  const queue = [...turns];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      seen.push(body);
      if (!req.url?.includes("chat/completions")) {
        res.writeHead(404, { "content-type": "application/json" }).end("{}");
        return;
      }
      const turn = queue.shift() ?? { text: "done" };
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      const frame = { id: "probe", object: "chat.completion.chunk", created: 1, model: "probe" };
      const send = (payload: unknown) => res.write(`data: ${JSON.stringify(payload)}\n\n`);
      if (turn.tools) {
        send({
          ...frame,
          choices: [
            {
              index: 0,
              delta: {
                role: "assistant",
                content: null,
                tool_calls: turn.tools.map((tool, i) => ({
                  index: i,
                  id: `call_${i}_${seen.length}`,
                  type: "function",
                  function: { name: tool.name, arguments: JSON.stringify(tool.args) },
                })),
              },
              finish_reason: null,
            },
          ],
        });
        send({ ...frame, choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] });
      } else {
        send({
          ...frame,
          choices: [{ index: 0, delta: { role: "assistant", content: turn.text }, finish_reason: null }],
        });
        send({ ...frame, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] });
      }
      send({ ...frame, choices: [], usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 } });
      res.write("data: [DONE]\n\n");
      res.end();
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}/v1`,
        queue,
        seen,
        offeredTools() {
          const last = seen.at(-1);
          if (!last) return [];
          const parsed = JSON.parse(last) as { tools?: Array<{ function?: { name?: string } }> };
          return (parsed.tools ?? []).map((t) => t.function?.name ?? "?").sort();
        },
        close: () => server.close(),
      });
    });
  });
}

/**
 * The binary, installed once and for all.
 *
 * `MDY_OPENCODE_BIN` short-circuits the installation: 144 MB per `npm i`, that's
 * 40 s that we don't want to pay for each write iteration of a probe.
 */
export function installOpencode(root: string): string {
  const given = process.env.MDY_OPENCODE_BIN;
  if (given) return given;
  const version = process.env.MDY_OPENCODE_VERSION ?? OPENCODE_VERSION;
  fs.writeFileSync(path.join(root, "package.json"), '{"name":"probe","private":true}');
  execFileSync("npm", ["i", "--no-audit", "--no-fund", `opencode-ai@${version}`], {
    cwd: root,
    stdio: "ignore",
  });
  return path.join(root, "node_modules", ".bin", "opencode");
}

/**
 * Creds live in `.env`; vitest doesn't load it on its own.
 *
 * Only the REAL provider wait probe needs it — measurements from
 * permission don't spend any models.
 */
export function loadEnv(): void {
  const file = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!match) continue;
    if (process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

/** A probe directory, RESOLVED PATH (see the warning at the top of the file). */
export function probeRoot(tag: string): string {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `mdy-probe-${tag}-`)));
}

/** A minimal git repository, with one commit — opencode wants a session in a repository. */
export function makeRepo(root: string): string {
  const repo = path.join(root, "repo");
  fs.mkdirSync(repo, { recursive: true });
  const git = (args: string[]) =>
    execFileSync("git", ["-c", "user.email=a@b", "-c", "user.name=probe", ...args], { cwd: repo });
  git(["init", "-q"]);
  fs.writeFileSync(path.join(repo, "a.txt"), "hi\n");
  git(["add", "-A"]);
  git(["commit", "-qm", "init"]);
  return repo;
}

/** The configuration of a probe tower: our provider, and what we want to measure around it. */
export function probeConfig(
  providerUrl: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    provider: {
      probe: {
        npm: "@ai-sdk/openai-compatible",
        name: "probe",
        options: { baseURL: providerUrl, apiKey: "placeholder" },
        models: { model: { name: "model", tool_call: true } },
      },
    },
    model: "probe/model",
    small_model: "probe/model",
    ...extra,
  };
}

/** An event from the `/event` stream, as it arrives. */
export interface ProbeEvent {
  type: string;
  properties: Record<string, any>;
}

export interface ProbeServer {
  url: string;
  repo: string;
  root: string;
  proc: ChildProcess;
  events: ProbeEvent[];
  /** Published permission requests, in order. */
  asks(sessionId?: string): Array<Record<string, any>>;
  /** The LAST known state of each tool call. */
  toolParts(): Array<{ tool: string; status: string; error: string }>;
  /** Have we seen the session go back to rest? */
  sawIdle(): boolean;
  post(route: string, body?: unknown): Promise<{ status: number; body: any }>;
  get(route: string): Promise<{ status: number; body: any }>;
  createSession(title: string, permission?: unknown): Promise<string>;
  prompt(sessionId: string, text?: string): Promise<void>;
  stop(): void;
}

/**
 * Mount an opencode server on a new repository, and plug in the event collector.
 *
 * `HOME` points to the root of the probe: the patterns in `~` then become
 * measurable without ever touching the real home of who launches the probe.
 */
export async function startProbeServer(opts: {
  bin: string;
  tag: string;
  config: Record<string, unknown>;
  /** Reuse an existing decor (restart: same DB, same repository). */
  reuse?: { root: string; repo: string };
  /**
 * PLUS environment variables, placed on the server (MIN-364, batch 9).
 *
 * They go here rather than in the `process.env` of the probe because the
 * opencode discovery is SAVED on first access: measure a
 * `OPENCODE_DISABLE_*` asks to restart the server, and a `process.env`
 * restored in the meantime would have made the measurement silent — a probe that says "yes,
 * it's cut" on a server where nothing was set.
 */
  env?: Record<string, string>;
}): Promise<ProbeServer> {
  const root = opts.reuse?.root ?? probeRoot(opts.tag);
  const repo = opts.reuse?.repo ?? makeRepo(root);
  const port = await reserveProbePort();
  const proc = spawn(opts.bin, ["serve", "--port", String(port), "--hostname", "127.0.0.1"], {
    cwd: repo,
    env: {
      ...process.env,
      HOME: root,
      XDG_CONFIG_HOME: path.join(root, "config"),
      OPENCODE_CONFIG_CONTENT: JSON.stringify(opts.config),
      OPENCODE_DB: path.join(root, "probe.db"),
      OPENCODE_DISABLE_AUTOUPDATE: "1",
      OPENCODE_DISABLE_MODELS_FETCH: "1",
      ...opts.env,
    },
    stdio: "ignore",
  });

  const url = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i = 0; i < 150 && !ready; i++) {
    await sleep(200);
    ready = await fetch(`${url}/global/health`).then(
      (r) => r.ok,
      () => false,
    );
  }
  if (!ready) {
    proc.kill("SIGKILL");
    throw new Error(`opencode n'a pas démarré sur ${url}`);
  }

  const events: ProbeEvent[] = [];
  const abort = new AbortController();
  void streamEvents(url, repo, abort.signal, (event) => events.push(event));

  const route = (p: string) =>
    `${url}${p}${p.includes("?") ? "&" : "?"}directory=${encodeURIComponent(repo)}`;
  const call = async (p: string, init?: RequestInit) => {
    const res = await fetch(route(p), init);
    const text = await res.text();
    return { status: res.status, body: text && !text.startsWith("<") ? JSON.parse(text) : null };
  };

  return {
    url,
    repo,
    root,
    proc,
    events,
    asks: (sessionId?: string) =>
      events
        .filter((e) => e.type === "permission.asked")
        .map((e) => e.properties)
        .filter((p) => !sessionId || p.sessionID === sessionId),
    toolParts() {
      const byCall = new Map<string, any>();
      for (const event of events) {
        if (event.type !== "message.part.updated") continue;
        const part = event.properties.part;
        if (part?.type === "tool") byCall.set(part.callID, part);
      }
      return [...byCall.values()].map((part) => ({
        tool: part.tool as string,
        status: part.state?.status as string,
        error: (part.state?.error ?? "") as string,
      }));
    },
    sawIdle: () =>
      events.some((e) => e.type === "session.idle") ||
      events.some((e) => e.type === "session.status" && e.properties.status?.type === "idle"),
    post: (p: string, body?: unknown) =>
      call(p, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body ?? {}),
      }),
    get: (p: string) => call(p),
    async createSession(title: string, permission?: unknown) {
      const created = await call("/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(permission ? { title, permission } : { title }),
      });
      if (created.status !== 200) throw new Error(`création de session: ${created.status}`);
      return created.body.id as string;
    },
    async prompt(sessionId: string, text = "go") {
      await call(`/session/${sessionId}/prompt_async`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parts: [{ type: "text", text }] }),
      });
    },
    stop() {
      abort.abort();
      proc.kill("SIGKILL");
    },
  };
}

/** Waits for a condition to become true, or returns `false` to the end of the cap. */
export async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 15_000,
  stepMs = 200,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await sleep(stepMs);
  }
  return await Promise.resolve(predicate());
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Waits until the provider has FUCKED DOWN — no more requests since
 * `quietMs`.
 *
 * To be called between two metrics that share a queue. The trap, measured: the
 * result of a tool (a permission response, a refusal) calls back the
 * supplier, and this call arrives AFTER we have handed over. Without this
 * wait, it consumes the turn of the NEXT measure - which then sees nothing coming. Recognizable symptom: one out of two measurements falls empty.
 */
export async function settleProvider(
  provider: FakeProvider,
  quietMs = 800,
  timeoutMs = 15_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let seen = provider.seen.length;
  let quietSince = Date.now();
  while (Date.now() < deadline) {
    await sleep(150);
    if (provider.seen.length !== seen) {
      seen = provider.seen.length;
      quietSince = Date.now();
      continue;
    }
    if (Date.now() - quietSince >= quietMs) return;
  }
}

/** A tool `bash` call, as the model would issue it. */
export const bash = (command: string, extra: Record<string, unknown> = {}): ToolCall => ({
  name: "bash",
  args: { command, ...extra },
});

/** A call to tool `write` — the path is ABSOLUTE, like in a real model. */
export const write = (filePath: string, content = "x\n"): ToolCall => ({
  name: "write",
  args: { filePath, content },
});

async function reserveProbePort(): Promise<number> {
  const { reservePort } = await import("./free-port");
  return await reservePort();
}

async function streamEvents(
  url: string,
  repo: string,
  signal: AbortSignal,
  sink: (event: ProbeEvent) => void,
): Promise<void> {
  try {
    const res = await fetch(`${url}/event?directory=${encodeURIComponent(repo)}`, { signal });
    if (!res.body) return;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        try {
          sink(JSON.parse(line.slice(5).trim()) as ProbeEvent);
        } catch {
          // A truncated frame is not a probe failure.
        }
      }
    }
  } catch {
    // The flow dies with the server: this is the normal end of a probe.
  }
}
