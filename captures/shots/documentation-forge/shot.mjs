/**
 * Documentation figures whose data comes from a forge or a push subscription
 * the demo account does not have: the linked repository card, a repository
 * skill preview, a registered push device and the pull request viewer.
 *
 * Every forge and push reading is answered with demonstration JSON in the
 * browser (GET responses only). No forge is called and nothing is written:
 * every non-GET request is blocked, except the app-tab and local-snapshot
 * bookkeeping the shell performs on navigation. See `intent.md`.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { openPage, settle, CAPTURE, CAPTURE_LOCALES } from "../../lib/browser.mjs";
import { settleDocumentationPage, captureDocumentationControl } from "../../lib/documentation-frame.mjs";
import { catalog } from "../../lib/messages.mjs";

if (!["localhost", "127.0.0.1", "www.minddy.app"].includes(new URL(CAPTURE.baseUrl).hostname)) throw new Error("Documentation captures require the local candidate or the canonical hosted application.");
const output = "output/documentation-captures/forge-captures.json";
let records = JSON.parse(await readFile(output, "utf8").catch(error => { if (error.code === "ENOENT") return "[]"; throw error; }));
const SCREENS = ["forge-issue-sync-workflow", "repository-skills-workflow", "devices-and-notifications-registered", "review-pull-requests-workflow"];
const requested = process.env.DOC_CAPTURE_SCREENS?.split(",").filter(Boolean);
const locales = process.env.CAPTURE_LOCALES?.split(",").filter(Boolean);
if (!locales || locales.length !== 1 || !CAPTURE_LOCALES.includes(locales[0])) throw new Error("Select exactly one locale for a bounded documentation capture batch.");
if (!requested?.length || requested.length > 3) throw new Error("Select one to three documentation screens per batch.");
if (requested.some(screen => !SCREENS.includes(screen))) throw new Error("The documentation batch contains an unknown screen ID.");
const locale = locales[0];

// ── Demonstration data ──────────────────────────────────────────────────────
const REPO = "aurora-labs/aurora";
const SKILL_PATH = ".agents/skills/documentation-demo/SKILL.md";
/** Demo prose, written in the capture locale with the informal register. */
const SKILL_TEXT = {
  en: ["Verify a small change in the isolated reader acceptance repository.", "Keep changes within this disposable repository. Run `npm test` after the change.\nInclude the observed test result in your report. Do not merge the pull request."],
  fr: ["Vérifie une petite modification dans le dépôt de recette isolé.", "Limite tes modifications à ce dépôt jetable. Lance `npm test` après la modification.\nIndique dans ton rapport le résultat de test observé. Ne fusionne pas la pull request."],
  de: ["Prüfe eine kleine Änderung im isolierten Abnahme-Repository.", "Ändere nur dieses Wegwerf-Repository. Führe danach `npm test` aus.\nNenne das beobachtete Testergebnis in deinem Bericht. Führe den Pull Request nicht zusammen."],
  es: ["Verifica un pequeño cambio en el repositorio de aceptación aislado.", "Limita tus cambios a este repositorio desechable. Ejecuta `npm test` después del cambio.\nIncluye en tu informe el resultado de las pruebas que observaste. No fusiones la pull request."],
  it: ["Verifica una piccola modifica nel repository di collaudo isolato.", "Limita le modifiche a questo repository usa e getta. Esegui `npm test` dopo la modifica.\nRiporta nel tuo resoconto il risultato dei test osservato. Non unire la pull request."],
  "pt-BR": ["Verifique uma pequena alteração no repositório de aceitação isolado.", "Mantenha suas alterações neste repositório descartável. Rode `npm test` depois da alteração.\nInclua no seu relatório o resultado do teste observado. Não mescle o pull request."],
};
/** The stored device label, as a device of that language would show it. */
const DEVICE_LABEL = { en: "Chrome on macOS", fr: "Chrome sur macOS", de: "Chrome unter macOS", es: "Chrome en macOS", it: "Chrome su macOS", "pt-BR": "Chrome no macOS" };
const PR_TITLE = {
  en: "Trim the name and fall back to World in the greeting",
  fr: "Supprimer les espaces du nom et revenir à World dans la salutation",
  de: "Leerzeichen im Namen entfernen und in der Begrüßung auf World zurückgreifen",
  es: "Recortar el nombre y usar World como respaldo en el saludo",
  it: "Rimuovere gli spazi dal nome e ripiegare su World nel saluto",
  "pt-BR": "Remover os espaços do nome e usar World como alternativa na saudação",
};

const PR_ID = "demo-forge-pr-12";
const PR_NUMBER = 12;
const PR_URL = `https://github.com/${REPO}/pull/${PR_NUMBER}`;
const BRANCH = "numo/greeting-trim-fallback";
const NUMO = { login: "Numo", avatar_url: null };
const OPENED_AT = "2026-09-04T09:12:00.000Z";
const PATCH_SOURCE = `@@ -1,3 +1,5 @@
 export function greeting(name) {
-  return \`Hello, \${name}!\`;
+  const trimmedName = name.trim();
+  const displayName = trimmedName || 'World';
+  return \`Hello, \${displayName}!\`;
 }`;
const PATCH_TEST = `@@ -5,3 +5,11 @@ import { greeting } from './greeting.js';
 test('greets the supplied name', () => {
   assert.equal(greeting('Alex'), 'Hello, Alex!');
 });
+
+test('trims surrounding spaces', () => {
+  assert.equal(greeting('  Alex  '), 'Hello, Alex!');
+});
+
+test('falls back to World for an empty name', () => {
+  assert.equal(greeting('   '), 'Hello, World!');
+});`;
const FILES = [
  { filename: "greeting.js", status: "modified", additions: 3, deletions: 1, patch: PATCH_SOURCE },
  { filename: "greeting.test.js", status: "modified", additions: 8, deletions: 0, patch: PATCH_TEST },
];
for (const file of FILES) {
  const lines = file.patch.split("\n").filter(line => !line.startsWith("@@"));
  if (lines.filter(l => l.startsWith("+")).length !== file.additions || lines.filter(l => l.startsWith("-")).length !== file.deletions) throw new Error(`The demo patch of ${file.filename} does not match its counters.`);
}
const HEAD_SHA = "3e9a1c27f5b04d8e96a2c1b7f0d4e85a6c39b712";
const COMMITS = [{ sha: HEAD_SHA, message: PR_TITLE.en, author: NUMO, authorName: "Numo", authorEmail: "numo@example.test", authoredAt: OPENED_AT }];
const MERGE_METHODS = ["squash", "merge", "rebase"];

function fixtures(projectId) {
  const link = {
    id: "demo-forge-link", provider: "github", connection_id: "demo-forge-connection", external_repo_id: "demo-aurora",
    repo_owner: "aurora-labs", repo_name: "aurora", repo_full_name: REPO, repo_previous_names: [], default_branch: "main",
    account_login: "aurora-labs", issue_sync_enabled: false, issue_sync_backfilled_at: null, created_at: "2026-09-01T08:00:00.000Z",
  };
  const skill = { path: SKILL_PATH, name: "documentation-demo", description: SKILL_TEXT[locale][0], source: ".agents/skills" };
  const listItem = {
    prId: PR_ID, createdByMe: true, reviewRequestedForMe: false, pr_number: PR_NUMBER, pr_url: PR_URL, pr_state: "open",
    provider: "github", title: PR_TITLE[locale], author: NUMO, head_branch: BRANCH, created_at: OPENED_AT, updated_at: OPENED_AT,
    issue: null, issues: [], project: null,
  };
  const pr = {
    number: PR_NUMBER, url: PR_URL, state: "open", draft: false, merged: false, title: PR_TITLE[locale], body: "",
    head: BRANCH, base: "main", headSha: HEAD_SHA, commitCount: 1, mergeable: true, mergeableState: "clean",
    mergeabilityReason: "clean", user: NUMO, createdAt: OPENED_AT, updatedAt: OPENED_AT, requestedReviewers: [],
  };
  const readiness = {
    state: "ready", blockers: [],
    passed: [
      { id: "reviewable", kind: "reviewable", required: true, source: "pull_request" },
      { id: "mergeable", kind: "mergeability", required: true, source: "pull_request" },
    ],
    mergeAllowed: true, methods: MERGE_METHODS, preferredMethod: "squash",
  };
  return {
    gitLink: { link, isOwner: true, providers: [{ id: "github", configured: true, connection: { id: link.connection_id, account_login: "aurora-labs" } }, { id: "gitlab", configured: false, connection: null }], writeMissingUrl: null },
    skills: { skills: [skill] },
    skill: { skill: { ...skill, content: SKILL_TEXT[locale][1] } },
    push: {
      devices: [{
        id: "demo-push-device", endpoint: "https://push.example.test/demo-device", transport: "web", native_installation_id: null,
        device_label: DEVICE_LABEL[locale], locale, enabled: true,
        created_at: "2026-10-20T08:15:00.000Z", last_seen_at: "2026-10-20T18:34:00.000Z", last_push_at: "2026-10-20T18:34:00.000Z",
      }],
      capabilities: { web: true, apns: false, wns: false },
    },
    list: { pullRequests: [listItem], hasMore: false, truncated: false, repoCount: 1, anyPr: true },
    detail: {
      pr, files: FILES, provider: "github",
      checks: { checks: [], state: null, passing: 0, total: 0, startedAt: null, completedAt: null }, checksError: null,
      reviews: { approvals: 0, changesRequested: 0, requiredApprovals: 0 },
      // This instance cannot authorize a GitHub user: the viewer callout explains it.
      viewer: { provider: "github", configured: false, connected: false, login: null, avatarUrl: null, capability: "none", numoLogin: NUMO.login },
      mergeMethods: MERGE_METHODS, mergePolicy: null, readiness, reviewThreads: [],
    },
    readiness,
    projectId,
  };
}

/** Answers a GET with demonstration data, or returns null to let it through. */
function demoResponse(path, search, data) {
  const project = `/api/projects/${data.projectId}`;
  if (path === `${project}/git-link`) return search.has("candidates") ? { candidates: [] } : data.gitLink;
  if (path === "/api/projects/git-linked") return { projectIds: [data.projectId] };
  if (path === `${project}/skills`) return search.get("path") === SKILL_PATH ? data.skill : data.skills;
  if (path === "/api/account/push-subscriptions") return data.push;
  if (path === "/api/pull-requests/count") return { count: 1 };
  if (path === "/api/pull-requests") return data.list;
  if (path === "/api/pull-requests/readiness") return { readiness: { [PR_ID]: data.readiness }, unavailablePrIds: [] };
  const prBase = `/api/pull-requests/${PR_ID}`;
  if (path === prBase) return data.detail;
  if (path === `${prBase}/readiness`) return { provider: "github", readiness: data.readiness };
  if (path === `${prBase}/comments`) return { comments: [], timeline: [], reactions: [] };
  if (path === `${prBase}/commits`) return { commits: COMMITS, truncated: false };
  if (path === `${prBase}/review-comments`) return { comments: [], threads: [], reactions: [] };
  if (path === `${prBase}/comment-edits`) return { edits: [] };
  return null;
}

// ── Capture ─────────────────────────────────────────────────────────────────
const { browser, context, page } = await openPage({ locale, theme: "light", viewport: { width: 1440, height: 1800 }, launchArgs: ["--force-color-profile=srgb", "--disable-lcd-text"] });
page.setDefaultTimeout(20000);
const messages = await catalog(locale);
const writes = [], unexpected = [];
try {
  // The demo project's id differs between worlds: resolve it from the session.
  const projectsResponse = await context.request.get(`${CAPTURE.baseUrl}/api/projects`);
  if (!projectsResponse.ok()) throw new Error(`Could not list the demo projects (${projectsResponse.status()}).`);
  const aurora = (await projectsResponse.json()).find(project => project.key === "AUR");
  if (!aurora) throw new Error("The signed-in demo account has no project with the key AUR.");
  const data = fixtures(aurora.id);
  // Headless Chromium reports notifications as denied. The figure shows a
  // browser that has not been asked yet; nothing ever requests permission.
  await context.addInitScript(() => {
    if ("Notification" in window) Object.defineProperty(Notification, "permission", { get: () => "default" });
  });

  await context.route("**/api/**", async route => {
    const request = route.request(), url = new URL(request.url());
    if (request.method() !== "GET") {
      if (/^\/api\/me\/(app-tabs|local-snapshots)(\/|$)/.test(url.pathname)) return route.fallback();
      writes.push({ method: request.method(), path: url.pathname });
      return route.abort("blockedbyclient");
    }
    const body = demoResponse(url.pathname, url.searchParams, data);
    if (body) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    // Any other forge reading of the demo PR must never reach a real forge.
    if (url.pathname.startsWith("/api/pull-requests/")) {
      unexpected.push(url.pathname);
      return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Not available in the demonstration" }) });
    }
    return route.fallback();
  });

  async function capture(screen, path, target, action, viewport = { width: 1440, height: 1800 }) {
    if (!requested.includes(screen)) return;
    try {
      await page.setViewportSize(viewport);
      await page.goto(CAPTURE.baseUrl + path, { waitUntil: "load" });
      await settleDocumentationPage(page, locale);
      if (action) await action();
      const control = target();
      await control.first().waitFor({ state: "visible" });
      await settle(page);
      await page.mouse.move(8, 8);
      await settleDocumentationPage(page, locale);
      if (await page.locator("[data-sonner-toast]").count()) throw new Error("A toast is visible on the page.");
      const src = `/documentation/${locale}/${screen}.png`;
      const dimensions = await captureDocumentationControl(page, control.first(), "public" + src);
      records = records.filter(r => r.locale !== locale || r.screen !== screen);
      records.push({ locale, screen, src, viewport: dimensions.viewport, padding: dimensions.padding, deviceScaleFactor: dimensions.deviceScaleFactor, theme: dimensions.theme, date: "2026-10-22", route: path.replace(aurora.id, "<aurora>"), displayAdaptation: "response-only demonstration data", blockedWrites: [...writes], unexpectedReads: [...new Set(unexpected)] });
      console.log(`${locale}/${screen}: captured at ${dimensions.deviceScaleFactor}x in light mode`);
    } finally {
      await mkdir("output/documentation-captures", { recursive: true });
      await writeFile(output, JSON.stringify(records, null, 2) + "\n");
    }
  }

  // The Git card of the project settings: a linked demo repository, issue sync off.
  await capture("forge-issue-sync-workflow", `/projects/${aurora.id}/settings?tab=git&section=project-git`, () => page.locator("#settings-section-project-git").locator(".."), async () => {
    await page.locator("#git-issue-sync").waitFor();
  }, { width: 1440, height: 1100 });

  // The skill preview, opened from a skill chip placed in the Numo composer.
  await capture("repository-skills-workflow", `/projects/${aurora.id}`, () => page.getByRole("dialog").filter({ has: page.getByText(SKILL_PATH, { exact: true }) }), async () => {
    await page.getByText("AUR-1", { exact: true }).first().waitFor();
    await page.keyboard.press("g"); await page.keyboard.press("a");
    const composer = page.locator("[contenteditable=true]").last();
    await composer.waitFor();
    await composer.click();
    await page.keyboard.type("$documentation");
    await page.getByText("documentation-demo", { exact: true }).first().waitFor();
    await page.keyboard.press("Enter");
    await page.locator("[data-skill-path]").getByRole("button").first().click();
    await page.getByText("npm test", { exact: true }).waitFor();
  }, { width: 1200, height: 900 });

  // The push devices card: one registered device, this browser not subscribed.
  await capture("devices-and-notifications-registered", "/settings?tab=inbox&section=account-push-devices", () => page.locator("#settings-section-account-push-devices").locator(".."), async () => {
    await page.getByText(DEVICE_LABEL[locale], { exact: true }).waitFor();
  }, { width: 1440, height: 1100 });

  // The pull request viewer on its Changes tab.
  await capture("review-pull-requests-workflow", `/pull-requests?pr=${PR_ID}`, () => page.locator("body"), async () => {
    await page.getByRole("heading", { name: PR_TITLE[locale] }).first().waitFor();
    await page.getByRole("tab", { name: new RegExp(`^${messages.PullRequests.tabChanges}`) }).click();
    await page.getByText("greeting.test.js", { exact: true }).first().waitFor();
    // Syntax highlighting arrives from a worker after the plain diff: wait for
    // the `export` keyword to become its own colored token.
    const keyword = page.getByText("export", { exact: true }).first();
    await keyword.waitFor({ timeout: 30000 });
    await page.waitForFunction(element => {
      const color = getComputedStyle(element).color;
      return color !== getComputedStyle(element.parentElement).color || !/^rgb\((\d+), \1, \1\)$/.test(color);
    }, await keyword.elementHandle(), { timeout: 30000 });
    await page.waitForTimeout(500);
  }, { width: 1480, height: 1100 });
} finally {
  if (unexpected.length) console.log(`Unexpected pull request reads: ${[...new Set(unexpected)].join(", ")}`);
  if (writes.length) console.log(`Blocked writes: ${writes.map(w => `${w.method} ${w.path}`).join(", ")}`);
  await context.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {});
  await browser.close();
}
