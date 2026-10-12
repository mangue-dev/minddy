import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Exercise native startup and cookie persistence without touching a real account. */
export async function runDesktopStartupProbe() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const desktop = path.join(root, "desktop");
  const requireDesktop = createRequire(path.join(desktop, "package.json"));
  const temporary = await mkdtemp(path.join(os.tmpdir(), "minddy-startup-"));
  const userData = path.join(temporary, "profile");
  let phase = "seed";
  const requests = [];
  const server = createServer((request, response) => {
    requests.push({ phase, path: request.url, cookie: request.headers.cookie ?? "" });
    response.writeHead(200, {
      "Content-Type": "text/html",
      ...(phase === "seed" ? { "Set-Cookie": "startup-session=seed; Path=/; Max-Age=3600; SameSite=Lax" } : {}),
    });
    // Subscribe after the native startup handlers have run. Authentication must
    // wait for this listener rather than being lost during initial navigation.
    response.end(`<!doctype html><html><body><h1>Startup fixture</h1><script>
      window.received = [];
      setTimeout(() => {
        window.minddy.onAuthLink(link => window.received.push(link));
      }, 500);
    </script></body></html>`);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let child;
  try {
    await mkdir(userData);
    await writeFile(path.join(userData, "server.json"), JSON.stringify({ origin }));
    await writeFile(path.join(temporary, "package.json"), JSON.stringify({
      name: "minddy-desktop", version: requireDesktop("./package.json").version, main: "probe.cjs",
    }));
    const results = [];
    for (const stage of ["seed", "rotate", "relaunch"]) {
      phase = stage;
      const resultPath = path.join(temporary, `${stage}.json`);
      const link = `minddy://auth?code=${stage}-code&turn=synthetic-turn`;
      await writeFile(path.join(temporary, "probe.cjs"), `
        const { app, BrowserWindow } = require("electron");
        const fs = require("node:fs");
        require(${JSON.stringify(path.join(desktop, "dist/main.js"))});
        let finished = false;
        function finish(result) {
          if (finished) return;
          finished = true;
          fs.writeFileSync(${JSON.stringify(resultPath)}, JSON.stringify(result));
          app.quit();
        }
        process.on("uncaughtException", error => finish({ error: String(error) }));
        process.on("unhandledRejection", error => finish({ error: String(error) }));
        setTimeout(() => finish({ error: "Startup probe timed out" }), 15000);
        app.emit("open-url", { preventDefault() {} }, ${JSON.stringify(link)});
        app.whenReady().then(async () => {
          const deadline = Date.now() + 10000;
          while (Date.now() < deadline) {
            const window = BrowserWindow.getAllWindows()[0];
            if (window && !window.webContents.isLoading() && window.webContents.getURL() === ${JSON.stringify(`${origin}/home`)}) {
              const state = await window.webContents.executeJavaScript('({ cookie: document.cookie, received: window.received })');
              if (state.received?.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
                state.received = await window.webContents.executeJavaScript('window.received');
                if (${JSON.stringify(stage)} === "rotate") {
                  await window.webContents.executeJavaScript('document.cookie = "startup-session=rotated; Path=/; Max-Age=3600; SameSite=Lax"');
                }
                finish({ ...state, electron: process.versions.electron, isolated: app.getPath("userData") === ${JSON.stringify(userData)} && app.getPath("sessionData") === ${JSON.stringify(userData)} });
                return;
              }
            }
            await new Promise(resolve => setTimeout(resolve, 50));
          }
          throw new Error("Initial fixture or delayed auth subscription did not complete");
        }).catch(error => finish({ error: String(error) }));
      `);
      const env = Object.fromEntries(["PATH", "HOME", "TMPDIR", "LANG", "DISPLAY", "XAUTHORITY"]
        .filter(key => process.env[key]).map(key => [key, process.env[key]]));
      child = spawn(requireDesktop("electron"), [`--user-data-dir=${userData}`, temporary], {
        cwd: desktop, env: {
          ...env, MINDDY_DESKTOP_TEST_USER_DATA: userData, MINDDY_DESKTOP_ORIGIN: origin,
          XDG_CONFIG_HOME: path.join(temporary, "config"),
          XDG_CACHE_HOME: path.join(temporary, "cache"),
          XDG_STATE_HOME: path.join(temporary, "state"),
        },
        stdio: ["ignore", "ignore", "pipe"],
      });
      let diagnostics = "";
      child.stderr.on("data", chunk => { diagnostics = (diagnostics + chunk).slice(-4000); });
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Electron startup probe timed out")); }, 20_000);
        child.once("error", error => { clearTimeout(timer); reject(error); });
        child.once("exit", code => {
          clearTimeout(timer);
          if (code === 0) resolve(); else reject(new Error(`Electron exited ${code}: ${diagnostics}`));
        });
      });
      const result = JSON.parse(await readFile(resultPath, "utf8"));
      assert.equal(result.error, undefined, JSON.stringify(result));
      assert.equal(result.isolated, true);
      assert.deepEqual(result.received, [{ kind: "code", code: `${stage}-code`, next: "/home", turn: "synthetic-turn" }]);
      assert.match(result.cookie, stage === "relaunch" ? /startup-session=rotated/ : /startup-session=seed/);
      results.push({ stage, ...result });
    }
    assert.match(requests.find(request => request.phase === "rotate" && request.path === "/home").cookie, /startup-session=seed/);
    assert.match(requests.find(request => request.phase === "relaunch" && request.path === "/home").cookie, /startup-session=rotated/);
    return {
      results,
      checks: [
        "Cold-start authentication links reach a delayed preload subscriber exactly once",
        "Persistent cookies survive a complete native app quit and relaunch",
        "A renderer cookie rotation is sent on the first request of the next process",
      ],
    };
  } finally {
    child?.kill("SIGKILL");
    await new Promise(resolve => server.close(resolve));
    await rm(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await runDesktopStartupProbe(), null, 2));
}
