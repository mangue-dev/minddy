/**
 * Instance administration figures of the manual, in the six locales:
 * `instance-administration-overview` and `instance-administration-models`.
 *
 * Runs with the preview-only capture admin (captures/lib/admin-session.mjs)
 * against preview or a local candidate, never production. Every other non-GET
 * request is blocked, so no model, quota or account setting can change; only
 * the admin's own tab-strip state is saved.
 *
 *   CAPTURE_BASE_URL=https://preview.minddy.app node captures/shots/documentation-admin/shot.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { CAPTURE, CAPTURE_LOCALES, openPage, settle } from "../../lib/browser.mjs";
import { assertNonProductionOrigin } from "../../lib/database-target.mjs";
import { captureDocumentationControl, settleDocumentationPage } from "../../lib/documentation-frame.mjs";

assertNonProductionOrigin(CAPTURE.baseUrl, "the instance administration capture");

const SCREENS = [
  { id: "instance-administration-overview", path: "/admin", api: "/api/admin/overview" },
  { id: "instance-administration-models", path: "/admin?tab=models", api: "/api/admin/app-config" },
];
const locales = process.env.CAPTURE_LOCALES?.split(",").filter(Boolean) ?? CAPTURE_LOCALES;
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const records = [];

for (const locale of locales) {
  const { browser, context, page } = await openPage({
    session: "admin",
    locale,
    theme: "light",
    viewport: { width: 1440, height: 1100 },
    launchArgs: ["--force-color-profile=srgb", "--disable-lcd-text"],
  });
  page.setDefaultTimeout(20_000);
  const blockedWrites = [];
  await context.route("**/api/**", (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "GET") return route.fallback();
    // The capture admin's own open tabs and local snapshot: blocking them
    // paints the tab strip's save error into the image. No instance setting.
    if (/^\/api\/me\/(app-tabs|local-snapshots)(\/|$)/.test(path)) return route.fallback();
    blockedWrites.push({ method: request.method(), path });
    return route.abort("blockedbyclient");
  });
  try {
    for (const screen of SCREENS) {
      const loaded = page.waitForResponse((response) =>
        new URL(response.url()).pathname === screen.api && response.ok());
      await page.goto(CAPTURE.baseUrl + screen.path, { waitUntil: "load" });
      await loaded;
      if (!new URL(page.url()).pathname.startsWith("/admin")) {
        throw new Error("The admin console refused the capture session; refresh it with captures/lib/admin-session.mjs.");
      }
      await settleDocumentationPage(page, locale);
      await settle(page);
      await page.mouse.move(8, 8);
      const src = `/documentation/${locale}/${screen.id}.png`;
      const dimensions = await captureDocumentationControl(page, page.locator("body"), `public${src}`);
      records.push({ locale, screen: screen.id, src, date: new Date().toISOString().slice(0, 10), sourceCommit, runtime: CAPTURE.baseUrl, account: "capture admin (preview)", ...dimensions, submitted: false, blockedWrites: [...blockedWrites] });
      console.log(`${locale}/${screen.id}: captured in light mode`);
    }
  } finally {
    await browser.close();
  }
}

await mkdir("output/documentation-captures", { recursive: true });
await writeFile("output/documentation-captures/instance-administration-captures.json", JSON.stringify(records, null, 2) + "\n");
console.log(`Captured ${records.length} administration figures; visual review remains required.`);
