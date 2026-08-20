import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  DEFAULT_LOCAL_PORT,
  assertPortAvailable,
  browserCommand,
  help,
  parseArgs,
  productionBuildIsCurrent,
} from "./self-hosting-local.mjs";

test("the local self-hosting command uses minddy's dedicated port", () => {
  assert.deepEqual(parseArgs([]), { port: DEFAULT_LOCAL_PORT, open: true, stopBackendOnExit: true });
  assert.equal(DEFAULT_LOCAL_PORT, 6463);
  assert.equal(parseArgs(["--", "--port", "16463"]).port, 16463);
  assert.match(help(), /6463/);
});

test("the local launcher opens the right client and owns backend shutdown", () => {
  assert.deepEqual(parseArgs(["--no-open", "--keep-backend"]), {
    port: DEFAULT_LOCAL_PORT,
    open: false,
    stopBackendOnExit: false,
  });
  assert.deepEqual(browserCommand("http://localhost:6463/signup", "darwin"), {
    command: "open",
    args: ["http://localhost:6463/signup"],
  });
  assert.equal(browserCommand("http://localhost:6463/signup", "win32").command, "cmd.exe");
  assert.equal(browserCommand("http://localhost:6463/signup", "linux").command, "xdg-open");
});

test("the local port must be safe for an unprivileged process", () => {
  assert.throws(() => parseArgs(["--port", "80"]), /between 1024 and 65535/);
  assert.throws(() => parseArgs(["--port", "not-a-port"]), /between 1024 and 65535/);
});

test("an available loopback port passes the startup check", async () => {
  await assert.doesNotReject(assertPortAvailable(0));
});

test("an occupied loopback port stops startup with a recovery command", async () => {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0 }, resolve);
  });
  try {
    const address = server.address();
    assert.notEqual(address, null);
    assert.equal(typeof address, "object");
    await assert.rejects(
      assertPortAvailable(address.port),
      /pnpm self-host:local -- --port <another-port>/,
    );
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test("the production build is reused only for the same release and origin", () => {
  const directory = mkdtempSync(join(tmpdir(), "minddy-local-build-"));
  const buildDirectory = join(directory, ".next");
  const buildIdFile = join(buildDirectory, "BUILD_ID");
  const stateFile = join(buildDirectory, "minddy-self-host-build.json");
  mkdirSync(buildDirectory);
  writeFileSync(buildIdFile, "build-id\n", "utf8");
  writeFileSync(
    stateFile,
    `${JSON.stringify({ version: "1.2.3", appUrl: "http://localhost:6463" })}\n`,
    "utf8",
  );

  try {
    assert.equal(
      productionBuildIsCurrent({
        buildIdFile,
        stateFile,
        version: "1.2.3",
        appUrl: "http://localhost:6463",
      }),
      true,
    );
    assert.equal(
      productionBuildIsCurrent({
        buildIdFile,
        stateFile,
        version: "1.2.4",
        appUrl: "http://localhost:6463",
      }),
      false,
    );
    assert.equal(
      productionBuildIsCurrent({
        buildIdFile,
        stateFile,
        version: "1.2.3",
        appUrl: "http://localhost:16463",
      }),
      false,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
