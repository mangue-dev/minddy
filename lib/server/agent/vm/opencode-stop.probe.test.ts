import { createServer } from "node:http";
import { once } from "node:events";
import { rmSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { startLlmProxy } from "./llm-proxy";
import { OpencodeClient } from "./opencode-client";
import { installOpencode, probeConfig, probeRoot, startProbeServer, waitFor } from "./opencode-probe-rig";

// Opt-in: runs the exact pinned OpenCode binary, with no paid model request.
describe.skipIf(process.env.MDY_OPENCODE_STOP_PROBE !== "1")("real OpenCode stop cascade", () => {
  it("closes parent and child provider sockets and leaves no engine running", async () => {
    const installRoot = probeRoot("stop-install");
    const bin = installOpencode(installRoot);
    let opened = 0, closed = 0;
    const upstream = createServer(async (request, response) => {
      for await (const _chunk of request) { /* Consume the completion body. */ }
      opened++;
      response.once("close", () => { closed++; });
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write(`data: ${JSON.stringify({ id: `gen-${opened}`, model: "model", choices: [
        { index: 0, delta: { role: "assistant", content: "Working" }, finish_reason: null },
      ] })}\n\n`);
    });
    upstream.listen(0, "127.0.0.1");
    await once(upstream, "listening");
    const port = (upstream.address() as { port: number }).port;
    const proxy = await startLlmProxy({
      job: { baseUrl: `http://127.0.0.1:${port}/v1`, provider: "generic", reasoningLevel: "off" },
      fetchImpl: fetch,
    });
    const server = await startProbeServer({ bin, tag: "stop-engine", config: probeConfig(proxy.url) });
    try {
      const parent = await server.createSession("Parent Stop probe");
      const childResult = await server.post("/session", { title: "Child Stop probe", parentID: parent });
      const child = childResult.body.id as string;
      await server.prompt(parent, "Write a long response.");
      await server.prompt(child, "Write a long response.");
      await waitFor(() => opened >= 2, 20000);
      const client = new OpencodeClient({ baseUrl: server.url, directory: server.repo });
      const stoppedAt = Date.now();
      // The production supervisor cancels the shared proxy before aborting the
      // parent; waitIdle checks every session and force-stops a busy child.
      proxy.cancel();
      expect(await client.abort(parent)).toBe(true);
      const idle = await client.waitIdle(500);
      const exited = once(server.proc, "exit");
      server.stop();
      await exited;
      await waitFor(() => closed >= 2, 1500);
      const closedAtStop = closed;
      await new Promise(resolve => setTimeout(resolve, 300));
      expect(closed).toBe(closedAtStop);
      expect(server.proc.exitCode !== null || server.proc.signalCode !== null).toBe(true);
      const evidence = { engineVersion: "1.18.16", opened, closed, idleAfterParentAbort: idle,
        stopMs: Date.now() - stoppedAt, engineExited: true };
      if (process.env.MDY_STOP_ENGINE_RESULT) writeFileSync(process.env.MDY_STOP_ENGINE_RESULT, JSON.stringify(evidence, null, 2));
    } finally {
      server.stop();
      await proxy.close();
      upstream.closeAllConnections();
      await new Promise<void>(resolve => upstream.close(() => resolve()));
      rmSync(server.root, { recursive: true, force: true });
      rmSync(installRoot, { recursive: true, force: true });
    }
  }, 120000);
});
