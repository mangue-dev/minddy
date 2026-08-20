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
  const options = { port: DEFAULT_LOCAL_PORT };
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
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      fail(`unknown option: ${arg}. See --help.`);
    }
  }
  return options;
}

export function help() {
  return `Usage: pnpm self-host:local [-- --port <port>]

Starts minddy's minimal local stack and binds the app to localhost only.

Options:
  --port <port>  Local app port (default: ${DEFAULT_LOCAL_PORT}).
  -h, --help     Shows this help.`;
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
  console.log(`✓ Local services are ready. Opening minddy at ${appUrl}.`);
  const code = await run(
    packageRunner,
    ["exec", "next", "start", "--hostname", "127.0.0.1", "--port", String(options.port)],
    runtimeEnv,
  );
  if (code !== 0) fail(`the minddy process exited with code ${code}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
