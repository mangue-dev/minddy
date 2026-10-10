import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron } from "playwright";

// Run after npm --prefix desktop run build. This probes the real shell with a
// disposable profile and a loopback fixture, never the installed app or account.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const desktop = path.join(root, "desktop");
const requireDesktop = createRequire(path.join(desktop, "package.json"));
const output = path.join(root, "output/playwright/min-651");
const userData = await mkdtemp(path.join(os.tmpdir(), "minddy-renderer-recovery-"));
let loads = 0;
const server = createServer((_request, response) => {
  loads++;
  response.writeHead(200, { "Content-Type": "text/html", "X-Minddy-Desktop-Chrome": "integrated" });
  response.end('<!doctype html><html><body><h1>Recovery demo</h1><p>Synthetic loopback document.</p></body></html>');
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let electron;
const results = { fixture: "Synthetic loopback document; no account", checks: [] };
async function waitForDocument(local) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const ready = await electron.evaluate(({ BrowserWindow }, expectLocal) => {
      const contents = BrowserWindow.getAllWindows()[0].webContents;
      return !contents.isCrashed() && !contents.isLoading() && contents.getURL().startsWith("data:") === expectLocal;
    }, local);
    if (ready) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("Renderer did not load the expected document");
}
try {
  await mkdir(output, { recursive: true });
  await writeFile(path.join(userData, "server.json"), JSON.stringify({ origin }));
  const env = Object.fromEntries(["PATH", "HOME", "TMPDIR", "LANG", "DISPLAY", "XAUTHORITY"].filter(key => process.env[key]).map(key => [key, process.env[key]]));
  electron = await _electron.launch({
    executablePath: requireDesktop("electron"), cwd: desktop,
    args: [`--user-data-dir=${userData}`, desktop],
    env: { ...env, MINDDY_DESKTOP_TEST_USER_DATA: userData, MINDDY_DESKTOP_ORIGIN: origin },
    colorScheme: "light", timeout: 30_000,
  });
  const runtime = await electron.evaluate(({ app, nativeTheme }) => {
    nativeTheme.themeSource = "light";
    return { packaged: app.isPackaged, userData: app.getPath("userData"), sessionData: app.getPath("sessionData"), electron: process.versions.electron, appVersion: app.getVersion() };
  });
  assert.equal(runtime.packaged, false);
  assert.equal(runtime.userData, userData);
  assert.equal(runtime.sessionData, userData);
  results.electron = runtime.electron;
  results.appVersion = runtime.appVersion;
  const page = await electron.firstWindow();
  await page.getByRole("heading", { name: "Recovery demo" }).waitFor({ timeout: 15_000 });
  await page.evaluate(() => history.pushState({}, "", "/projects/demo?view=issues"));
  const beforeCrash = loads;
  await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.forcefullyCrashRenderer());
  // Playwright's page object stays marked crashed. Inspect the replacement
  // renderer through Electron rather than treating that stale handle as a UI bug.
  await waitForDocument(true);
  const recovered = await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.executeJavaScript(
    '({heading: document.querySelector("h1").textContent, href: document.querySelector("a").href})',
  ));
  assert.equal(recovered.heading, "This window stopped working");
  assert.equal(loads, beforeCrash, "Recovery must not automatically load the remote document");
  assert.equal(recovered.href, `${origin}/projects/demo?view=issues`);
  const screenshot = await electron.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].capturePage()).toDataURL());
  await writeFile(path.join(output, "renderer-recovery-light.png"), Buffer.from(screenshot.split(",")[1], "base64"));
  results.checks.push("Forced native renderer crash displays the local recovery document", "No automatic remote reload", "Retry preserves the latest SPA route");
  await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.executeJavaScript('document.querySelector("a").click()'));
  await waitForDocument(false);
  assert.equal(await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getURL()), `${origin}/projects/demo?view=issues`);
  assert.equal(await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.executeJavaScript('document.querySelector("h1").textContent')), "Recovery demo");
  results.checks.push("Explicit Reload window returns to the synthetic app document");
  // A second app crash can recover again, but a crash in the local recovery
  // document must stop rather than causing an endless renderer recreation loop.
  await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.forcefullyCrashRenderer());
  await waitForDocument(true);
  await electron.evaluate(({ dialog }) => {
    globalThis.recoveryDialogs = [];
    dialog.showMessageBox = async (_window, options) => {
      globalThis.recoveryDialogs.push(options.message);
      return { response: 0, checkboxChecked: false };
    };
  });
  await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.forcefullyCrashRenderer());
  const deadline = Date.now() + 10_000;
  let messages = [];
  while (!messages.length && Date.now() < deadline) {
    messages = await electron.evaluate(() => globalThis.recoveryDialogs);
    if (!messages.length) await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.deepEqual(messages, ["This window could not restart"]);
  results.checks.push("A recovery-document crash stops with a native error message");
  await writeFile(path.join(output, "checks.json"), `${JSON.stringify(results, null, 2)}\n`);
  console.log(JSON.stringify(results, null, 2));
} finally {
  await electron?.close();
  await new Promise(resolve => server.close(resolve));
  await rm(userData, { recursive: true, force: true });
}
