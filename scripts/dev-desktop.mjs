import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * THE SHELL, AGAINST THE DEV SERVER (`npm run desktop:dev`).
 *
 * The desktop app does not embed any UI: it loads a remote origin. Expanding
 * means giving it ANOTHER origin — that of `next dev` —
 * and that's all this script does. `MINDDY_DESKTOP_ORIGIN` exists for this
 * (lib/desktop/config.ts); in production the origin is hard, an app whose origin on
 * can hijack by an environment variable is an app whose on
 * can hijack the login screen.
 *
 * **The dev server is NOT launched here**, and this is deliberate: it lives
 * usually already in another terminal, and starting a second one on an already taken port
 * would fail in the most confusing way possible. We wait for it, by
 * saying.
 *
 * What it doesn't do either: reload the shell when we touch
 * `desktop/src/` or `lib/desktop/`. These files are bundled at startup
 * — ⌘Q and we restart. The PAGE is reloaded as in a browser
 * (⌘R): it is the dev server which serves it, including HMR.
 */

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(dir, "..");

const port = process.env.PORT ?? "3000";
const origin = process.env.MINDDY_DESKTOP_ORIGIN ?? `http://localhost:${port}`;

/** Is the server responding? Any status is yes — a redirect to
 * `/login` is one answer, and it's even the most likely on the first try. */
async function serverIsUp() {
  try {
    await fetch(origin, { redirect: "manual", signal: AbortSignal.timeout(2000) });
    return true;
  } catch {
    return false;
  }
}

async function waitForServer() {
  if (await serverIsUp()) return;
  console.log(`[desktop:dev] ${origin} is not responding — start \`npm run dev\` in another terminal.`);
  console.log("[desktop:dev] waiting…");
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (await serverIsUp()) return;
  }
}

/** Runs a command and returns its exit code. */
function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.on("error", reject);
    child.on("exit", (code, signal) => resolve(signal ? 1 : code ?? 0));
  });
}

await waitForServer();
console.log(`[desktop:dev] server found at ${origin}`);

const built = await run(process.execPath, [path.join(dir, "build-desktop.mjs")], {
  cwd: repo,
});
if (built !== 0) process.exit(built);

const electron = path.join(repo, "desktop", "node_modules", ".bin", "electron");
if (!existsSync(electron)) {
  console.error(
    "[desktop:dev] Electron is missing — run `npm --prefix desktop install` first."
  );
  process.exit(1);
}

console.log(`[desktop:dev] opening the window at ${origin}`);
console.log(
  "[desktop:dev] separate profile from the installed app (\"minddy-dev\"): both" +
    " run side by side, and you must sign in here once."
);

/**
 * ⚠ `ELECTRON_RUN_AS_NODE` is WITHDRAWN, and you need to know that before you uncover it. When it is set to `1`, the Electron binary behaves as simple
 * Node: it executes the file, `require("electron")` does not render anything, and the
 * window dies on `Cannot read properties of undefined (reading 'setName')`
 * — an error which does not speak of anything we have just done change.
 *
 * And it is already installed with us: **VS Code puts it in the environment of everything
 * what it launches**, integrated terminal included. Launched from an ordinary terminal
 * the script worked, from the editor it didn't — the worst form of failure.
 */
const env = { ...process.env, MINDDY_DESKTOP_ORIGIN: origin };
delete env.ELECTRON_RUN_AS_NODE;

process.exit(
  await run(electron, ["."], { cwd: path.join(repo, "desktop"), env })
);
