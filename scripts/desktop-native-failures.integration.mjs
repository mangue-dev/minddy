import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Use the real main process and window with synthetic browser and TCC failures.
// No browser, Settings window, microphone or authenticated server is opened.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const desktop = path.join(root, "desktop");
const requireDesktop = createRequire(path.join(desktop, "package.json"));
const temporary = await mkdtemp(path.join(os.tmpdir(), "minddy-native-failures-"));
const profile = path.join(temporary, "profile");
const resultPath = path.join(temporary, "result.json");
const server = createServer((_request, response) => {
  response.writeHead(200, { "Content-Type": "text/html" });
  response.end("<!doctype html><html><body><h1>Synthetic native failure fixture</h1></body></html>");
});
let child;
try {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  await mkdir(profile);
  await writeFile(path.join(profile, "server.json"), JSON.stringify({ origin }));
  await writeFile(path.join(temporary, "package.json"), JSON.stringify({
    name: "minddy-desktop", version: requireDesktop("./package.json").version, main: "probe.cjs",
  }));
  await writeFile(path.join(temporary, "probe.cjs"), `
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const electron = require("electron");
    const { app, BrowserWindow, ipcMain, session } = electron;
    const issues = [];
    const external = [];
    let permissionHandler;
    let microphoneStatus = "not-determined";
    let rejectBrowser = true;
    let finished = false;
    function finish(result) {
      if (finished) return;
      finished = true;
      fs.writeFileSync(${JSON.stringify(resultPath)}, JSON.stringify(result));
      app.quit();
    }
    process.on("uncaughtException", error => finish({ error: String(error) }));
    process.on("unhandledRejection", error => { issues.push(String(error)); });
    setTimeout(() => finish({ error: "Native failure probe timed out", issues }), 15000);
    // Retain real Electron window, session and IPC behavior. Replace only OS
    // launch/permission operations to exercise their deterministic error paths.
    app.whenReady().then(() => {
      const setPermissionHandler = session.defaultSession.setPermissionRequestHandler.bind(session.defaultSession);
      session.defaultSession.setPermissionRequestHandler = handler => {
        permissionHandler = handler;
        setPermissionHandler(handler);
      };
    });
    const Module = require("node:module");
    const load = Module._load;
    Module._load = function(request, ...args) {
      if (request === "electron") return {
        ...electron,
        shell: { ...electron.shell, openExternal: async url => {
          external.push(url);
          if (rejectBrowser) throw new Error("Synthetic missing browser handler");
        } },
        systemPreferences: { ...electron.systemPreferences,
          getMediaAccessStatus: () => microphoneStatus,
          askForMediaAccess: async () => { throw new Error("Synthetic TCC service failure"); },
        },
        dialog: { ...electron.dialog, showMessageBox: async () => { throw new Error("Synthetic destroyed native sheet"); } },
      };
      return load.call(this, request, ...args);
    };
    require(${JSON.stringify(path.join(desktop, "dist/main.js"))});
    Module._load = load;
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    async function waitFor(predicate) {
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        if (predicate()) return;
        await delay(25);
      }
      throw new Error("Expected native fixture state did not arrive");
    }
    (async () => {
      await app.whenReady();
      await waitFor(() => BrowserWindow.getAllWindows().some(window => !window.webContents.isLoading() && window.webContents.getURL().startsWith(${JSON.stringify(origin)})));
      const window = BrowserWindow.getAllWindows()[0];
      const before = window.webContents.getURL();
      ipcMain.emit("minddy:open-external", { sender: window.webContents }, "https://minddy.example/login?token=synthetic");
      await delay(30);
      const blocked = { prevented: false, preventDefault() { this.prevented = true; } };
      window.webContents.emit("will-navigate", blocked, "https://minddy.example/documentation");
      await delay(30);
      assert.equal(blocked.prevented, true);
      assert.equal(window.webContents.getURL(), before);
      let permission;
      if (process.platform === "darwin") {
        permissionHandler(window.webContents, "media", allowed => { permission = allowed; }, {
          securityOrigin: ${JSON.stringify(origin)}, requestingUrl: before, mediaTypes: ["audio"],
        });
        await delay(30);
        assert.equal(permission, false, "Native permission failure must settle the Chromium callback");
        microphoneStatus = "denied";
        permission = undefined;
        permissionHandler(window.webContents, "media", allowed => { permission = allowed; }, {
          securityOrigin: ${JSON.stringify(origin)}, requestingUrl: before, mediaTypes: ["audio"],
        });
        await delay(30);
        assert.equal(permission, false, "A failed Settings dialog must not prevent denial");
      }
      assert.deepEqual(issues, [], "Native failures must not leak unhandled rejections");
      rejectBrowser = false;
      ipcMain.emit("minddy:open-external", { sender: window.webContents }, "https://minddy.example/retry");
      await delay(30);
      assert.equal(external.at(-1), "https://minddy.example/retry");
      assert.deepEqual(issues, []);
      finish({ electron: process.versions.electron, isolated: app.getPath("userData") === ${JSON.stringify(profile)},
        checks: ["Browser IPC and navigation failures leave the app loaded without unhandled rejections", "A subsequent browser launch remains available", ...(process.platform === "darwin" ? ["TCC rejection settles the microphone permission callback", "A failed native Settings sheet preserves denial without unhandled rejection"] : [])] });
    })().catch(error => finish({ error: String(error), issues }));
  `);
  const environment = Object.fromEntries(["PATH", "HOME", "TMPDIR", "LANG", "DISPLAY", "XAUTHORITY"].filter(key => process.env[key]).map(key => [key, process.env[key]]));
  child = spawn(requireDesktop("electron"), [temporary], {
    cwd: desktop,
    env: { ...environment, MINDDY_DESKTOP_TEST_USER_DATA: profile, MINDDY_DESKTOP_ORIGIN: origin,
      XDG_CONFIG_HOME: path.join(temporary, "config"), XDG_CACHE_HOME: path.join(temporary, "cache"), XDG_STATE_HOME: path.join(temporary, "state") },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let diagnostics = "";
  child.stderr.on("data", chunk => { diagnostics = (diagnostics + chunk).slice(-4000); });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error(`Native failure probe timed out: ${diagnostics}`)); }, 20_000);
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("exit", code => { clearTimeout(timer); if (code === 0) resolve(); else reject(new Error(`Electron exited ${code}: ${diagnostics}`)); });
  });
  const result = JSON.parse(await readFile(resultPath, "utf8"));
  assert.equal(result.error, undefined, JSON.stringify(result));
  assert.equal(result.isolated, true);
  console.log(JSON.stringify(result, null, 2));
} finally {
  child?.kill("SIGKILL");
  await new Promise(resolve => server.close(resolve));
  await rm(temporary, { recursive: true, force: true });
}
