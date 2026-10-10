import { createServer, type IncomingMessage } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { NativeController, type SmokeInput } from "./controller";
import { PROFILE_LIMIT } from "./profile";
import { NativeToolRelay } from "./relay";

async function body(request: IncomingMessage) {
  let length = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    length += chunk.length;
    if (length > PROFILE_LIMIT + 8192) throw new Error("Request too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

export function startNativeController(options: { root: string; token: string; port: number; controller?: NativeController }) {
  if (options.token.length < 32 || !Number.isInteger(options.port) || options.port < 1024 || options.port > 65535) throw new Error("Invalid private controller configuration");
  const controller = options.controller ?? new NativeController(options.root);
  const relay = new NativeToolRelay();
  const mcpToken = randomBytes(32).toString("hex");
  let mutation = Promise.resolve();
  const server = createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json");
    response.setHeader("Cache-Control", "no-store");
    const supplied = Buffer.from(request.headers.authorization ?? "");
    const expected = Buffer.from(`Bearer ${request.url === "/mcp" ? mcpToken : options.token}`);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) { response.writeHead(401).end('{"error":"Unauthorized"}'); return; }
    // A stateless Streamable HTTP server does not expose an SSE stream.
    if (request.url === "/mcp" && request.method !== "POST") { response.setHeader("Allow", "POST"); response.writeHead(405).end('{"error":"Method not allowed"}'); return; }
    try {
      let result: unknown;
      if (request.method === "GET" && request.url === "/status") {
        const status = controller.status();
        result = { ...status, ...(status.toolObserved === undefined ? {} : { toolObserved: status.toolObserved && relay.hasSuccessfulCall() }), pendingTools: relay.status(), mcpDiagnostics: relay.diagnosticStatus() };
      }
      else if (request.method === "POST") {
        const input = await body(request);
        if (request.url === "/mcp") {
          const message = await relay.request(input);
          if (message === undefined) response.writeHead(202).end(); else response.end(JSON.stringify(message));
          return;
        }
        if (request.url === "/tool-result") { relay.complete(input.id, input.result); response.end('{"ok":true}'); return; }
        let release!: () => void;
        const previous = mutation;
        mutation = new Promise<void>((resolve) => { release = resolve; });
        await previous;
        try {
        switch (request.url) {
          case "/login/start": relay.cancel(); result = await controller.login(input.engine); break;
          case "/login/code": result = controller.code(input.code); break;
          case "/cancel": relay.cancel(); result = await controller.cancel(); break;
          case "/auth/check": result = await controller.check(input.engine); break;
          case "/isolation/check": result = await controller.isolation(input.engine); break;
          case "/profile/import": relay.cancel(); result = await controller.import(input.profile); break;
          case "/profile/export": result = await controller.export(input.engine); break;
          case "/smoke":
            relay.configure(input.tools, input.requiredTool);
            result = await controller.smoke({ ...input, mcp: { url: `http://127.0.0.1:${options.port}/mcp`, authorization: `Bearer ${mcpToken}` } } as SmokeInput);
            break;
          default: response.writeHead(404).end('{"error":"Unknown operation"}'); return;
        }
        } finally { release(); }
      } else { response.writeHead(404).end('{"error":"Unknown operation"}'); return; }
      response.end(JSON.stringify(result));
    } catch { response.writeHead(400).end('{"error":"Private native operation rejected"}'); }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  server.listen(options.port, "127.0.0.1");
  return { server, controller, relay, mcpToken };
}

if (process.env.MINDDY_NATIVE_PROFILE_ROOT && process.env.MINDDY_NATIVE_CONTROLLER_TOKEN) {
  const { server, controller } = startNativeController({ root: process.env.MINDDY_NATIVE_PROFILE_ROOT, token: process.env.MINDDY_NATIVE_CONTROLLER_TOKEN, port: Number(process.env.MINDDY_NATIVE_CONTROLLER_PORT ?? 8787) });
  const shutdown = () => { server.close(); void controller.cancel().finally(() => process.exit(0)); };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}
