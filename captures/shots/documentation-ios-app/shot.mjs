/**
 * The iOS app's web screens for the `applications` article (MIN-973): its
 * sign-in screen, the AI consent sheet and the Mobile app preferences. See
 * intent.md. Nothing is submitted, answered or toggled; writes are aborted.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { openPage, CAPTURE, CAPTURE_LOCALES } from "../../lib/browser.mjs";
import { settleDocumentationPage, captureDocumentationControl } from "../../lib/documentation-frame.mjs";
import { catalog } from "../../lib/messages.mjs";

if (!["localhost", "127.0.0.1"].includes(new URL(CAPTURE.baseUrl).hostname)) {
  throw new Error("iOS app documentation captures require a local candidate instance.");
}
const locales = process.env.CAPTURE_LOCALES?.split(",").filter(Boolean);
if (!locales || locales.length !== 1 || !CAPTURE_LOCALES.includes(locales[0])) {
  throw new Error("Select exactly one locale with CAPTURE_LOCALES.");
}
const [locale] = locales;
const screens = process.env.DOC_CAPTURE_SCREENS?.split(",").filter(Boolean)
  ?? ["ios-app-sign-in", "ios-app-ai-consent", "ios-app-mobile-preferences"];

const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const output = "output/documentation-captures/ios-app-captures.json";
let records = JSON.parse(await readFile(output, "utf8").catch((error) => {
  if (error.code === "ENOENT") return "[]";
  throw error;
}));

/** An iPhone-sized page (iPhone 17 Pro, in points). */
const PHONE = { width: 402, height: 874 };

/**
 * What Capacitor injects into the app's WebView, and a stand-in for the
 * shell's plugin: enough for `getMobileBridge()` and the surfaces that read
 * it. Every action resolves without doing anything.
 */
function installShell() {
  const resolved = (value) => () => Promise.resolve(value);
  const shell = {
    state: resolved({ origin: location.origin, cloudOrigin: "https://www.minddy.app", isCustomServer: false, version: "0.40.0" }),
    connect: resolved({}),
    useCloud: resolved(undefined),
    openServerPicker: resolved(undefined),
    reload: resolved(undefined),
    setAppearance: resolved(undefined),
    haptic: resolved(undefined),
    setHaptics: resolved(undefined),
    setNavigationBar: resolved(undefined),
    pushPermission: resolved({ permission: "default" }),
    openBrowser: resolved(undefined),
    addListener: () => ({ remove() {} }),
  };
  window.Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => "ios",
    Plugins: { MinddyShell: shell },
  };
}

const blockedWrites = [];
async function blockWrites(context) {
  await context.route("**/*", async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    // Token refresh and read-only RPCs are reads; every other write is refused.
    const read = method === "GET" || method === "HEAD" || method === "OPTIONS"
      || (method === "POST" && (url.pathname.startsWith("/auth/v1/token") || url.pathname.startsWith("/rest/v1/rpc/")));
    if (read) return route.fallback();
    blockedWrites.push(`${method} ${url.origin}${url.pathname}`);
    return route.abort();
  });
}

async function capture(screen, run) {
  const messages = await catalog(locale);
  const authed = screen !== "ios-app-sign-in";
  const { browser, context, page } = await openPage({
    locale,
    theme: "light",
    authed,
    viewport: PHONE,
    launchArgs: ["--force-color-profile=srgb", "--disable-lcd-text"],
  });
  try {
    await context.addInitScript(installShell);
    await blockWrites(context);
    const control = await run(page, context, messages);
    await settleDocumentationPage(page, locale);
    const src = `/documentation/${locale}/${screen}.png`;
    const dimensions = await captureDocumentationControl(page, control, `public${src}`);
    records = records.filter((record) => record.locale !== locale || record.screen !== screen);
    records.push({
      locale,
      screen,
      src,
      date: new Date().toISOString().slice(0, 10),
      sourceCommit: commit,
      runtime: CAPTURE.baseUrl,
      browserViewport: [PHONE.width, PHONE.height],
      ...dimensions,
      adaptation: "Capacitor object and MinddyShell stand-in injected; native chrome not shown.",
      blockedWrites: [...blockedWrites],
      submitted: false,
      reviewed: false,
    });
    console.log(`${locale}/${screen}: captured at ${dimensions.deviceScaleFactor}x`);
  } finally {
    await browser.close();
  }
}

const runs = {
  "ios-app-sign-in": async (page, _context, messages) => {
    await page.goto(`${CAPTURE.baseUrl}/login`, { waitUntil: "load" });
    // The app opens on its welcome slides first; Get started leads to the form.
    await page.getByRole("button", { name: messages.MobileWelcome.start, exact: true }).click();
    const selfHost = page.getByRole("button", { name: messages.DesktopWelcome.selfHostHeading, exact: true });
    await selfHost.waitFor();
    await page.waitForTimeout(800);
    // The smallest block that holds the logo, the form and Self-host minddy.
    return page.locator("main div").filter({ has: page.getByRole("heading", { level: 1 }) }).filter({ has: selfHost }).last();
  },
  "ios-app-ai-consent": async (page) => {
    await page.goto(`${CAPTURE.baseUrl}/home`, { waitUntil: "load" });
    const sheet = page.getByRole("alertdialog");
    await sheet.waitFor({ timeout: 30000 });
    await page.waitForTimeout(800);
    return sheet;
  },
  "ios-app-mobile-preferences": async (page, context, messages) => {
    await context.addCookies([{ name: "minddy-ai-consent", value: "granted", url: CAPTURE.baseUrl }]);
    await page.goto(`${CAPTURE.baseUrl}/settings?tab=preferences`, { waitUntil: "load" });
    const heading = page.getByRole("heading", { level: 2, name: messages.Account.hapticsSectionTitle, exact: true });
    await heading.waitFor({ timeout: 30000 });
    await page.getByRole("switch").last().waitFor();
    await page.waitForTimeout(800);
    return heading.locator("xpath=ancestor::header/..");
  },
};

try {
  for (const screen of screens) {
    if (!runs[screen]) throw new Error(`Unknown screen ${screen}.`);
    await capture(screen, runs[screen]);
  }
} finally {
  await mkdir("output/documentation-captures", { recursive: true });
  await writeFile(output, JSON.stringify(records, null, 2) + "\n");
}
console.log("Inspect every image before recording it as reviewed.");
