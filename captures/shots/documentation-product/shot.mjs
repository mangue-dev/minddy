/** Actual candidate controls, with exact seeded demo prose localized in read responses. */
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { openPage, CAPTURE, CAPTURE_LOCALES } from '../../lib/browser.mjs';
import { captureDocumentationControl, settleDocumentationPage } from '../../lib/documentation-frame.mjs';
import { catalog } from '../../lib/messages.mjs';
import { pageDemoFixture as fixture, translateDemoPageValues } from './localize.mjs';
const project = fixture.projectId;
const doc = fixture.pageId;
const origin = new URL(CAPTURE.baseUrl);
if (!['localhost', '127.0.0.1'].includes(origin.hostname)) throw new Error('Product documentation captures require a local candidate instance.');
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const captureDate = new Date().toISOString().slice(0, 10);
const recordPath = `content/documentation/reviews/product-captures-${process.env.CAPTURE_LOCALES ?? 'all'}-${captureDate}.json`;
let evidence = [];
try { evidence = JSON.parse(await readFile(recordPath, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
function recordCapture(record) {
 evidence = evidence.filter(previous => previous.locale !== record.locale || previous.screen !== record.screen);
 evidence.push(record);
}
const issueDrafts = {
 en: ['Add keyboard shortcuts to the command palette', 'Show the shortcut next to each command and make it available throughout the application.'],
 fr: ['Ajouter des raccourcis à la palette de commandes', 'Afficher le raccourci à côté de chaque commande et le rendre disponible dans toute l’application.'],
 de: ['Tastenkürzel zur Befehlspalette hinzufügen', 'Das Tastenkürzel neben jedem Befehl anzeigen und in der gesamten Anwendung verfügbar machen.'],
 es: ['Añadir atajos a la paleta de comandos', 'Mostrar el atajo junto a cada comando y permitir usarlo en toda la aplicación.'],
 it: ['Aggiungere scorciatoie alla palette dei comandi', 'Mostrare la scorciatoia accanto a ogni comando e renderla disponibile in tutta l’applicazione.'],
 'pt-BR': ['Adicionar atalhos à paleta de comandos', 'Mostrar o atalho ao lado de cada comando e disponibilizá-lo em todo o aplicativo.'],
};
async function captureControl(locale, screen, path, action, anchor, target = 'main') {
 if (process.env.DOC_CAPTURE_RESUME === "1" && evidence.some(record => record.locale === locale && record.screen === screen && record.padding === 24 && record.src)) return;
 const messages = await catalog(locale);
 const { browser, context, page } = await openPage({ locale, theme: 'light', viewport: { width: 1440, height: screen === 'page-comments' ? 600 : 1080 } });
 const changedResponses = [];
 const blockedWrites = [];
 const navigationWrites = [];
 try {
  await context.route('**/api/**', async route => {
   const request = route.request(); const url = new URL(request.url());
   if (request.method() !== 'GET') {
    if (url.pathname.startsWith('/api/me/app-tabs')) { navigationWrites.push({ method: request.method(), route: url.pathname }); return route.fallback(); }
    blockedWrites.push({ method: request.method(), route: url.pathname }); return route.abort('blockedbyclient');
   }
   if (!url.pathname.startsWith(`/api/projects/${project}/pages`)) return route.fallback();
   const response = await route.fetch().catch(error => {
    if (/Request context disposed|Target page, context or browser has been closed/.test(error.message)) return null;
    throw new Error(`Could not read capture route ${url.pathname}`);
   });
   if (!response) return;
   if (!response.ok()) return route.fulfill({ response });
   const body = await response.json();
   const localized = translateDemoPageValues(body, locale);
   if (JSON.stringify(body) !== JSON.stringify(localized)) changedResponses.push(url.pathname);
   return route.fulfill({ response, json: localized });
  });
  await page.goto(CAPTURE.baseUrl + path, { waitUntil: 'load' });
  if (anchor) await anchor(page, messages);
  await settleDocumentationPage(page, locale);
  if (action) await action(page, messages, locale);
  if (screen !== 'page-export') await page.mouse.move(8, 8);
  await page.waitForTimeout(550);
  await settleDocumentationPage(page, locale);
  const control = typeof target === 'function' ? target(page, messages) : page.locator(target);
  await control.first().waitFor({ state: 'visible', timeout: 15000 });
  const viewport = page.viewportSize();
  const out = `public/documentation/${locale}/${screen}.png`;
  const framed = await captureDocumentationControl(page, control.first(), out);
  recordCapture({ locale, screen, src: out.slice('public'.length), sourceCommit, candidateVersion: '0.11.1', date: captureDate, workingTreeChanges: true, route: path, theme: 'light', initialBrowserViewport: [viewport.width, viewport.height], viewport: framed.viewport, padding: framed.padding, language: await page.locator('html').getAttribute('lang'), submitted: false, displayAdaptation: changedResponses, blockedWrites, navigationWrites, reviewed: false, limitation: 'Visible controls only. No completed save, share, restore, import or release outcome is claimed.' });
  console.log(`${locale}/${screen}: captured`);
 } catch (error) {
  recordCapture({ locale, screen, route: path, error: error.message, submitted: false, reviewed: false });
  console.error(`${locale}/${screen}: ${error.message.split('\n')[0]}`);
 } finally { await browser.close(); await mkdir('content/documentation/reviews', { recursive: true }); await writeFile(recordPath, JSON.stringify(evidence, null, 2)+'\n'); }
}
const base = `/projects/${project}`;
const pagePath = `${base}/pages/${doc}`;
const readyPage = page => page.locator('main a').filter({ hasText: 'AUR-2' }).first().waitFor({ state: 'visible', timeout: 20000 });
const readyBoard = page => page.getByText('AUR-1', { exact: true }).first().waitFor({ state: 'visible', timeout: 20000 });
const requested = process.env.DOC_CAPTURE_SCREENS?.split(',');
async function prepareIssueDraft(p, m, locale) {
 await p.keyboard.press('c');
 const dialog=p.getByRole('dialog',{name:m.IssueUI.newIssueTitle,exact:true});
 await dialog.waitFor();
 await dialog.locator('textarea').first().fill(issueDrafts[locale][0]);
 await dialog.locator('[contenteditable="true"]').first().fill(issueDrafts[locale][1]);
 const smart=dialog.getByRole('button',{name:m.IssueUI.smartFillChip,exact:true});
 if (await smart.getAttribute('aria-pressed')==='true') await smart.click();
 return dialog;
}
const run = async (...args) => { if (!requested || requested.includes(args[1])) await captureControl(...args); };
for (const locale of (process.env.CAPTURE_LOCALES?.split(',') ?? CAPTURE_LOCALES)) {
 await run(locale, 'project-general', `${base}/settings`, null, (p,m)=>p.getByRole('heading',{name:m.Settings.generalTab,exact:true}).waitFor());
 await run(locale, 'project-members', `${base}/settings?tab=members`, null, (p,m)=>p.getByRole('heading',{name:m.Settings.membersTab,exact:true}).waitFor());
 await run(locale, 'project-recurrences', `${base}/settings?tab=recurrences`, null, (p,m)=>p.locator('main').getByText(m.Recurrence.title,{exact:true}).waitFor());
 await run(locale, 'page-editor', pagePath, null, readyPage);
 await run(locale, 'page-export', pagePath, async(p,m)=>{await p.locator('main').getByRole('button',{name:m.Pages.pageOptions,exact:true}).click();await p.getByRole('menuitem',{name:m.Pages.export,exact:true}).click();await p.getByText(m.Pages.exportMarkdown,{exact:true}).waitFor();}, readyPage, p=>p.locator('[data-slot=dropdown-menu-sub-content]').last());
 await run(locale, 'page-comments', pagePath, async(p,m)=>{await p.locator('main').getByRole('button',{name:m.Pages.comments,exact:true}).click();await p.locator('[contenteditable="true"]').last().waitFor();}, readyPage, p=>p.getByRole('dialog'));
 await run(locale, 'page-history', pagePath, async(p,m)=>{await p.getByRole('button',{name:new RegExp('^'+m.Pages.historyTabVersions)}).first().click();await p.getByText(m.Pages.historyTabVersions,{exact:true}).last().waitFor();}, readyPage, p=>p.getByRole('dialog'));
 await run(locale, 'new-issue', base, async(p,m,l)=>{await prepareIssueDraft(p,m,l);}, readyBoard, (p,m)=>p.getByRole('dialog',{name:m.IssueUI.newIssueTitle,exact:true}));
 await run(locale, 'issue-statuses', base, async(p,m,l)=>{const dialog=await prepareIssueDraft(p,m,l);await dialog.getByRole('button',{name:m.IssueUI.changeStatusAria,exact:true}).click();await p.getByRole('listbox').last().waitFor();}, readyBoard, p=>p.getByRole('listbox').last());
 await run(locale, 'issue-date-recurrence', base, async(p,m,l)=>{const dialog=await prepareIssueDraft(p,m,l);await dialog.getByRole('button',{name:m.IssueUI.changeDueDateAria,exact:true}).click();await p.getByText(m.Recurrence.recurring,{exact:true}).last().click();}, readyBoard, p=>p.locator('[data-radix-popper-content-wrapper]').last());
 await run(locale, 'page-publish', pagePath, async(p,m)=>{await p.locator('main').getByRole('button',{name:m.Pages.pageOptions,exact:true}).click();await p.getByText(m.Pages.publish,{exact:true}).last().click();await p.getByRole('dialog').waitFor();}, readyPage, p=>p.getByRole('dialog'));
 await run(locale, 'keyboard-shortcuts', base, async(p,_m)=>{await p.keyboard.press('?');await p.getByRole('dialog').waitFor();}, readyBoard, p=>p.getByRole('dialog'));
}
await mkdir('content/documentation/reviews', { recursive: true });
await writeFile(recordPath, JSON.stringify(evidence, null, 2)+'\n');
console.log(`${evidence.filter(r=>r.src).length} captures; ${evidence.filter(r=>r.error).length} gaps; record ${recordPath}`);
