import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

// Exercise the real HTTP boundary without a Docker daemon or production secrets.
test("agent runner errors preserve status without exposing internal details", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "minddy-runner-http-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const reservation = createServer().listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const child = spawn(process.execPath, ["deploy/self-hosted/agent-runner.mjs"], {
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
  child.stderr.resume();
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Runner startup timed out")), 10_000);
    child.once("error", reject);
    child.once("exit", () => { clearTimeout(timeout); reject(new Error("Runner exited before startup")); });
    child.stdout.on("data", (chunk) => {
      if (chunk.toString().includes("ready on port")) { clearTimeout(timeout); resolve(); }
    });
  });
  const origin = `http://127.0.0.1:${port}`;
  const failure = await fetch(`${origin}/health`);
  assert.equal(failure.status, 500);
  assert.deepEqual(await failure.json(), { error: "agent runner request failed" });
  const invalid = await fetch(`${origin}/v1/sandboxes/invalid`, {
    headers: { authorization: "Bearer test-runner-secret" },
  });
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), { error: "invalid request" });
});
