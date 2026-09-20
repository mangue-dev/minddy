// Diagnostic only: per-interaction DevTools timeline traces plus a CPU
// profile, to attribute the remaining main-thread blocking and paint/composite
// costs of the targeted interactions. Never used as a latency sample.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { createServerClient } from "@supabase/ssr";
import { loadEnv, requireEnv } from "../../captures/lib/env.mjs";
import { EMAIL, MARKER } from "./seed.mjs";

loadEnv();
const base = process.env.MINDDY_PERF_BASE_URL ?? "http://localhost:3111";
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

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "en-US", colorScheme: "dark", reducedMotion: "no-preference" });
await context.addCookies(cookies.map(({ name, value }) => ({ name, value, url: base, sameSite: "Lax" })));
await context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: base }]);
await context.addInitScript(() => {
  localStorage.setItem("cookie_consent", "declined");
});
const page = await context.newPage();
const cdp = await context.newCDPSession(page);

const traced = [];

async function traceInteraction(name, action, settle = 700) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 100 });
  await cdp.send("Profiler.start");
  const tracePath = `${output}/trace-pass3-${name}.json`;
  await browser.startTracing(page, {
    path: tracePath,
    screenshots: false,
    categories: ["devtools.timeline", "v8", "disabled-by-default-devtools.timeline.invalidationTracking"],
  });
  await action();
  await page.waitForTimeout(settle);
  const { profile } = await cdp.send("Profiler.stop");
  await browser.stopTracing();
  traced.push({ name, tracePath, profile });
}

// Warm the board, a page, and the caches like the measurement runner does.
await page.goto(`${base}/all`, { waitUntil: "domcontentloaded" });
await page.locator("[data-issue-id]").first().waitFor({ timeout: 90000 });
await page.waitForTimeout(2000);
const pagesHref = `/projects/${fixture.projects[0]}/pages`;
await page.locator('[data-app-tab-id][aria-label="Performance pages"]').click();
await page.locator(`a[href="${pagesHref}/${fixture.firstPage}"]`).first().waitFor();
await page.locator('[data-app-tab-id][aria-label="Performance board"]').click();
await page.locator("[data-issue-id]").first().waitFor();
await page.waitForTimeout(1200);

await traceInteraction("tab-to-board", async () => {
  await page.locator('[data-app-tab-id][aria-label="Performance pages"]').click();
  await page.locator('[data-app-tab-id][aria-label="Performance board"]').click();
}, 900);
await traceInteraction("issue-open", async () => {
  await page.locator("[data-issue-id]").first().click();
  await page.locator('[role="dialog"]').first().waitFor();
}, 900);
await page.keyboard.press("Escape");
await page.locator('[role="dialog"]').first().waitFor({ state: "hidden" });
await traceInteraction("sidebar-hide", () => page.locator('.app-top-bar button[aria-label="Hide sidebar"]').click(), 700);
await traceInteraction("sidebar-show", () => page.locator('.app-top-bar button[aria-label="Show sidebar"]').click(), 700);
await traceInteraction("board-scroll", async () => {
  await page.locator('[data-board-column-status="backlog"] [data-issue-id]').first().hover();
  await page.mouse.wheel(0, 1400);
  await page.waitForTimeout(150);
  await page.mouse.wheel(0, -1400);
}, 700);

await browser.close();
await writeFile(
  `${output}/trace-pass3-profiles.json`,
  JSON.stringify(traced.map(({ name, profile }) => ({ name, profile })), null, 2),
);
console.log("profiles and traces written:", traced.map(({ name }) => name).join(", "));
