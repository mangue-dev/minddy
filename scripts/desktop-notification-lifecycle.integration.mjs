import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Run the real main/preload wiring with synthetic banners and two local servers.
// No account, operating-system banner or native push service is involved.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const desktop = path.join(root, "desktop");
const requireDesktop = createRequire(path.join(desktop, "package.json"));
const temporary = await mkdtemp(path.join(os.tmpdir(), "minddy-notification-lifecycle-"));
const userData = path.join(temporary, "profile");
const resultPath = path.join(temporary, "result.json");
const servers = [0, 1].map(() => createServer((_request, response) => {
  response.writeHead(200, { "Content-Type": "text/html" });
  response.end("<!doctype html><html><body><h1>Synthetic server</h1></body></html>");
}));
let child;
try {
  for (const server of servers) await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origins = servers.map(server => `http://127.0.0.1:${server.address().port}`);
  await mkdir(userData);
  await writeFile(path.join(userData, "server.json"), JSON.stringify({ origin: origins[0] }));
  await writeFile(path.join(temporary, "package.json"), JSON.stringify({
    name: "minddy-desktop", version: requireDesktop("./package.json").version, main: "probe.cjs",
  }));
  await writeFile(path.join(temporary, "probe.cjs"), `
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const { EventEmitter } = require("node:events");
    const electron = require("electron");
    const { app, BrowserWindow, ipcMain } = electron;
    const banners = [];
    class SyntheticNotification extends EventEmitter {
      static isSupported() { return true; }
      constructor(options) { super(); this.options = options; this.closed = false; banners.push(this); }
      show() { this.emit("show"); }
      close() { this.closed = true; this.emit("close"); }
    }
    let finished = false;
    function finish(result) {
      if (finished) return;
      finished = true;
      fs.writeFileSync(${JSON.stringify(resultPath)}, JSON.stringify(result));
      app.quit();
    }
    process.on("uncaughtException", error => finish({ error: String(error) }));
    process.on("unhandledRejection", error => finish({ error: String(error) }));
    setTimeout(() => finish({ error: "Native notification probe timed out" }), 15000);
    // Electron's exports are nonconfigurable getters. Inject only the native
    // banner constructor into the shell's imports, retaining real window/IPC APIs.
    const Module = require("node:module");
    const load = Module._load;
    Module._load = function(request, ...args) {
      if (request === "electron") return { ...electron, Notification: SyntheticNotification };
      return load.call(this, request, ...args);
    };
    require(${JSON.stringify(path.join(desktop, "dist/main.js"))});
    Module._load = load;
    async function waitFor(predicate) {
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        if (await predicate()) return;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      throw new Error("Expected native fixture state did not arrive");
    }
    app.whenReady().then(async () => {
      const [firstOrigin, nextOrigin] = ${JSON.stringify(origins)};
      let window;
      await waitFor(() => {
        window = BrowserWindow.getAllWindows()[0];
        return window && !window.webContents.isLoading() && window.webContents.getURL() === firstOrigin + "/home";
      });
      const send = (channel, value) => ipcMain.emit(channel, { sender: window.webContents }, value);
      const show = (id, target) => send("minddy:notification:show", { id, target, title: "Synthetic notification", body: "Test fixture" });
      show("reused", "/home?issue=old");
      const old = banners.at(-1);
      assert.ok(old);
      send("minddy:notification:dismiss", "reused");
      show("reused", "/home?issue=replacement");
      const replacement = banners.at(-1);
      assert.notEqual(old, replacement);
      old.emit("close"); old.emit("failed"); old.emit("click");
      assert.equal(replacement.closed, false);
      assert.equal(window.webContents.getURL(), firstOrigin + "/home");
      send("minddy:notification:dismiss", "reused");
      assert.equal(replacement.closed, true, "Old native events must not remove the replacement registration");

      show("previous-server", "/home?issue=previous-server");
      const previousServerBanner = banners.at(-1);
      send("minddy:server-picker:open");
      // The server choice is the app's bundled page; exercise the actual
      // preload bridge and its trusted-document IPC handler from that page.
      await waitFor(() => !window.webContents.isLoading() && window.webContents.getURL().startsWith("minddy-app://welcome/"));
      await window.webContents.executeJavaScript('void window.minddy.serverChoice.connect(' + JSON.stringify(nextOrigin) + ')');
      await waitFor(() => !window.webContents.isLoading() && window.webContents.getURL() === nextOrigin + "/signup");
      assert.equal(previousServerBanner.closed, true, "Changing servers must dismiss old relative routes");
      previousServerBanner.emit("click");
      await new Promise(resolve => setTimeout(resolve, 100));
      assert.equal(window.webContents.getURL(), nextOrigin + "/signup");
      show("current-server", "/home?issue=current-server");
      banners.at(-1).emit("click");
      await waitFor(() => !window.webContents.isLoading() && window.webContents.getURL() === nextOrigin + "/home?issue=current-server");
      finish({ electron: process.versions.electron, isolated: app.getPath("userData") === ${JSON.stringify(userData)}, checks: [
        "Late native close, failure and click events cannot remove or open a replacement banner",
        "Switching through the server-choice page bridge dismisses banners from the prior server",
        "An old banner click cannot open its relative issue on the newly selected server",
        "Current-server banner clicks still navigate to their intended route",
      ] });
    }).catch(error => finish({ error: String(error) }));
  `);
  const env = Object.fromEntries(["PATH", "HOME", "TMPDIR", "LANG", "DISPLAY", "XAUTHORITY"]
    .filter(key => process.env[key]).map(key => [key, process.env[key]]));
  child = spawn(requireDesktop("electron"), [`--user-data-dir=${userData}`, temporary], {
    cwd: desktop, env: {
      ...env, MINDDY_DESKTOP_TEST_USER_DATA: userData, MINDDY_DESKTOP_ORIGIN: origins[0],
      XDG_CONFIG_HOME: path.join(temporary, "config"), XDG_CACHE_HOME: path.join(temporary, "cache"),
      XDG_STATE_HOME: path.join(temporary, "state"),
    }, stdio: ["ignore", "ignore", "pipe"],
  });
  let diagnostics = "";
  child.stderr.on("data", chunk => { diagnostics = (diagnostics + chunk).slice(-4000); });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(async () => {
      child.kill("SIGKILL");
      const result = await readFile(resultPath, "utf8").catch(() => "No result recorded");
      reject(new Error(`Electron notification probe timed out: ${result}; ${diagnostics}`));
    }, 20_000);
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.once("exit", code => {
      clearTimeout(timer);
      if (code === 0) resolve(); else reject(new Error(`Electron exited ${code}: ${diagnostics}`));
    });
  });
  const result = JSON.parse(await readFile(resultPath, "utf8"));
  assert.equal(result.error, undefined, JSON.stringify(result));
  assert.equal(result.isolated, true);
  console.log(JSON.stringify(result, null, 2));
} finally {
  child?.kill("SIGKILL");
  for (const server of servers) await new Promise(resolve => server.close(resolve));
  await rm(temporary, { recursive: true, force: true });
}
