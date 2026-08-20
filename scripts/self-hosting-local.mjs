#!/usr/bin/env node
import net from "node:net";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { main as bootstrapSupabase } from "./bootstrap-supabase.mjs";

export const DEFAULT_LOCAL_PORT = 6463;
const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD_ID_FILE = resolve(ROOT_DIR, ".next/BUILD_ID");
const BUILD_STATE_FILE = resolve(ROOT_DIR, ".next/minddy-self-host-build.json");

function fail(message) {
  throw new Error(`Local self-hosting failed: ${message}`);
}

export function parseArgs(argv) {
  const options = { port: DEFAULT_LOCAL_PORT, open: true, stopBackendOnExit: true };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--port") {
      const value = argv[++index];
      const port = Number(value);
      if (!Number.isInteger(port) || port < 1024 || port > 65535) {
        fail("--port must be an integer between 1024 and 65535.");
      }
      options.port = port;
    } else if (arg === "--no-open") {
      options.open = false;
    } else if (arg === "--keep-backend") {
      options.stopBackendOnExit = false;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      fail(`unknown option: ${arg}. See --help.`);
    }
  }
  return options;
}

export function help() {
  return `Usage: pnpm self-host:local [-- --port <port>] [--no-open] [--keep-backend]

Starts minddy's minimal local stack and binds the app to localhost only.

Options:
  --port <port>   Local app port (default: ${DEFAULT_LOCAL_PORT}).
  --no-open       Do not open the sign-up page in the default browser.
  --keep-backend  Keep Supabase running after minddy stops.
  -h, --help      Shows this help.`;
}

export function assertPortAvailable(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", (error) => {
      if (error && typeof error === "object" && "code" in error && error.code === "EADDRINUSE") {
        reject(
          new Error(
            `port ${port} is already in use. Stop that process or run \`pnpm self-host:local -- --port <another-port>\`.`,
          ),
        );
        return;
      }
      reject(error);
    });
    server.listen({ host: "127.0.0.1", port }, () => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });
}

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`${command} stopped after signal ${signal}.`));
      else resolve(code ?? 1);
    });
  });
}

export function browserCommand(url, platform = process.platform) {
  if (platform === "darwin") return { command: "open", args: [url] };
  if (platform === "win32") return { command: "cmd.exe", args: ["/d", "/s", "/c", "start", "", url] };
  return { command: "xdg-open", args: [url] };
}

export function openDefaultBrowser(url, platform = process.platform) {
  const invocation = browserCommand(url, platform);
  const child = spawn(invocation.command, invocation.args, { detached: true, stdio: "ignore" });
  child.on("error", (error) => console.warn(`Could not open the browser automatically: ${error.message}`));
  child.unref();
}

export async function waitForHealth(url, { timeoutMs = 120_000, intervalMs = 500, fetcher = fetch } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetcher(url);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  fail(`minddy did not become healthy within ${Math.ceil(timeoutMs / 1000)} seconds. Check the terminal output above.`);
}

async function runLocalServer(packageRunner, port, runtimeEnv, onReady) {
  const child = spawn(
    packageRunner,
    ["exec", "next", "start", "--hostname", "127.0.0.1", "--port", String(port)],
    { stdio: "inherit", env: runtimeEnv },
  );
  const forwardInterrupt = () => {
    if (!child.killed) child.kill("SIGINT");
  };
  const forwardTermination = () => {
    if (!child.killed) child.kill("SIGTERM");
  };
  process.once("SIGINT", forwardInterrupt);
  process.once("SIGTERM", forwardTermination);
  try {
    const exit = new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => resolve({ code: code ?? 1, signal }));
    });
    await Promise.race([
      waitForHealth(`http://localhost:${port}/api/health`).then(onReady),
      exit.then(({ code, signal }) => fail(`minddy stopped before it became ready (${signal || `code ${code}`}).`)),
    ]);
    return await exit;
  } finally {
    process.removeListener("SIGINT", forwardInterrupt);
    process.removeListener("SIGTERM", forwardTermination);
  }
}

export function productionBuildIsCurrent({ buildIdFile, stateFile, version, appUrl }) {
  if (!existsSync(buildIdFile) || !existsSync(stateFile)) return false;
  try {
    const state = JSON.parse(readFileSync(stateFile, "utf8"));
    return state.version === version && state.appUrl === appUrl;
  } catch {
    return false;
  }
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(help());
    return;
  }

  await assertPortAvailable(options.port).catch((error) => fail(error instanceof Error ? error.message : String(error)));
  const appUrl = `http://localhost:${options.port}`;
  console.log(`→ Preparing minddy for ${appUrl}.`);
  await bootstrapSupabase(["--minimal", "--app-url", appUrl]);

  const packageRunner = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const packageJson = JSON.parse(readFileSync(resolve(ROOT_DIR, "package.json"), "utf8"));
  const runtimeEnv = { ...process.env, MINDDY_PUBLIC_APP_URL: appUrl };
  if (
    !productionBuildIsCurrent({
      buildIdFile: BUILD_ID_FILE,
      stateFile: BUILD_STATE_FILE,
      version: packageJson.version,
      appUrl,
    })
  ) {
    console.log("→ Building the production app. This is needed only after installation or an update.");
    const buildCode = await run(packageRunner, ["run", "build"], runtimeEnv);
    if (buildCode !== 0) fail(`the production build exited with code ${buildCode}.`);
    writeFileSync(
      BUILD_STATE_FILE,
      `${JSON.stringify({ version: packageJson.version, appUrl }, null, 2)}\n`,
      "utf8",
    );
  }
  let result;
  try {
    result = await runLocalServer(packageRunner, options.port, runtimeEnv, () => {
      console.log(`✓ Local services are ready at ${appUrl}.`);
      if (options.open) openDefaultBrowser(`${appUrl}/signup`);
    });
  } finally {
    if (options.stopBackendOnExit) {
      console.log("→ Stopping the local Supabase backend.");
      const stopCode = await run("supabase", ["stop"], runtimeEnv).catch((error) => {
        console.warn(`Could not stop Supabase automatically: ${error instanceof Error ? error.message : error}`);
        return 0;
      });
      if (stopCode !== 0) console.warn(`Supabase stop exited with code ${stopCode}.`);
    }
  }
  if (result.signal && !["SIGINT", "SIGTERM"].includes(result.signal)) fail(`the minddy process stopped after signal ${result.signal}.`);
  if (!result.signal && result.code !== 0) fail(`the minddy process exited with code ${result.code}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
