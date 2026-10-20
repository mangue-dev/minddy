/**
 * captures/ — capture admin session, preview only.
 *
 * Signs the capture admin in ONCE through the real interface — password, then
 * the TOTP challenge the admin console requires — and saves the browser state
 * to `captures/.auth/admin.json`. Shots then open it with
 * `openPage({ session: "admin" })`. Credentials come from `.env` only
 * (`captures/world/admin-account.mjs` writes them) and are never printed.
 *
 *   CAPTURE_BASE_URL=https://preview.minddy.app node captures/lib/admin-session.mjs
 */
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { chromium } from "playwright";
import { ADMIN_AUTH_STATE } from "./browser.mjs";
import { CAPTURE } from "./config.mjs";
import { assertNonProductionOrigin } from "./database-target.mjs";
import { loadEnv, requireEnv } from "./env.mjs";
import { totpCode, totpRemainingMs } from "./totp.mjs";

export async function refreshAdminSession() {
  loadEnv();
  assertNonProductionOrigin(CAPTURE.baseUrl, "the capture admin session");
  const email = requireEnv("CAPTURES_ADMIN_EMAIL");
  const password = requireEnv("CAPTURES_ADMIN_PASSWORD");
  const totpSecret = requireEnv("CAPTURES_ADMIN_TOTP_SECRET");

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ locale: "en-US" });
    const page = await context.newPage();
    // `load`, as in session.mjs: a click before hydration submits the native form.
    await page.goto(`${CAPTURE.baseUrl}/login`, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);

    const challenge = page.locator("#mfa-code");
    for (let attempt = 1; ; attempt += 1) {
      await page.getByRole("textbox", { name: /e-?mail/i }).fill(email);
      await page.getByRole("textbox", { name: /password/i }).fill(password);
      await page.getByRole("button", { name: /sign in|log in/i }).click();
      if (await challenge.waitFor({ timeout: 15_000 }).then(() => true, () => false)) break;
      if (attempt === 3) {
        throw new Error(
          `captures: the capture admin could not reach the TOTP challenge at ${CAPTURE.baseUrl}. ` +
            "Check its account with node captures/world/admin-account.mjs.",
        );
      }
      await page.waitForTimeout(2_000);
    }

    if (totpRemainingMs() < 5_000) await page.waitForTimeout(totpRemainingMs() + 250);
    // Six digits submit the challenge on their own (OtpInput's onComplete).
    await challenge.fill(totpCode(totpSecret));
    await page.waitForURL((url) => !/\/(login|signup)/.test(url.pathname), { timeout: 30_000 });

    await page.goto(`${CAPTURE.baseUrl}/admin`, { waitUntil: "load" });
    if (!new URL(page.url()).pathname.startsWith("/admin")) {
      throw new Error("captures: the capture admin signed in but the admin console refused the session.");
    }

    await mkdir(dirname(ADMIN_AUTH_STATE), { recursive: true });
    await context.storageState({ path: ADMIN_AUTH_STATE });
    return ADMIN_AUTH_STATE;
  } finally {
    await browser.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  refreshAdminSession()
    .then((path) => console.log(`Admin session saved: ${path}`))
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
