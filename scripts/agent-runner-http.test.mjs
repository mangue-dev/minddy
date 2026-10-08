import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

// Exercise the real HTTP boundary without a Docker daemon or production secrets.
async function startRunner(t, script = "deploy/self-hosted/agent-runner.mjs") {
  const root = await mkdtemp(path.join(tmpdir(), "minddy-runner-http-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const reservation = createServer().listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const child = spawn(process.execPath, [script], {
    env: {
      ...process.env,
      AGENT_RUNNER_PORT: String(port),
      AGENT_RUNNER_SECRET: "test-runner-secret",
      AGENT_RUNNER_SANDBOX_IMAGE: "unused:test",
      AGENT_RUNNER_NETWORK: "unused-test-network",
      DOCKER_HOST: `unix://${path.join(root, "private-docker.sock")}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(async () => {
    if (child.exitCode === null) {
      const exited = once(child, "exit");
      child.kill();
      await exited;
    }
  });
  let stderr = "";
  child.stderr.on("data", chunk => { stderr += chunk.toString(); });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Runner startup timed out")), 10_000);
    child.once("error", reject);
    child.once("exit", () => { clearTimeout(timeout); reject(new Error("Runner exited before startup")); });
    child.stdout.on("data", (chunk) => {
      if (chunk.toString().includes("ready on port")) { clearTimeout(timeout); resolve(); }
    });
  });
  const origin = `http://127.0.0.1:${port}`;
  return { origin, child, stderr: () => stderr };
}

test("agent runner errors preserve status without exposing internal details", async (t) => {
  const { origin } = await startRunner(t);
  const failure = await fetch(`${origin}/health`);
  assert.equal(failure.status, 500);
  assert.deepEqual(await failure.json(), { error: "agent runner request failed" });
  const invalid = await fetch(`${origin}/v1/sandboxes/invalid`, {
    headers: { authorization: "Bearer test-runner-secret" },
  });
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), { error: "invalid request" });
});

test("agent runner accepts allocation identities and rejects malformed suffixes", async (t) => {
  const { origin } = await startRunner(t);
  const uuid = "11111111-1111-1111-1111-111111111111";
  const headers = { authorization: "Bearer test-runner-secret" };
  for (const name of [`agent-${uuid}`, `agent-v2-${uuid}`, `agent-v2-${uuid}-a1b2c3d4e5f6`]) {
    const response = await fetch(`${origin}/v1/sandboxes/${name}`, { headers });
    // Valid names reach the Docker boundary, which this fixture deliberately lacks.
    assert.equal(response.status, 500, name);
    assert.deepEqual(await response.json(), { error: "agent runner request failed" });
  }
  for (const suffix of ["a", "a1b2c3d4e5f67", "g1b2c3d4e5f6", "a1b2c3d4e5f6-extra"]) {
    const response = await fetch(`${origin}/v1/sandboxes/agent-v2-${uuid}-${suffix}`, { headers });
    assert.equal(response.status, 400, suffix);
    assert.deepEqual(await response.json(), { error: "invalid request" });
  }
});

for (const scenario of ["disconnect-before-headers", "disconnect-during-stream", "upstream-error"]) {
  test(`agent runner survives ${scenario} without a second HTTP response`, async (t) => {
    const root = await mkdtemp(path.join(tmpdir(), "minddy-runner-relay-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    // Keep the real runner's HTTP boundary; substitute only egress validation so
    // a disposable localhost provider can supply held-open and broken streams.
    const source = await readFile("deploy/self-hosted/agent-runner.mjs", "utf8");
    await writeFile(path.join(root, "runner.mjs"), source.replace(
      '"./agent-runner-egress.mjs"', '"./fixture-egress.mjs"'));
    for (const file of ["agent-runner-git-relay.mjs", "agent-runner-storage.mjs"]) {
      await copyFile(`deploy/self-hosted/${file}`, path.join(root, file));
    }
    await writeFile(path.join(root, "fixture-egress.mjs"), `
      import { Readable } from 'node:stream';
      export async function assertPublicHttpUrl() {}
      export async function requestPublicUrl(url, options) {
        const response = await fetch(url, options);
        return { status: response.status, headers: response.headers,
          stream: Readable.fromWeb(response.body) };
      }
    `);
    let providerResponse;
    let openedResolve;
    let closedResolve;
    const opened = new Promise(resolve => { openedResolve = resolve; });
    const closed = new Promise(resolve => { closedResolve = resolve; });
    const upstream = createHttpServer(async (request, response) => {
      for await (const _chunk of request) { /* Consume the request body. */ }
      providerResponse = response;
      response.once("close", closedResolve);
      if (scenario !== "disconnect-before-headers") {
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.write('data: {"id":"gen-test"}\n\n');
      }
      openedResolve();
    });
    upstream.listen(0, "127.0.0.1");
    await once(upstream, "listening");
    t.after(async () => {
      upstream.closeAllConnections();
      await new Promise(resolve => upstream.close(resolve));
    });
    const h = await startRunner(t, path.join(root, "runner.mjs"));
    const sandbox = "agent-11111111-1111-1111-1111-111111111111";
    const configured = await fetch(`${h.origin}/v1/sandboxes/${sandbox}/llm`, {
      method: "POST", headers: { authorization: "Bearer test-runner-secret", "content-type": "application/json" },
      body: JSON.stringify({ baseUrl: `http://127.0.0.1:${upstream.address().port}/v1`, controlToken: "relay-test" }),
    });
    assert.equal(configured.status, 200);
    const controller = new AbortController();
    const request = fetch(`${h.origin}/v1/sandboxes/${sandbox}/llm/chat/completions`, {
      method: "POST", headers: { authorization: "Bearer relay-test", "content-type": "application/json" },
      body: JSON.stringify({ stream: true }), signal: controller.signal,
    }).catch(() => null);
    await opened;
    if (scenario !== "disconnect-before-headers") {
      const response = await request;
      await response.body.getReader().read();
    }
    if (scenario === "upstream-error") providerResponse.destroy();
    else controller.abort();
    await Promise.race([closed, new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error("Provider did not disconnect")), 2000);
      timer.unref();
    })]);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(h.child.exitCode, null, h.stderr());
    const stillServing = await fetch(`${h.origin}/v1/sandboxes/${sandbox}`);
    assert.equal(stillServing.status, 401);
    assert.doesNotMatch(h.stderr(), /ERR_HTTP_HEADERS_SENT|UnhandledPromiseRejection/);
    controller.abort();
    await request;
  });
}
