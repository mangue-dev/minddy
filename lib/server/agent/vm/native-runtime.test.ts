import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { afterEach, expect, it } from "vitest";
import { createNativeRuntime, type NativeEvent, type NativeRuntime } from "./native-runtime";

const runtimes: NativeRuntime[] = [];
afterEach(async () => { await Promise.all(runtimes.splice(0).map((runtime) => runtime.close())); });
const input = { cwd: "/fixture", privateRoot: "/fixture/private", profileRoot: "/fixture/profiles",
  anchor: "Fixture anchor", prompt: "Inspect the fixture", history: [],
  mcpUrl: "http://127.0.0.1:1/mcp", mcpToken: "synthetic-token", toolNames: ["read_issue"] };

function fixture(onStart: (id: string, send: (value: unknown) => void, respond: () => void) => void) {
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(),
    pid: undefined, kill: () => { queueMicrotask(() => child.emit("close", 0)); return true; },
  });
  const requests: Array<{ method: string; params: Record<string, unknown> }> = [];
  const send = (value: unknown) => child.stdout.write(`${JSON.stringify(value)}\n`);
  let turns = 0;
  child.stdin.on("data", (chunk: Buffer) => {
    const request = JSON.parse(chunk.toString());
    if (request.id === undefined) return;
    requests.push(request);
    const result = request.method === "account/read" ? { account: { type: "chatgpt" } }
      : request.method === "thread/start" ? { thread: { id: "thread" } }
      : request.method === "mcpServerStatus/list" ? { data: [{ name: "minddy", tools: { read_issue: {} } }] }
      : request.method === "turn/start" ? { turn: { id: `turn-${++turns}` } } : {};
    const respond = () => send({ id: request.id, result });
    queueMicrotask(() => {
      if (request.method === "turn/start") onStart(`turn-${turns}`, send, respond);
      else respond();
    });
  });
  const runtime = createNativeRuntime("codex", { spawn: () => child as unknown as ChildProcessWithoutNullStreams });
  runtimes.push(runtime);
  return { runtime, requests, send };
}
const message = (id: string, text: string, threadId = "thread") => ({ method: "item/completed",
  params: { threadId, turnId: id, item: { type: "agentMessage", text } } });
const complete = (id: string, threadId = "thread") => ({ method: "turn/completed",
  params: { threadId, turn: { id, status: "completed" } } });
async function completion(runtime: NativeRuntime): Promise<NativeEvent[]> {
  const events: NativeEvent[] = [];
  for await (const event of runtime.events()) {
    events.push(event);
    if (event.type === "completed" || event.type === "failed") break;
  }
  return events;
}

it("ignores foreign threads and late prior-turn messages, errors and completions during repair", async () => {
  const { runtime } = fixture((id, send, respond) => {
    respond();
    queueMicrotask(() => {
      if (id === "turn-2") {
        send(message("turn-1", "Stale reply")); send(complete("turn-1"));
        send(message(id, "Foreign reply", "other-thread")); send(complete(id, "other-thread"));
        send({ method: "error", params: { threadId: "thread", turnId: "turn-1", willRetry: false } });
      }
      send(message(id, id === "turn-1" ? "I will inspect the repository." : "Inspection finished."));
      send(complete(id));
    });
  });
  await runtime.start(input);
  expect((await completion(runtime)).at(-1)).toEqual({ type: "completed", reply: "I will inspect the repository." });
  await runtime.steer("Finish the inspection");
  const events = await completion(runtime);
  expect(events.at(-1)).toEqual({ type: "completed", reply: "Inspection finished." });
  expect(JSON.stringify(events)).not.toMatch(/Stale|Foreign/);
});

it("does not resurrect a completed turn when its start response arrives after notifications", async () => {
  const { runtime, requests } = fixture((id, send, respond) => {
    send({ method: "turn/started", params: { threadId: "thread", turn: { id } } });
    send(message(id, "Inspection finished.")); send(complete(id)); respond();
  });
  await runtime.start(input); await completion(runtime);
  await runtime.steer("Continue with another inspection");
  expect(requests.filter((request) => request.method === "turn/start")).toHaveLength(2);
  expect(requests.some((request) => request.method === "turn/steer")).toBe(false);
  expect((await completion(runtime)).at(-1)).toEqual({ type: "completed", reply: "Inspection finished." });
});

it("checks the imported account without a proactive token refresh before MCP negotiation", async () => {
  const { runtime, requests } = fixture((_id, _send, respond) => respond());
  await runtime.start(input);
  expect(requests.find((request) => request.method === "account/read")?.params).toEqual({ refreshToken: false });
  expect(requests.map((request) => request.method)).toEqual([
    "initialize", "account/read", "thread/start", "mcpServerStatus/list", "turn/start",
  ]);
});
