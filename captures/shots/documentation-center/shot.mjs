/** Browser evidence for public documentation; draft previews remain visibly distinct. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { openPage, settle, shoot, CAPTURE, CAPTURE_LOCALES } from "../../lib/browser.mjs";
import { documentationPath, parseDocumentation } from "../../../lib/documentation-core.mjs";
import { execFileSync } from "node:child_process";

const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const names = { en: "English", fr: "Français", de: "Deutsch", es: "Español", it: "Italiano", "pt-BR": "Português (Brasil)" };
const results = [];
const out = "output/playwright/min664-documentation";
await mkdir(out, { recursive: true });
for (const locale of CAPTURE_LOCALES) {
  const article = parseDocumentation(await readFile(`content/documentation/${locale}/choose-an-instance.md`, "utf8"));
  const copy = JSON.parse(await readFile(`messages/${locale}.json`, "utf8"));
  for (const theme of ["light", "dark"]) {
    for (const mode of ["desktop", "mobile"]) {
      const viewport = mode === "desktop" ? { width: 1440, height: 900 } : { width: 390, height: 844 };
      const { browser, page } = await openPage({ authed: false, locale, theme, viewport });
      const checks = { locale, theme, mode, sourceCommit, date: "2026-10-08", article: article.id, preview: article.status === "draft" };
      const aiRequests = [];
      page.on("request", request => {
        if (/^\/api\/(?:assistant|numo|faq)(?:\/|$)/.test(new URL(request.url()).pathname)) aiRequests.push(request.url());
      });
      try {
        const root = documentationPath(null, locale);
        const url = documentationPath(article.id, locale);
        await page.goto(`${CAPTURE.baseUrl}${root}`, { waitUntil: "load" });
        await settle(page, { expect: 'form[role="search"]' });
        assert.equal(await page.locator('link[rel="canonical"]').getAttribute("href"), `${CAPTURE.baseUrl}${root}`);
        assert.equal(await page.locator(`footer a[href="${root}"]`).count(), 1);
        if (mode === "mobile") {
          await page.getByRole("button", { name: copy.Landing.mobileMenuOpen, exact: true }).click();
          await page.getByRole("dialog").locator(`a[href="${root}"]`).click();
        } else {
          await page.locator(`header a[href="${root}"]`).click();
        }
        await page.getByRole("searchbox").waitFor();
        checks.publicNavigation = true;
        await shoot(page, `${out}/${locale}-${mode}-${theme}-catalog.png`);
        const input = page.getByRole("searchbox");
        await input.fill(article.title);
        await input.press("Enter");
        await page.waitForURL(current => current.searchParams.get("q") === article.title);
        await page.getByRole("link", { name: article.title, exact: true }).waitFor();
        assert.equal(aiRequests.length, 0);
        checks.search = true;
        checks.searchUsesNoAi = true;
        await page.getByRole("link", { name: article.title, exact: true }).click();
        await page.getByRole("heading", { level: 1, name: article.title, exact: true }).waitFor();
        await settle(page);
        assert.equal(await page.locator("html").getAttribute("lang"), locale);
        await page.waitForFunction(expected => { const links = document.querySelectorAll('link[rel="canonical"]'); return links.length === 1 && links[0].href === expected; }, `${CAPTURE.baseUrl}${url}`);
        assert.equal(await page.locator('link[rel="canonical"]').getAttribute("href"), `${CAPTURE.baseUrl}${url}`);
        const robots = await page.locator('meta[name="robots"]').getAttribute("content");
        assert.equal(robots.includes("noindex"), checks.preview);
        assert.equal(await page.locator('link[rel="alternate"][hreflang]').count(), 7);
        const reportLink = await page.getByRole("link", { name: copy.Documentation.report, exact: true }).getAttribute("href");
        const reportUrl = new URL(reportLink);
        assert.equal(reportUrl.protocol, "mailto:");
        const reportBody = reportUrl.searchParams.get("body");
        for (const line of [`${copy.Documentation.articleLabel}: ${article.id}`, `${copy.Documentation.localeLabel}: ${locale}`, `${copy.Documentation.revisionLabel}: ${article.revision}`]) assert.ok(reportBody.includes(line));
        checks.localizedErrorReport = true;
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        if (mode === "mobile") assert.equal(await page.locator("aside details:visible").getAttribute("open"), null);
        assert.equal(await page.locator('img[src^="/documentation/"]').first().evaluate(img => img.complete && img.naturalWidth > 0), true);
        await page.evaluate(() => window.scrollTo(0, 0));
        await shoot(page, `${out}/${locale}-${mode}-${theme}-article.png`);
        checks.canonical = true; checks.hreflang = true; checks.noOverflow = true; checks.figuresLoaded = true;
        // Native anchors refresh the root layout while keeping the semantic section.
        await page.goto(`${CAPTURE.baseUrl}${url}#responsibilities`, { waitUntil: "load" });
        const next = locale === "fr" ? "de" : "fr";
        await page.getByRole("link", { name: names[next], exact: true }).click();
        await page.waitForURL(`${CAPTURE.baseUrl}${documentationPath(article.id, next)}#responsibilities`);
        await page.waitForFunction(language => document.documentElement.lang === language, next);
        assert.equal(await page.locator('link[rel="canonical"]').getAttribute("href"), `${CAPTURE.baseUrl}${documentationPath(article.id, next)}`);
        checks.languageAndSection = true;
        // A real Tab gesture must reach a link or control, not an unfocusable wrapper.
        await page.waitForLoadState("load");
        await page.locator('a[href="#documentation-article"]').focus();
        await page.keyboard.press("Enter");
        assert.equal(await page.evaluate(() => document.activeElement.id), "documentation-article");
        await page.keyboard.press("Tab");
        const focused = await page.evaluate(() => {
          const element = document.activeElement;
          const style = getComputedStyle(element);
          return { tag: element.tagName, outline: style.outlineStyle, outlineWidth: style.outlineWidth, focusVisible: element.matches(":focus-visible") };
        });
        assert.ok(["A", "BUTTON", "INPUT", "SELECT", "SUMMARY"].includes(focused.tag), JSON.stringify(focused));
        assert.equal(focused.focusVisible, true);
        assert.notEqual(focused.outline, "none");
        assert.ok(parseFloat(focused.outlineWidth) > 0);
        checks.keyboard = focused;
        results.push(checks);
        console.log(`${locale}/${mode}/${theme}: passed${checks.preview ? " (draft preview)" : ""}`);
      } finally { await browser.close(); }
    }
  }
}
await writeFile(`${out}/checks.json`, JSON.stringify(results, null, 2) + "\n");
