import { createServer, type ServerResponse } from "node:http";
import { once } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import { startLlmProxy, type LlmProxy } from "./llm-proxy";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });

async function fixture(headers: boolean) {
  const connections = new Set<ServerResponse>();
  let opened = 0;
  let closed = 0;
  const server = createServer(async (request, response) => {
    for await (const _chunk of request) { /* Consume the completion request. */ }
    opened++;
    connections.add(response);
    response.once("close", () => { connections.delete(response); closed++; });
    if (headers) {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write('data: {"id":"gen-cancel","model":"fixture","choices":[{"delta":{"content":"partial"}}]}\n\n');
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as { port: number };
  cleanup.push(async () => { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); });
  const proxy = await startLlmProxy({
    job: { baseUrl: `http://127.0.0.1:${address.port}/v1`, provider: "generic", reasoningLevel: "off" },
    fetchImpl: fetch,
  });
  cleanup.push(() => proxy.close());
  return { proxy, connections, opened: () => opened, closed: () => closed };
}

async function until(predicate: () => boolean) {
  const deadline = Date.now() + 1500;
  while (!predicate() && Date.now() < deadline) await new Promise(r => setTimeout(r, 10));
  expect(predicate()).toBe(true);
}
function completion(proxy: LlmProxy, signal: AbortSignal) {
  return fetch(`${proxy.url}/chat/completions`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "fixture", stream: true, messages: [] }), signal,
  });
}

describe("real completion socket cancellation", () => {
  it.each([false, true])("closes the provider socket on client disconnect (headers=%s)", async (headers) => {
    const h = await fixture(headers);
    const controller = new AbortController();
    const request = completion(h.proxy, controller.signal).catch(() => null);
    await until(() => h.opened() === 1);
    if (headers) await (await request)?.body?.getReader().read();
    const stoppedAt = Date.now();
    controller.abort();
    await until(() => h.closed() === 1);
    expect(Date.now() - stoppedAt).toBeLessThan(1500);
    await h.proxy.settle(200);
    expect(h.connections.size).toBe(0);
    if (headers) expect(h.proxy.drain()).toMatchObject([{ id: "gen-cancel", usage: null, costUsd: null }]);
    await request;
  });

  it("cancels parent and child generations together before engine shutdown", async () => {
    const h = await fixture(true);
    const controllers = [new AbortController(), new AbortController(), new AbortController()];
    const requests = controllers.map(c => completion(h.proxy, c.signal).catch(() => null));
    await until(() => h.opened() === 3);
    await Promise.all(requests);
    h.proxy.cancel();
    await until(() => h.closed() === 3);
    expect(h.connections.size).toBe(0);
    const retry = await completion(h.proxy, new AbortController().signal);
    expect(retry.status).toBe(409);
    expect(h.opened()).toBe(3);
    controllers.forEach(c => c.abort());
  });
});
