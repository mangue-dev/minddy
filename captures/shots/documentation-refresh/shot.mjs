/** Refresh useful documentation controls from the local or hosted application at native 2x resolution. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { openPage, settle, CAPTURE, CAPTURE_LOCALES } from "../../lib/browser.mjs";
import { settleDocumentationPage, captureDocumentationControl } from "../../lib/documentation-frame.mjs";
import { catalog } from "../../lib/messages.mjs";
import { demoProse, translateDemo } from "../../lib/demo-prose.mjs";

if (!["localhost", "127.0.0.1", "www.minddy.app"].includes(new URL(CAPTURE.baseUrl).hostname)) throw new Error("Documentation refresh requires the local candidate or the canonical hosted application.");
const output = "output/documentation-captures/visual-refresh-captures-2026-10-09.json";
let records = JSON.parse(await readFile(output, "utf8").catch(error => { if (error.code === "ENOENT") return "[]"; throw error; }));
const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const requested = process.env.DOC_CAPTURE_SCREENS?.split(",").filter(Boolean);
const locales = process.env.CAPTURE_LOCALES?.split(",").filter(Boolean);
if (!locales || locales.length !== 1 || !CAPTURE_LOCALES.includes(locales[0])) throw new Error("Select exactly one locale for a bounded documentation capture batch.");
if (!requested?.length || requested.length > 3) throw new Error("Select one to three documentation screens per batch.");
const settings = [
  ["profile-and-preferences-preferences-workflow", "preferences", "account-appearance"],
  ["account-security-workflow", "security", "account-security"],
  ["devices-and-notifications-workflow", "inbox", "account-push-devices"],
  ["ai-keys-and-models-workflow", "agent", "account-ai-provider"],
  ["ai-keys-and-models-defaults-workflow", "agent", "account-agent"],
  ["transfer-between-instances-workflow", "data", "account-data-import"],
  ["transfer-between-instances-export-workflow", "data", "account-data-export"],
  ["privacy-and-account-deletion-workflow", "data", "account-data-delete"],
  // MCP for Numo is a card of the "AI & Numo" tab since MIN-737.
  ["numo-mcp-connections-workflow", "agent", "account-mcp-clients"],
  ["external-minddy-mcp-workflow", "mcp", "account-mcp"],
];
const knownScreens = new Set([...settings.map(([screen]) => screen),
  "profile-and-preferences-workflow", "personal-statistics-workflow",
  "project-general", "project-members", "publish-a-feedback-board-workflow",
  "external-minddy-mcp-install-workflow", "numo-mcp-connections-config-workflow",
  "import-issues-workflow", "work-with-numo-workflow", "scheduled-routines-workflow", "install-the-pwa-workflow",
  "install-locally-wizard", "install-a-server-wizard", "web-and-mobile-workflow",
]);
if (requested.some(screen => !knownScreens.has(screen))) throw new Error("The documentation batch contains an unknown screen ID.");
for (const locale of locales) {
  const { browser, context, page } = await openPage({ locale, theme: "light", viewport: { width: 1440, height: 1800 }, launchArgs: ["--force-color-profile=srgb", "--disable-lcd-text"] });
  page.setDefaultTimeout(20000);
  const messages = await catalog(locale);
  const fixture = JSON.parse(await readFile(new URL(`../documentation-work/${locale}/fixture.json`, import.meta.url), "utf8"));
  const writes = [], adaptations = [];
  const numo = JSON.parse(await readFile("captures/shots/documentation-refresh/numo-localized-demo-fixture.json", "utf8"));
  for (let index = 0; index < numo.original.length; index++) fixture.mapping[numo.original[index]] = numo.translations[locale][index];
  // The demo board's default view is stored under its French name.
  for (const name of ["Toutes", "All", "Alle", "Todos", "Tutti"]) fixture.mapping[name] = messages.Board.defaultViewName;
  // Demo data seeded for the reader figures (the published "Feedback guide" page…).
  const reader = JSON.parse(await readFile("captures/shots/documentation-reader/localized-fixture.json", "utf8"));
  reader.original.forEach((text, index) => { fixture.mapping[text] ??= reader.translations[locale][index]; });
  const routines = JSON.parse(await readFile("captures/shots/documentation-refresh/routine-localized-capture-candidates.json", "utf8"));
  for (let index = 0; index < routines.original.length; index++) fixture.mapping[routines.original[index]] = routines.translations[locale][index];
  const prose = demoProse(fixture.mapping);
  try {
    await context.route("**/api/**", async route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      if (request.method() !== "GET") {
        if (path.startsWith("/api/me/app-tabs")) return route.fallback();
        writes.push({ method: request.method(), path });
        return route.abort("blockedbyclient");
      }
      // `/api/stats` names the demo projects and objectives in the profile.
      if (!path.startsWith(`/api/projects/${fixture.projectId}`) && !/^\/api\/(assistant|documents|numo|routines|stats)(\/|$)/.test(path)) return route.fallback();
      const response = await route.fetch().catch(() => null);
      if (!response) return;
      if (!response.ok()) return route.fulfill({ response });
      let body; try { body = await response.json(); } catch { return route.fulfill({ response }); }
      const localized = translateDemo(body, prose);
      if (JSON.stringify(localized) !== JSON.stringify(body)) adaptations.push(path);
      return route.fulfill({ response, json: localized });
    });
    async function capture(screen, path, target, action, viewport = { width: 1440, height: 1800 }) {
      if (requested && !requested.includes(screen)) return;
      if (process.env.DOC_CAPTURE_RESUME === "1" && records.some(r => r.locale === locale && r.screen === screen && r.src)) return;
      try {
        await page.setViewportSize(viewport);
        await page.goto(CAPTURE.baseUrl + path, { waitUntil: "load" });
        await settleDocumentationPage(page, locale);
        if (action) await action();
        const control = typeof target === "function" ? target() : page.locator(target);
        await control.first().waitFor({ state: "visible" });
        await settle(page);
        await page.mouse.move(8, 8);
        await settleDocumentationPage(page, locale);
        const filename = screen === "import-issues-workflow" ? "import-issues-preview-workflow" : screen;
        const src = `/documentation/${locale}/${filename}.png`;
        const dimensions = await captureDocumentationControl(page, control.first(), "public" + src);
        records = records.filter(r => r.locale !== locale || r.screen !== screen);
        records.push({ locale, screen, src, date: new Date().toISOString().slice(0, 10), sourceCommit: commit, workingTreeChanges: true, runtime: CAPTURE.baseUrl, frameVersion: 2, stableFocus: true, route: path, ...dimensions, submitted: false, blockedWrites: [...writes], displayAdaptation: [...new Set(adaptations)], limitation: "Actual visible controls; no completed save, import, notification delivery or external action is claimed." });
        console.log(`${locale}/${screen}: captured at ${dimensions.deviceScaleFactor}x in light mode`);
      } catch (error) {
        records.push({ locale, screen, error: error.message.split("\n")[0] });
        await mkdir("output/documentation-captures", { recursive: true });
        await writeFile(output, JSON.stringify(records, null, 2) + "\n");
        throw error;
      }
      await mkdir("output/documentation-captures", { recursive: true });
      await writeFile(output, JSON.stringify(records, null, 2) + "\n");
    }
    for (const [screen, tab, section] of settings) await capture(screen, `/settings?tab=${tab}&section=${section}`, () => page.locator(`#settings-section-${section}`).locator(".."));
    // Account settings open on Preferences since the UI/UX refinements batch.
    // The profile header (MIN-737): avatar and name are edited in place —
    // the avatar opens a menu, the name turns into a field. Nothing is saved.
    await capture("profile-and-preferences-workflow", "/settings?tab=profile", () => page.locator("#settings-section-account-profile"), async () => {
      await page.getByRole("button", { name: messages.Profile.changeAvatar, exact: true }).waitFor();
    }, { width: 1440, height: 1100 });
    // Personal statistics now live under the profile header (MIN-737).
    await capture("personal-statistics-workflow", "/settings?tab=profile", () => page.locator("#settings-section-account-statistics"), async () => {
      await page.getByRole("region", { name: messages.Stats.yearStory, exact: true }).first().waitFor();
    }, { width: 1440, height: 2200 });
    // Project settings (MIN-737): the identity header of General, and the
    // Members tab (invite card and member list). Nothing is edited.
    await capture("project-general", `/projects/${fixture.projectId}/settings?tab=general`, () => page.locator("#settings-section-project-general"), async () => {
      await page.getByRole("button", { name: messages.Settings.changeProjectIcon, exact: true }).waitFor();
    }, { width: 1440, height: 1100 });
    await capture("project-members", `/projects/${fixture.projectId}/settings?tab=members`, () => page.locator("#settings-section-project-members").locator("../.."), async () => {
      await page.locator("#settings-section-project-members").getByRole("img").first().waitFor();
    }, { width: 1440, height: 1100 });
    // The Public board card of the Feedback tab (MIN-737). The board's public
    // address is concealed with a neutral bar, as in the previous capture;
    // nothing is toggled.
    await capture("publish-a-feedback-board-workflow", `/projects/${fixture.projectId}/settings?tab=feedback`, () => page.locator("#settings-section-project-feedback-board").locator(".."), async () => {
      await page.locator("#settings-section-project-feedback-board").waitFor();
      await page.locator("#settings-section-project-feedback-board .font-mono").first().evaluate((node) => {
        Object.assign(node.style, { color: "transparent", background: "rgb(148 163 184)", borderRadius: "4px" });
      });
    }, { width: 1440, height: 1600 });
    // Both MCP setups are wizards since MIN-768: the agent's install step,
    // and the sign-in step of a catalog service (Notion opens on it, its
    // method already known). The
    // step column is framed, not the large wizard modal around it. A CSS
    // locator, since the capture hides the dialog itself from the role tree.
    await capture("external-minddy-mcp-install-workflow", "/settings?tab=mcp", "[role=dialog] form", async () => {
      await page.locator("#settings-section-account-mcp").waitFor();
      await page.getByRole("button", { name: "Codex", exact: true }).click();
      // The command embeds the page origin; the figure shows the minddy Cloud
      // endpoint its caption names, whatever runtime was captured.
      await page.getByRole("dialog").locator("code").evaluate((node, origin) => {
        node.textContent = node.textContent.replaceAll(origin, "https://www.minddy.app");
      }, new URL(CAPTURE.baseUrl).origin);
    });
    await capture("numo-mcp-connections-config-workflow", "/settings?tab=agent", "[role=dialog] form", async () => {
      await page.locator("#settings-section-account-mcp-clients").waitFor();
      await page.getByRole("button", { name: "Notion", exact: true }).click();
      // Notion's method comes from the catalog: shown, not asked.
      await page.getByRole("dialog").getByRole("button", { name: messages.McpClients.authChange, exact: true }).waitFor();
    });
    const importTitles = {
      en: ["Prepare the release", "Verify the attachment", "Demonstration checklist"],
      fr: ["Préparer la version", "Vérifier la pièce jointe", "Liste de contrôle de démonstration"],
      de: ["Veröffentlichung vorbereiten", "Anhang überprüfen", "Checkliste für die Demonstration"],
      es: ["Preparar la versión", "Verificar el archivo adjunto", "Lista de comprobación de demostración"],
      it: ["Preparare la versione", "Verificare l’allegato", "Lista di controllo dimostrativa"],
      "pt-BR": ["Preparar a versão", "Verificar o anexo", "Lista de verificação de demonstração"],
    };
    await capture("import-issues-workflow", `/projects/${fixture.projectId}/settings?tab=import&section=project-import`, () => page.locator("#settings-section-project-import").locator(".."), async () => {
      const titles = importTitles[locale];
      const csv = "title,description,status,priority,effort,id,parent\n" + `"${titles[0]}","${titles[2]}",todo,high,m,DEMO-1,\n"${titles[1]}",,backlog,medium,s,DEMO-2,DEMO-1\n`;
      await page.locator("input[type=file]").setInputFiles({ name: "minddy-demo.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
      await page.getByText("minddy-demo.csv", { exact: true }).waitFor();
      const mapping = page.getByRole("button").filter({ hasText: messages.Settings.importMappingTitle });
      if (await mapping.getAttribute("data-state") === "closed") await mapping.click();
    });
    await capture("work-with-numo-workflow", `/projects/${fixture.projectId}`, () => page.getByRole("dialog").first(), async () => {
      await page.getByText("AUR-1", { exact: true }).first().waitFor();
      await page.keyboard.press("g"); await page.keyboard.press("a");
      const panel = page.getByRole("dialog").first();
      // The history popover ignores clicks while the panel is still opening: retry.
      const conversation = page.getByRole("button", { name: new RegExp(numo.translations[locale][0]) });
      for (let attempt = 0; attempt < 8 && !(await conversation.count()); attempt += 1) {
        await page.waitForTimeout(750);
        await panel.getByRole("button", { name: messages.Assistant.conversations, exact: true }).click();
        await page.waitForTimeout(750);
      }
      await conversation.first().dispatchEvent("click");
      await panel.getByText(numo.translations[locale][4], { exact: false }).waitFor();
    }, { width: 1200, height: 900 });
    await capture("scheduled-routines-workflow", "/routines", "main", async () => {
      const title = routines.translations[locale][0];
      await page.getByRole("button", { name: new RegExp(title) }).first().click();
      await page.getByRole("table").waitFor();
      await page.getByRole("button", { name: messages.Routines.actionsLabel, exact: true }).click();
      await page.getByRole("menuitem", { name: messages.Common.edit, exact: true }).click();
      await page.getByText(messages.Routines.spendCapLabel, { exact: true }).waitFor();
    }, { width: 1440, height: 1050 });
    const pwaPaths = { en: "/download/mobile-pwa", fr: "/fr/telecharger/pwa-mobile", de: "/de/herunterladen/mobile-pwa", es: "/es/descargar/pwa-movil", it: "/it/scarica/pwa-mobile", "pt-BR": "/pt-br/baixar/pwa-movel" };
    await capture("install-the-pwa-workflow", pwaPaths[locale], "#ios-install");
    const wizardPaths = { en: "/self-hosting/install", fr: "/fr/auto-hebergement/installer", de: "/de/selbst-hosten/installieren", es: "/es/autoalojamiento/instalar", it: "/it/hosting-autonomo/installa", "pt-BR": "/pt-br/auto-hospedagem/instalar" };
    const installer = messages.SelfHostingInstall;
    for (const mode of ["local", "team"]) await capture(mode === "local" ? "install-locally-wizard" : "install-a-server-wizard", `${wizardPaths[locale]}?route=${mode}`, () => page.locator("h1").locator("..").locator(".."), async () => {
      await page.getByRole("button", { name: installer.confirmDesktop, exact: true }).click();
      await page.getByRole("heading", { name: installer.routeTitle, exact: true }).waitFor();
      if (mode === "local") return;
      // The encryption step now explains the release's default instead of asking.
      await page.getByRole("button", { name: installer.continueLabel, exact: true }).click();
      await page.getByRole("heading", { name: installer.encryptionReleaseTitle, exact: true }).waitFor();
      await page.getByRole("button", { name: installer.continueLabel, exact: true }).click();
      await page.getByRole("heading", { name: installer.migrateTitle, exact: true }).waitFor();
      await page.getByRole("button").filter({ hasText: installer.migrateNo }).click();
      await page.getByRole("button", { name: installer.continueLabel, exact: true }).click();
      await page.getByRole("textbox", { name: installer.serverIpLabel, exact: false }).fill("192.168.1.50");
      await page.getByRole("textbox", { name: installer.emailLabel, exact: false }).fill("ops@example.com");
      await page.getByRole("button", { name: installer.continueLabel, exact: true }).click();
      await page.getByRole("heading", { name: installer.backendTitle, exact: true }).waitFor();
      await page.getByRole("button").filter({ has: page.getByText(installer.fullTitle, { exact: true }) }).click();
    });
    await capture("web-and-mobile-workflow", `/projects/${fixture.projectId}?issue=${fixture.issueId}`, () => page.getByRole("dialog").first(), async () => {
      await page.getByRole("dialog").first().getByRole("button", { name: messages.IssueUI.changeStatusAria, exact: true }).waitFor();
    }, { width: 390, height: 1000 });
  } finally {
    await context.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {});
    await browser.close();
  }
}
