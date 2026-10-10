/** Anonymous authentication controls. No form is submitted and no account is created. */
import { mkdir, writeFile } from "node:fs/promises";
import { openPage, settle, CAPTURE, CAPTURE_LOCALES } from "../../lib/browser.mjs";
import { catalog } from "../../lib/messages.mjs";
import { execFileSync } from "node:child_process";

if (!["localhost", "127.0.0.1"].includes(new URL(CAPTURE.baseUrl).hostname)) {
  throw new Error("Documentation authentication captures require a local candidate instance.");
}
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const evidence = [];
for (const locale of CAPTURE_LOCALES) {
  const messages = await catalog(locale);
  const { browser, page } = await openPage({ authed: false, locale, theme: "light", viewport: { width: 1280, height: 900 } });
  try {
    for (const screen of [
      { id: "login", path: "/login" },
      { id: "signup", path: "/signup" },
      { id: "recovery", path: "/forgot-password", heading: messages.Auth.forgotTitle },
    ]) {
      await page.goto(`${CAPTURE.baseUrl}${screen.path}`, { waitUntil: "load" });
      await page.getByRole("heading", { level: 1, ...(screen.heading ? { name: screen.heading, exact: true } : {}) }).waitFor();
      await settle(page);
      if (screen.id === "recovery") await page.locator("#email").fill("demo@example.invalid");
      const out = `public/documentation/${locale}/auth-${screen.id}.png`;
      const controls = page.getByRole("heading", { level: 1 }).locator("..").locator("..");
      await page.waitForTimeout(500);
      const bounds = await controls.boundingBox();
      if (!bounds || bounds.width < 200 || bounds.height < 150) throw new Error("Authentication controls are not visible.");
      await controls.screenshot({ path: out, animations: "disabled" });
      evidence.push({ locale, screen: screen.id, src: out.slice("public".length), sourceCommit, candidateVersion: "0.11.1", date: "2026-10-08", viewport: [Math.round(bounds.width), Math.round(bounds.height)], browserViewport: [1280, 900], theme: "light", submitted: false, language: await page.locator("html").getAttribute("lang"), reviewed: false });
    }
  } finally { await browser.close(); }
}
await mkdir("content/documentation/reviews", { recursive: true });
await writeFile("content/documentation/reviews/authentication-captures-2026-10-08.json", JSON.stringify(evidence, null, 2) + "\n");
console.log(`Captured ${evidence.length} anonymous controls; visual review remains required.`);
