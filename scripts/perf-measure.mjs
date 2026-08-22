import { chromium } from "playwright";

const BASE = "http://localhost:3111";

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

// Collect transferred bytes for the initial load
let bytes = 0;
const seen = new Set();
page.on("response", async (res) => {
  const url = res.url();
  if (seen.has(url)) return;
  if (!url.includes("/_next/static")) return;
  seen.add(url);
  try {
    const body = await res.body();
    bytes += body.length;
  } catch {}
});

await page.goto(BASE + "/login", { waitUntil: "networkidle" });
console.log("login page static JS (uncompressed sum):", (bytes / 1024).toFixed(0), "KB");

// Measure navigation timings between app routes.
// We can't easily auth; instead measure RSC payload fetch time directly by
// requesting the RSC payloads of routes as the router would.
const routes = ["/home", "/inbox", "/all", "/statistics", "/settings"];
for (const r of routes) {
  const t0 = Date.now();
  const res = await context.request.fetch(BASE + r, {
    headers: { RSC: "1" },
  });
  const body = await res.body();
  console.log(`RSC ${r}: ${Date.now() - t0} ms, ${(body.length / 1024).toFixed(0)} KB payload`);
}

// Full document loads
for (const r of ["/home", "/inbox"]) {
  const t0 = Date.now();
  const res = await context.request.get(BASE + r);
  await res.body();
  console.log(`DOC ${r}: ${Date.now() - t0} ms`);
}

await browser.close();
