// Native production journeys on the migrated fixture; all writes are journaled.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import sharp from 'sharp';

export async function measureHotJourneys({ page, context, fixture, boardTab, pagesTab, base, measure, frames, diagnostic, output, label, cdp }) {
  const journal = { cleanup: false, ownedTabs: [], iconProject: fixture.projects[0], iconAttempted: false, samples: [], idle: [] };
  const save = () => writeFile(`${output}/${label}-checks.json`, JSON.stringify(journal, null, 2));
  const api = async (route, method = 'GET', data) => {
    let response;
    try { response = await context.request.fetch(`${base}${route}`, { method, ...(data === undefined ? {} : { data }) }); }
    catch { throw new Error(`${method} ${route}: ambiguous transport result`); }
    assert.ok(response.ok(), `${method} ${route}: ${response.status()}`);
    return response.json();
  };
  const tab = (spec) => page.locator(`[data-app-tab-id="${spec.id}"]`);
  const selector = '[data-retained-app-view][data-app-view-active="true"]';
  const active = () => page.locator(selector);
  async function ready(spec, title) {
    journal.stage = { target: spec.custom_name, href: spec.href, title }; await save();
    if (spec.board) await page.waitForFunction(({ spec, selector, title }) => {
      const root = document.querySelector(selector);
      return location.pathname === new URL(spec.href, location.origin).pathname && document.querySelector(`[data-app-tab-id="${spec.id}"]`)?.getAttribute('aria-selected') === 'true' &&
        root?.checkVisibility() && !root.inert && root.querySelectorAll('[data-issue-id]').length === spec.count && (!title || root.textContent.includes(title));
    }, { spec, selector, title }, { timeout: 10000 });
    else {
      await page.locator('.page-editor .tiptap').waitFor({ timeout: 10000 });
      await page.waitForFunction((spec) => location.pathname === new URL(spec.href, location.origin).pathname && document.querySelector(`[data-app-tab-id="${spec.id}"]`)?.getAttribute('aria-selected') === 'true', spec);
    }
  }
  async function visit(spec) { await tab(spec).click(); await ready(spec); await frames(); }
  async function input() {
    await active().locator('button[aria-label="Filters"]').click();
    await page.locator('[role="menu"]').getByRole('menuitem', { name: 'Hide done issues', exact: true }).waitFor();
    await page.keyboard.press('Escape');
  }
  const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(({ name, value }) => [name, value]));
  await save();
  try {
    const project = await api(`/api/projects/${journal.iconProject}`);
    assert.equal(project.owner_id, fixture.userId);
    assert.equal(project.icon_url, null, 'Refuse to replace an existing fixture icon');
    journal.originalIcon = project.icon_url;
    const image = await sharp({ create: { width: 32, height: 32, channels: 4, background: '#e94f37' } }).png().toBuffer();
    journal.iconAttempted = true; await save();
    const upload = await context.request.post(`${base}/api/projects/${journal.iconProject}/icon`, { multipart: { file: { name: 'min614-synthetic.png', mimeType: 'image/png', buffer: image } } });
    assert.ok(upload.ok(), `Icon import: ${upload.status()}`);
    journal.iconUrl = (await upload.json()).icon_url;
    assert.match(journal.iconUrl, /^\/api\/projects\/[0-9a-f-]+\/icon\/content\?v=\d+$/);
    assert.equal((await api(`/api/projects/${journal.iconProject}`)).icon_url, journal.iconUrl); await save();
    const specs = [{ ...boardTab, board: true, count: 600 }, { ...pagesTab, board: false }];
    for (let i = 0; i < 6; i++) specs.push({ id: randomUUID(), href: `/projects/${fixture.projects[i]}`, custom_name: `MIN-614 3d board ${i + 1}`, board: true, count: 100 });
    for (let i = 0; i < 3; i++) {
      const pages = await api(`/api/projects/${fixture.projects[i]}/pages`);
      assert.ok(Array.isArray(pages) && pages.length);
      specs.push({ id: randomUUID(), href: `/projects/${fixture.projects[i]}/pages/${pages[0].id}`, custom_name: `MIN-614 3d Page ${i + 1}`, board: false });
    }
    specs.push({ id: randomUUID(), href: '/pull-requests', custom_name: 'MIN-614 3d PR', board: false });
    assert.equal(specs.length, 12);
    journal.specs = specs; await save();
    for (const spec of specs.slice(2)) {
      journal.ownedTabs.push(spec); await save();
      await api('/api/me/app-tabs', 'POST', { id: spec.id });
      const row = (await api('/api/me/app-tabs')).find((entry) => entry.id === spec.id);
      assert.ok(row);
      await api(`/api/me/app-tabs/${spec.id}`, 'PATCH', { revision: row.revision, patch: { href: spec.href, custom_name: spec.custom_name, pinned: true } });
    }
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready(specs[0]);
    await page.waitForFunction(() => [...document.querySelectorAll('img')].some((image) => image.src.startsWith('data:image/') && image.complete && image.naturalWidth > 0));
    for (const spec of specs.slice(2, 11)) await visit(spec);
    await tab(specs[11]).click();
    await page.getByText('Performance change 1.1', { exact: true }).first().waitFor({ timeout: 15000 });
    await visit(specs[0]);
    const issue = await api(`/api/issues/${fixture.firstIssue}`);
    journal.originalIssue = { id: issue.id, title: issue.title };
    journal.eventsBefore = (await api(`/api/issues/${issue.id}/events`)).length;
    await save();
    const correctness = process.argv.includes("--hot-correctness");
    const repetitions = diagnostic || correctness ? 1 : 10;
    for (let run = 0; run < repetitions; run++) {
      // Late boards dominate; older boards are revisited rarely rather than an
      // even round-robin that makes a frequency policy indistinguishable from LRU.
      await visit(specs[1]);
      await measure(`hot-page-global-${run}`, () => tab(specs[0]).click(), () => ready(specs[0]), input);
      await visit(specs[6]);
      if (run % 3 === 0) await visit(specs[2 + (run % 4)]);
      await measure(`hot-late-project-${run}`, () => tab(specs[7]).click(), () => ready(specs[7]), input);
      await measure(`hot-project-global-${run}`, () => tab(specs[0]).click(), () => ready(specs[0]), input);
      journal.samples.push({ run, ...await page.evaluate(() => ({
        retained: [...document.querySelectorAll('[data-retained-app-view]')].map((node) => ({ key: node.dataset.retainedAppView, active: node.dataset.appViewActive, cards: node.querySelectorAll('[data-issue-id]').length })),
        decoded: [...document.querySelectorAll('img')].filter((image) => image.src.startsWith('data:image/')).map((image) => ({ complete: image.complete, width: image.naturalWidth, bytes: image.src.length })),
        heap: performance.memory ? { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize, limit: performance.memory.jsHeapSizeLimit } : null,
      })), metrics: await metrics() });
      await save();
    }
    // Exact remote content, including a write immediately before activation.
    for (const delay of [700, 0]) {
      await visit(specs[1]);
      journal.changedTitle = `${issue.title} [MIN-614 3d ${delay}]`; await save();
      await api(`/api/issues/${issue.id}`, 'PATCH', { title: journal.changedTitle });
      await page.waitForTimeout(delay);
      await measure(`hidden-exact-${delay}`, () => tab(specs[0]).click(), () => ready(specs[0], journal.changedTitle), input);
      await api(`/api/issues/${issue.id}`, 'PATCH', { title: issue.title });
      await ready(specs[0], issue.title);
      delete journal.changedTitle; await save();
    }
    if (correctness) {
      journal.correctness = []; await save();
      // Keep injected failures and cache restarts outside ordinary samples.
      await visit(specs[1]);
      const failedBoard = '**/api/me/board?*';
      await page.route(failedBoard, (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'MIN-614 injected board read failure' }) }));
      journal.changedTitle = `${issue.title} [MIN-614 read failure]`; await save();
      await api(`/api/issues/${issue.id}`, 'PATCH', { title: journal.changedTitle });
      await visit(specs[0]);
      await active().locator('[role="status"]').filter({ hasText: 'Could not' }).waitFor({ timeout: 15000 });
      assert.equal(await active().getAttribute('data-board-read-state'), 'error');
      assert.equal(await active().getAttribute('aria-busy'), 'true');
      await page.unroute(failedBoard);
      await active().getByRole('button', { name: 'Try again', exact: true }).click();
      await ready(specs[0], journal.changedTitle);
      await page.waitForFunction((selector) => document.querySelector(selector)?.dataset.boardReadState === 'fresh', selector);
      journal.correctness.push('Failed authoritative hidden-board refresh explicitly reports uncertainty; retry obtains exact changed content.'); await save();
      await api(`/api/issues/${issue.id}`, 'PATCH', { title: issue.title });
      delete journal.changedTitle; await save();
      await visit(specs[1]);
      // Two real writes; journal both intended values before acknowledgement.
      journal.acceptedTitles = [issue.title];
      for (const suffix of ['first', 'latest']) {
        journal.changedTitle = `${issue.title} [MIN-614 concurrent ${suffix}]`;
        journal.acceptedTitles.push(journal.changedTitle); await save();
        await api(`/api/issues/${issue.id}`, 'PATCH', { title: journal.changedTitle });
      }
      await readyAfterClick();
      async function readyAfterClick() { await tab(specs[0]).click(); await ready(specs[0], journal.changedTitle); }
      assert.equal((await api(`/api/issues/${issue.id}`)).title, journal.changedTitle);
      journal.correctness.push('Two acknowledged remote writes while hidden reconcile to the exact latest persisted title at activation.'); await save();
      await api(`/api/issues/${issue.id}`, 'PATCH', { title: issue.title });
      delete journal.changedTitle; await save();
      const oldImages = await page.locator('img').evaluateAll((images) => images.map((image) => image.src).filter((src) => src.startsWith('data:image/')));
      const changedImage = await sharp({ create: { width: 32, height: 32, channels: 4, background: '#1275d6' } }).png().toBuffer();
      journal.iconVersions = [journal.iconUrl]; await save();
      const replacement = await context.request.post(`${base}/api/projects/${journal.iconProject}/icon`, { multipart: { file: { name: 'min614-version.png', mimeType: 'image/png', buffer: changedImage } } });
      assert.ok(replacement.ok());
      const changedUrl = (await replacement.json()).icon_url;
      assert.notEqual(changedUrl, journal.iconUrl);
      journal.iconUrl = changedUrl; journal.iconVersions.push(changedUrl); await save();
      assert.equal((await api(`/api/projects/${journal.iconProject}`)).icon_url, changedUrl);
      await page.waitForFunction((old) => [...document.querySelectorAll('img')].some((image) => image.checkVisibility() && image.src.startsWith('data:image/') && !old.includes(image.src) && image.complete && image.naturalWidth > 0), oldImages, { timeout: 15000 });
      journal.correctness.push('A second real protected icon import changes its version and displays newly decoded image bytes.'); await save();
      await api(`/api/projects/${journal.iconProject}/icon`, 'DELETE');
      assert.equal((await api(`/api/projects/${journal.iconProject}`)).icon_url, null);
      await page.waitForFunction(() => ![...document.querySelectorAll('img')].some((image) => image.checkVisibility() && image.src.startsWith('data:image/')), null, { timeout: 15000 });
      journal.correctness.push('Deleting the protected imported icon removes every visible private image.'); await save();
      await page.waitForTimeout(2500);
      const encrypted = await page.evaluate(() => localStorage.getItem('minddy.query-cache'));
      assert.equal(JSON.parse(encrypted).format, 'minddy-local-v1');
      for (const scenario of ['restart-encrypted-cache', 'restart-absent-cache', 'restart-invalid-cache']) {
        if (scenario === 'restart-absent-cache') await page.evaluate(() => localStorage.removeItem('minddy.query-cache'));
        if (scenario === 'restart-invalid-cache') await page.evaluate(() => localStorage.setItem('minddy.query-cache', JSON.stringify({ format: 'minddy-local-v1', invalid: true })));
        await measure(scenario, () => page.reload({ waitUntil: 'domcontentloaded' }), () => ready(specs[0]), input);
        await page.waitForFunction((selector) => document.querySelector(selector)?.dataset.boardReadState === 'fresh', selector);
        journal.correctness.push(`${scenario}: exact board membership and explicit known read state recovered.`); await save();
        await page.waitForTimeout(2500);
      }
    }
    const before = await metrics(); const idleAt = Date.now();
    await page.waitForTimeout(15000);
    journal.idle.push({ startedAt: idleAt, durationMs: Date.now() - idleAt, before, after: await metrics() });
    journal.eventsAfter = (await api(`/api/issues/${issue.id}/events`)).length;
    await page.evaluate(() => { document.documentElement.classList.remove('dark'); document.documentElement.style.colorScheme = 'light'; });
    await frames(); await page.screenshot({ path: `${output}/${label}-icons-light.png` });
  } catch (error) {
    journal.error = error.message.split('\n')[0];
    journal.failureState = await page.evaluate(() => ({ href: location.pathname + location.search,
      tabs: [...document.querySelectorAll('[data-app-tab-id]')].map((node) => ({ id: node.dataset.appTabId, label: node.getAttribute('aria-label'), selected: node.getAttribute('aria-selected') })),
      boards: [...document.querySelectorAll('[data-retained-app-view]')].map((node) => ({ key: node.dataset.retainedAppView, active: node.dataset.appViewActive, cards: node.querySelectorAll('[data-issue-id]').length })),
    }));
    await page.screenshot({ path: `${output}/${label}-journey-failure.png` });
    throw error;
  }
  finally {
    const restore = async () => {
    try {
      // Stop the mounted session before deleting tabs so it cannot recover them.
      await page.goto('about:blank');
      if (journal.changedTitle) {
        const current = await api(`/api/issues/${journal.originalIssue.id}`);
        assert.ok([journal.changedTitle, journal.originalIssue.title, ...(journal.acceptedTitles ?? [])].includes(current.title));
        if (current.title !== journal.originalIssue.title) await api(`/api/issues/${current.id}`, 'PATCH', { title: journal.originalIssue.title });
      }
      for (const spec of journal.ownedTabs) {
        const current = (await api('/api/me/app-tabs')).find((entry) => entry.id === spec.id);
        if (!current) continue;
        assert.ok(current.custom_name === spec.custom_name || current.href === '/home');
        await api(`/api/me/app-tabs/${spec.id}`, 'DELETE', { revision: current.revision });
      }
      if (journal.iconAttempted) {
        const current = await api(`/api/projects/${journal.iconProject}`);
        assert.ok(!current.icon_url || !journal.iconUrl || current.icon_url === journal.iconUrl || journal.iconVersions?.includes(current.icon_url));
        if (current.icon_url) await api(`/api/projects/${journal.iconProject}/icon`, 'DELETE');
        assert.equal((await api(`/api/projects/${journal.iconProject}`)).icon_url, journal.originalIcon);
      }
      assert.ok(!(await api('/api/me/app-tabs')).some((row) => journal.ownedTabs.some((tab) => row.id === tab.id)));
      if (journal.originalIssue) assert.equal((await api(`/api/issues/${journal.originalIssue.id}`)).title, journal.originalIssue.title);
      journal.cleanup = true;
    } catch (error) { journal.cleanupError = error.message.split('\n')[0]; throw error; }
    finally { await save(); }
    };
    await restore();
  }
}
