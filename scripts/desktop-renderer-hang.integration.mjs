import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Load the real built main process through a disposable entry point without a
// renderer debugger. DevTools attachment interferes with native hang detection.
export async function runRendererHangProbe() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const desktop = path.join(root, "desktop");
  const requireDesktop = createRequire(path.join(desktop, "package.json"));
  const temporary = await mkdtemp(path.join(os.tmpdir(), "minddy-renderer-hang-"));
  const userData = path.join(temporary, "profile");
  const resultPath = path.join(temporary, "result.json");
  const server = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end("<!doctype html><html><body><h1>Hang demo</h1></body></html>");
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let child;
  try {
    await mkdir(userData);
    await writeFile(path.join(userData, "server.json"), JSON.stringify({ origin }));
    await writeFile(path.join(temporary, "package.json"), JSON.stringify({ name: "minddy-desktop", version: requireDesktop("./package.json").version, main: "probe.cjs" }));
    const harness = `
const { app, BrowserWindow, dialog } = require("electron");
const fs = require("node:fs");
require(${JSON.stringify(path.join(desktop, "dist/main.js"))});
const result = { debuggerAttached: false, detected: false, gone: false, prompts: [] };
let finished = false;
function finish(error) {
  if (finished) return;
  finished = true;
  if (error) result.error = String(error);
  fs.writeFileSync(${JSON.stringify(resultPath)}, JSON.stringify(result));
  app.quit();
}
process.on("uncaughtException", finish);
process.on("unhandledRejection", finish);
const watchdog = setTimeout(() => finish("Native hang recovery timed out"), 30000);
app.whenReady().then(async () => {
  const deadline = Date.now() + 10000;
  let window;
  while (Date.now() < deadline) {
    window = BrowserWindow.getAllWindows()[0];
    if (window && !window.webContents.isLoading() && window.webContents.getURL() === ${JSON.stringify(`${origin}/home`)}) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!window || window.webContents.isLoading()) throw new Error("Initial fixture did not load");
  if (app.isPackaged || app.getPath("userData") !== ${JSON.stringify(userData)} || app.getPath("sessionData") !== ${JSON.stringify(userData)}) throw new Error("Profile isolation failed");
  result.electron = process.versions.electron;
  result.appVersion = app.getVersion();
  const contents = window.webContents;
  contents.on("unresponsive", () => { result.detected = true; });
  contents.on("render-process-gone", () => { result.gone = true; });
  dialog.showMessageBox = async (_window, options) => {
    result.prompts.push({ message: options.message, buttons: options.buttons, defaultId: options.defaultId, cancelId: options.cancelId });
    return { response: 1, checkboxChecked: false };
  };
  contents.on("did-finish-load", async () => {
    if (!result.prompts.length || !contents.getURL().startsWith("data:")) return;
    result.heading = await contents.executeJavaScript('document.querySelector("h1").textContent');
    clearTimeout(watchdog);
    finish();
  });
  window.show(); window.focus(); app.focus({ steal: true }); contents.focus();
  await contents.executeJavaScript('setTimeout(() => { while (true) {} }, 100); "scheduled"');
  setTimeout(() => {
    contents.sendInputEvent({ type: "mouseDown", x: 100, y: 100, button: "left", clickCount: 1 });
    contents.sendInputEvent({ type: "mouseUp", x: 100, y: 100, button: "left", clickCount: 1 });
    contents.sendInputEvent({ type: "keyDown", keyCode: "Tab" });
    contents.sendInputEvent({ type: "keyUp", keyCode: "Tab" });
  }, 1500);
}).catch(finish);
`;
    await writeFile(path.join(temporary, "probe.cjs"), harness);
    const env = Object.fromEntries(["PATH", "HOME", "TMPDIR", "LANG", "DISPLAY", "XAUTHORITY"].filter(key => process.env[key]).map(key => [key, process.env[key]]));
    child = spawn(requireDesktop("electron"), [`--user-data-dir=${userData}`, temporary], {
      cwd: desktop, env: { ...env, MINDDY_DESKTOP_TEST_USER_DATA: userData, MINDDY_DESKTOP_ORIGIN: origin }, stdio: ["ignore", "ignore", "pipe"],
    });
    let diagnostics = "";
    child.stderr.on("data", chunk => { diagnostics = (diagnostics + chunk).slice(-4000); });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Isolated Electron hang probe timed out")); }, 40_000);
      child.once("error", error => { clearTimeout(timer); reject(error); });
      child.once("exit", code => { clearTimeout(timer); if (code === 0) resolve(); else reject(new Error(`Electron hang probe exited ${code}: ${diagnostics}`)); });
    });
    const result = JSON.parse(await readFile(resultPath, "utf8"));
    assert.equal(result.error, undefined, JSON.stringify(result));
    assert.equal(result.detected, true);
    assert.equal(result.gone, true);
    assert.equal(result.heading, "This window stopped working");
    assert.equal(result.prompts.length, 1);
    assert.equal(result.prompts[0].message, "This window is not responding");
    assert.deepEqual(result.prompts[0].buttons, ["Wait", "Recover window"]);
    assert.equal(result.prompts[0].defaultId, 0); assert.equal(result.prompts[0].cancelId, 0);
    return { ...result, checks: ["A real blocked renderer without DevTools triggers unresponsive detection and the native Wait/Recover window prompt", "Explicit Recover window terminates the blocked renderer and displays the local recovery document"] };
  } finally {
    child?.kill("SIGKILL");
    await new Promise(resolve => server.close(resolve));
    await rm(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await runRendererHangProbe(), null, 2));
}
