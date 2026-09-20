import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { createServerClient } from "@supabase/ssr";
import { loadEnv, requireEnv } from "../../captures/lib/env.mjs";
import { EMAIL, MARKER, id } from "./seed.mjs";

loadEnv();
const base = process.env.MINDDY_PERF_BASE_URL ?? "http://localhost:3111";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname)) throw new Error("Benchmarks must target a local production build");
const output = "output/playwright/performance";
await mkdir(output, { recursive: true });
const fixture = JSON.parse(await readFile(`${output}/workload.json`, "utf8"));
if (fixture.marker !== MARKER || fixture.email !== EMAIL) throw new Error("Run the dedicated workload seed first");
const cookies = [];
const auth = createServerClient(requireEnv("MINDDY_PUBLIC_SUPABASE_URL"), requireEnv("MINDDY_PUBLIC_SUPABASE_ANON_KEY"), {
  cookies: { getAll: () => [], setAll: (values) => cookies.push(...values) },
});
const signedIn = await auth.auth.signInWithPassword({ email: EMAIL, password: requireEnv("CAPTURES_DEMO_PASSWORD") });
if (signedIn.error) throw signedIn.error;
if (signedIn.data.user.id !== fixture.userId || signedIn.data.user.user_metadata.performance_fixture !== MARKER) throw new Error("Wrong benchmark account");
if (fixture.projects.some((value, index) => value !== id(`project-${index}`)) || fixture.firstPage !== id("page-0-0") || fixture.firstIssue !== id("issue-0-0")) throw new Error("Foreign fixture identifiers");
const browser = await chromium.launch();
const mobile = process.argv.includes("--mobile");
const viewport = mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 };
const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, locale: "en-US", colorScheme: "dark", reducedMotion: "no-preference" });
await context.addCookies(cookies.map(({ name, value }) => ({ name, value, url: base, sameSite: "Lax" })));
await context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: base }]);
const page = await context.newPage();
let beamActive = true;
if (process.argv.includes("--visual")) {
  // Visual-only activity signal: no agent run is created or paid for.
  await page.route((url) => url.pathname === "/api/agent-activity", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({ response, json: { ...body, workingIssueIds: beamActive ? [fixture.firstIssue] : [] } });
  });
}
const cdp = await context.newCDPSession(page);
await cdp.send("Performance.enable");
const failures = [];
page.on("pageerror", (error) => failures.push(error.message));
const responses = [];
page.on("response", (response) => {
  if (response.url().startsWith(`${base}/api/`)) responses.push({ path: new URL(response.url()).pathname, status: response.status(), at: Date.now() });
});
await context.addInitScript(() => {
  localStorage.setItem("cookie_consent", "declined");
  window.__perf = { longTasks: [], events: [], frames: [], storage: [] };
  for (const [type, key] of [["longtask", "longTasks"], ["event", "events"]]) {
    try { new PerformanceObserver((list) => window.__perf[key].push(...list.getEntries().map((entry) => ({ name: entry.name, start: entry.startTime, duration: entry.duration })))).observe({ type, buffered: true, ...(type === "event" ? { durationThreshold: 16 } : {}) }); } catch { /* Unsupported browser entries are omitted. */ }
  }
  let previous = performance.now();
  function frame(now) { window.__perf.frames.push({ start: previous, duration: now - previous }); previous = now; requestAnimationFrame(frame); }
  requestAnimationFrame(frame);
  const setItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function(key, value) { const start = performance.now(); const result = setItem.call(this, key, value); if (key === "minddy.query-cache") window.__perf.storage.push({ start, duration: performance.now() - start, bytes: value.length }); return result; };
});
const created = new Set();
const checks = [];
const commentPath = `/api/projects/${fixture.projects[0]}/pages/${fixture.firstPage}/comments`;
let behavior = "normal";
let release;
await page.route((url) => url.pathname === commentPath, async (route) => {
  if (route.request().method() !== "POST") return route.continue();
  const request = route.request().postDataJSON();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(request.id)) throw new Error("Missing comment idempotency UUID");
  created.add(request.id);
  if (behavior === "hold") await new Promise((resolve) => { release = resolve; });
  if (behavior === "fail") return route.fulfill({ status:503, json:{error:"Temporary benchmark failure"} });
  if (behavior === "ambiguous") {
    const committed = await route.fetch();
    if (!committed.ok()) throw new Error(`Ambiguous-delivery setup did not commit: HTTP ${committed.status()}`);
    return route.abort("failed");
  }
  return route.continue();
});
try {
  const tabs = await (await context.request.get(`${base}/api/me/app-tabs`)).json();
  for (const [index,name,href] of [[0,"Performance board","/all"],[1,"Performance pages",`/projects/${fixture.projects[0]}/pages`]]) {
    const tab=tabs.find((tab)=>tab.custom_name===name) ?? tabs[index];
    const response=await context.request.patch(`${base}/api/me/app-tabs/${tab.id}`,{data:{revision:tab.revision,patch:{href,custom_name:name}}});
    if (!response.ok()) throw new Error("Could not prepare fixture tabs");
  }
  await page.goto(`${base}/all`);
  await page.locator('[data-issue-id]').first().waitFor();
  await page.locator('[data-app-tab-id][aria-label="Performance pages"]').click();
  await page.locator(`a[href="/projects/${fixture.projects[0]}/pages/${fixture.firstPage}"]`).first().click();
  await page.locator('.page-editor .tiptap').waitFor();
  async function composer() {
    if (!await page.locator('[role="textbox"][contenteditable="true"]').last().isVisible()) await page.locator('.app-content-header button[aria-label="Comments"]').click();
    return page.locator('[role="textbox"][contenteditable="true"]').last();
  }
  behavior="hold";
  let input=await composer();
  const heldText=`Performance delayed confirmation ${Date.now()}`;
  await input.fill(heldText);await input.press('ControlOrMeta+Enter');
  const held=page.locator('[data-comment-state="sending"]').filter({hasText:heldText});
  await held.waitFor();
  if(await input.innerText()!=="") throw new Error("Composer stayed blocked on POST");
  const heldId=await held.getAttribute('data-comment-id');
  const heldNode=await held.elementHandle();
  await page.waitForTimeout(1500);
  if(!release) throw new Error("POST was not intercepted");
  if(!await held.isVisible()) throw new Error("Pending comment vanished while POST was held");
  release();behavior="normal";
  const confirmed=page.locator(`[data-comment-id="${heldId}"][data-comment-state="confirmed"]`);
  await confirmed.waitFor();
  if(await confirmed.count()!==1 || !await confirmed.evaluate((node,old)=>node===old,heldNode)) throw new Error("Reconciliation duplicated/remounted the comment");
  checks.push("Immediate full draft and empty composer before a held POST; same row after confirmation");
  behavior="fail";
  input=await composer();const failedText=`Performance recoverable failure ${Date.now()}`;
  await input.fill(failedText);await input.press('ControlOrMeta+Enter');
  let failed=page.locator('[data-comment-state="error"]').filter({hasText:failedText});await failed.waitFor();
  const failedId=await failed.getAttribute('data-comment-id');
  await page.keyboard.press('Escape');
  await page.locator('[data-app-tab-id][aria-label="Performance board"]').click();
  await page.waitForURL('**/all');await page.waitForTimeout(500);
  await page.locator('[data-app-tab-id][aria-label="Performance pages"]').click();
  await page.locator('.page-editor .tiptap').waitFor();
  await composer();
  failed=page.locator(`[data-comment-id="${failedId}"][data-comment-state="error"]`);await failed.waitFor();
  behavior="normal";
  input=await composer();
  const nextDraft="Unsent draft must survive reconciliation";
  await input.fill(nextDraft);
  await failed.getByRole('button',{name:/retry|try again/i}).click();
  await page.locator(`[data-comment-id="${failedId}"][data-comment-state="confirmed"]`).waitFor();
  if(await page.locator(`[data-comment-id="${failedId}"]`).count()!==1) throw new Error("Retry duplicated the comment");
  if(await input.innerText()!==nextDraft) throw new Error("Retry reconciliation replaced a newer unsent draft");
  const storedAfterRetry=await (await context.request.get(`${base}${commentPath}`)).json();
  if(storedAfterRetry.filter((comment)=>comment.body===failedText).length!==1) throw new Error("Server stored duplicate retry content");
  checks.push("Failed full draft survives tab navigation and retries once with the same UUID without replacing a newer composer draft");
  await input.fill("");
  behavior="fail";
  const discardedText=`Performance discarded failure ${Date.now()}`;
  await input.fill(discardedText);await input.press('ControlOrMeta+Enter');
  const discarded=page.locator('[data-comment-state="error"]').filter({hasText:discardedText});
  await discarded.waitFor();
  const discardedId=await discarded.getAttribute('data-comment-id');
  await discarded.getByRole('button',{name:"Delete",exact:true}).click();
  await page.getByRole('alertdialog').getByRole('button',{name:"Delete",exact:true}).click();
  await page.locator(`[data-comment-id="${discardedId}"]`).waitFor({state:"detached"});
  checks.push("Explicit deletion discards a failed submission after an already-absent server row returns404");
  behavior="ambiguous";
  input=await composer();const ambiguousText=`Performance ambiguous delivery ${Date.now()}`;
  await input.fill(ambiguousText);await input.press('ControlOrMeta+Enter');
  const ambiguous=page.locator('[data-comment-state="confirmed"]').filter({hasText:ambiguousText});await ambiguous.waitFor();
  if(await ambiguous.count()!==1) throw new Error("Ambiguous acknowledgement duplicated the write");
  const storedAfterAmbiguous=await (await context.request.get(`${base}${commentPath}`)).json();
  if(storedAfterAmbiguous.filter((comment)=>comment.body===ambiguousText).length!==1) throw new Error("Server stored duplicate ambiguous-delivery content");
  checks.push("Committed response loss reconciles from GET without duplicate or manual retry");
  await page.screenshot({path:`${output}/pass2-comment-recovery.png`});
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
} finally {
  release?.();behavior="normal";await page.unrouteAll({behavior:"wait"});
  for(const commentId of created) {
    const response=await context.request.delete(`${base}${commentPath}/${commentId}`);
    if(!response.ok() && response.status()!==404) failures.push("Could not clean up the fixture comment");
  }
  await writeFile(`${output}/pass2-comment-regressions.json`,JSON.stringify({checks,failures,createdComments:created.size},null,2));
  await page.screenshot({path:`${output}/pass2-comment-regressions-final.png`});
  await browser.close();
}
if(failures.length) throw new Error("Browser errors during comment regression checks");
console.log(JSON.stringify({checks,createdComments:created.size}));
