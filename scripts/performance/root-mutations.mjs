// Diagnostic only: find root-level style/attribute mutations during the
// targeted interactions (full-document style recalc attribution).
import { mkdir, readFile } from "node:fs/promises";
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

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "en-US", colorScheme: "dark", reducedMotion: "no-preference" });
await context.addCookies(cookies.map(({ name, value }) => ({ name, value, url: base, sameSite: "Lax" })));
await context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: base }]);
await context.addInitScript(() => {
  localStorage.setItem("cookie_consent", "declined");
  window.__mutations = [];
  const arm = () => {
    const roots = [document.documentElement, document.body];
    for (const root of roots) {
      if (!root || root.__armed) continue;
      root.__armed = true;
      new MutationObserver((records) => {
        for (const record of records) {
          window.__mutations.push({
            at: performance.now(),
            target: record.target === document.documentElement ? "html" : "body",
            type: record.type,
            attribute: record.attributeName,
            oldValue: record.oldValue ?? null,
            styleText: record.type === "attributes" && record.attributeName === "style" ? (record.target.getAttribute("style") ?? "").slice(0, 200) : undefined,
          });
        }
      }).observe(root, { attributes: true, attributeOldValue: true });
    }
  };
  document.addEventListener("DOMContentLoaded", arm);
  // Arm again after hydration, repeatedly, until it sticks.
  const timer = setInterval(arm, 500);
  setTimeout(() => clearInterval(timer), 30000);
});
const page = await context.newPage();

await page.goto(`${base}/all`, { waitUntil: "domcontentloaded" });
await page.locator("[data-issue-id]").first().waitFor({ timeout: 90000 });
await page.waitForTimeout(2000);
const pagesHref = `/projects/${fixture.projects[0]}/pages`;
await page.locator('[data-app-tab-id][aria-label="Performance pages"]').click();
await page.locator(`a[href="${pagesHref}/${fixture.firstPage}"]`).first().waitFor();
await page.locator('[data-app-tab-id][aria-label="Performance board"]').click();
await page.locator("[data-issue-id]").first().waitFor();
await page.waitForTimeout(1200);

async function dump(name) {
  const mutations = await page.evaluate(() => window.__mutations.splice(0));
  console.log(`=== ${name}: ${mutations.length} root mutations`);
  const seen = new Map();
  for (const m of mutations) {
    const key = `${m.target} ${m.type} ${m.attribute ?? ""} ${m.styleText ?? ""}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  for (const [key, count] of [...seen].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(String(count).padStart(4), key.slice(0, 220));
  }
}

await page.evaluate(() => window.__mutations.splice(0));
await page.locator('.app-top-bar button[aria-label="Hide sidebar"]').click();
await page.waitForTimeout(700);
await dump("sidebar-hide");
await page.locator('.app-top-bar button[aria-label="Show sidebar"]').click();
await page.waitForTimeout(700);
await dump("sidebar-show");

await page.locator('[data-board-column-status="backlog"] [data-issue-id]').first().hover();
await page.evaluate(() => window.__mutations.splice(0));
await page.mouse.wheel(0, 1400);
await page.waitForTimeout(250);
await dump("board-scroll-down");

await page.evaluate(() => window.__mutations.splice(0));
await page.locator("[data-issue-id]").first().click();
await page.locator('[role="dialog"]').first().waitFor();
await page.waitForTimeout(400);
await dump("issue-open");
await browser.close();
