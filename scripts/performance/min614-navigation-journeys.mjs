// Reuse the native MIN-614 runner. Only forge transport and virtual tab writes
// are simulated; Minddy data, authorization and encrypted snapshots stay real.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

export async function measureNavigationJourneys({ page, context, fixture, tabs: originalTabs, base, measure, diagnostic, output, label, cdp }) {
  const report = { cleanup: false, definition: 'Native navigation with real migrated MIN-540 Minddy reads, virtual tabs and synthetic forge UI responses. No live GitHub latency/freshness claim.', samples: [], workload: {}, idle: [] };
  const save = () => writeFile(`${output}/${label}-navigation.json`, JSON.stringify(report, null, 2));
  const api = async (path) => {
    const response = await context.request.get(`${base}${path}`);
    assert.ok(response.ok(), `${path}: ${response.status()}`);
    return response.json();
  };
  const pulls = (await api('/api/pull-requests?limit=50')).pullRequests;
  assert.ok(pulls.length >= 2 && pulls.every((row) => row.title.startsWith('Performance change')));
  const pages = await Promise.all([0, 5].map((i) => api(`/api/projects/${fixture.projects[i]}/pages`)));
  const docs = await Promise.all(pages.map((rows, i) => api(`/api/projects/${fixture.projects[i === 0 ? 0 : 5]}/pages/${rows[0].id}`)));
  const issues = await Promise.all([0, 5].map((i) => api(`/api/projects/${fixture.projects[i]}/issues`)));
  const feedback = await Promise.all([0, 5].map((i) => api(`/api/projects/${fixture.projects[i]}/feedback`)));
  report.workload = { pulls: pulls.slice(0, 2), pages: docs.map((doc) => ({ id: doc.id, title: doc.title, content: doc.content })), triage: issues.map((rows) => rows.filter((row) => row.status === 'triage').length), feedback: feedback.map((list) => list.posts.length), forgeFiles: [12, 441] };
  const p0 = `/projects/${fixture.projects[0]}`, p5 = `/projects/${fixture.projects[5]}`;
  const specs = [
    { href: '/all', kind: 'board', count: 600 },
    { href: `${p0}/pages`, kind: 'pages', text: docs[0].title },
    { href: `${p0}/pages/${docs[0].id}`, kind: 'document', text: docs[0].title },
    { href: `/pull-requests?pr=${pulls[0].prId}`, kind: 'pr', text: pulls[0].title },
    { href: `${p0}/feedback`, kind: 'feedback' },
    { href: `${p0}/triage`, kind: 'triage' },
    { href: p0, kind: 'board', count: 100 },
    { href: `${p5}/pages`, kind: 'pages', text: docs[1].title },
    { href: p5, kind: 'board', count: 100 },
    { href: `${p5}/feedback`, kind: 'feedback' },
    { href: `/pull-requests?pr=${pulls[1].prId}`, kind: 'pr', text: pulls[1].title },
    { href: `${p5}/triage`, kind: 'triage' },
  ].map((spec, position) => ({ ...originalTabs[0], ...spec, id: randomUUID(), position, pinned: true, custom_name: `MIN-614 3f ${position} ${spec.kind}`, revision: 1 }));
  let virtualTabs = specs.map((spec) => ({ ...spec }));
  const readiness = { state: 'ready', blockers: [], passed: [], mergeAllowed: false, methods: [], preferredMethod: null };
  const checks = { checks: Array.from({ length: 8 }, (_, i) => ({ name: `Synthetic check ${i}`, state: 'success', url: null, appName: null, appAvatarUrl: null, description: null, durationMs: 1000, startedAt: null, completedAt: null, required: false, rerunRef: null })), state: 'success', passing: 8, total: 8, startedAt: null, completedAt: null };
  const detail = (item, index) => ({ provider: 'github', pr: { number: item.pr_number, url: item.pr_url, state: 'open', merged: false, title: item.title, body: 'Synthetic interface workload. Stored Minddy links remain real.', head: 'performance-interface', base: 'main', headSha: 'a'.repeat(40), user: { login: 'performance-tester', avatar_url: null }, createdAt: item.created_at, commitCount: 20, mergeable: true },
    files: Array.from({ length: index ? 441 : 12 }, (_, i) => ({ filename: `synthetic/file-${i}.ts`, status: 'modified', additions: 24, deletions: 2, patch: `@@ -1,2 +1,24 @@\n-old value\n-old setting\n${Array.from({ length: 24 }, (_, j) => `+export const item${j} = ${j};`).join('\n')}\n` })), checks, reviews: { approvals: 1, changesRequested: 0 }, readiness, reviewThreads: [], viewer: { provider: 'github', configured: false, connected: false, login: null, capability: 'none' } });
  const routeHandler = async (route) => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    if (url.pathname === '/api/me/app-tabs/metadata') return route.fulfill({ json: {} });
    if (url.pathname.startsWith('/api/me/app-tabs')) {
      const id = url.pathname.split('/')[4], body = method === 'GET' ? {} : request.postDataJSON();
      if (method === 'GET') return route.fulfill({ json: virtualTabs });
      if (method === 'PATCH') {
        const tab = virtualTabs.find((tab) => tab.id === id); assert.ok(tab);
        Object.assign(tab, body.patch, { revision: tab.revision + 1 }); return route.fulfill({ json: { tab } });
      }
      if (method === 'DELETE') { virtualTabs = virtualTabs.filter((tab) => tab.id !== id); return route.fulfill({ json: { ok: true } }); }
      if (method === 'POST') { const tab = { ...specs[0], id: body.id, href: '/home', position: virtualTabs.length }; virtualTabs.push(tab); return route.fulfill({ json: { tab } }); }
    }
    if (url.pathname.startsWith('/api/pull-requests/')) {
      assert.equal(method, 'GET', 'No forge writes belong to this campaign');
      const id = url.pathname.split('/')[3], suffix = url.pathname.split('/').slice(4).join('/');
      const index = pulls.slice(0, 2).findIndex((item) => item.prId === id);
      if (suffix === 'readiness' || id === 'readiness') return route.fulfill({ json: { readiness, checks, items: [] } });
      if (index >= 0 && !suffix) return route.fulfill({ json: detail(pulls[index], index) });
      if (suffix === 'comments' || suffix === 'review-comments') return route.fulfill({ json: { comments: [], threads: [] } });
      if (suffix === 'commits') return route.fulfill({ json: { commits: [], truncated: false } });
      return route.fulfill({ json: { items: [] } });
    }
    return route.continue();
  };
  const arm = (spec) => page.evaluate((spec) => {
    const start = performance.now();
    const result = window.__navigationSample = { start, clocks: {}, skeletonFrames: 0, frames: 0 };
    const stamp = (key) => { result.clocks[key] ??= performance.now() - start; };
    const gesture = () => stamp('gesture');
    document.addEventListener('pointerdown', gesture, { once: true, capture: true });
    const tick = () => {
      if (window.__navigationSample !== result) return;
      result.frames++;
      const route = location.pathname + location.search === spec.href;
      const selected = document.querySelector(`[data-app-tab-id="${spec.id}"]`)?.getAttribute('aria-selected') === 'true';
      if (selected) stamp('accepted');
      if (route) stamp('destinationFrame');
      const retained = document.querySelector('[data-retained-app-view][data-app-view-active="true"]');
      const root = retained || document.querySelector('main') || document.body;
      const text = root.textContent;
      const skeleton = [...root.querySelectorAll('[data-slot="skeleton"]')].some((node) => node.checkVisibility());
      if (route && skeleton) result.skeletonFrames++;
      let available = route && !skeleton;
      if (spec.kind === 'board') available &&= !!retained && retained.querySelectorAll('[data-issue-id]').length === spec.count;
      else if (spec.kind === 'document') available &&= !!root.querySelector('.page-editor .tiptap') && text.includes(spec.text);
      else if (spec.kind === 'pages') available &&= text.includes(spec.text);
      else if (spec.kind === 'pr') available &&= !!root.querySelector('[data-testid="pr-activity-timeline"]') && text.includes(spec.text);
      else available &&= text.includes(spec.kind === 'triage' ? 'Triage' : 'Feedback');
      if (available) stamp('availableContent');
      let usable = available;
      if (spec.kind === 'board') usable &&= retained.dataset.boardReadState === 'fresh';
      if (spec.kind === 'pr') usable &&= !root.querySelector('[data-testid="pr-read-state"]');
      if (usable) stamp('usableExactScenario');
      const states = Object.entries(window.__min614.apiStates).filter(([path]) => path.startsWith('/api/pull-requests/') || path.startsWith('/api/projects/'));
      if (usable && states.every(([, value]) => value.pending === 0)) stamp('secondaryReconciled');
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, spec);
  const checkpoint = async (spec, name, action) => {
    await arm(spec);
    const old = await measure(name, action, () => ready(spec));
    const sample = await page.evaluate(() => ({ clocks: window.__navigationSample.clocks, skeletonFrames: window.__navigationSample.skeletonFrames, frames: window.__navigationSample.frames }));
    report.samples.push({ name, index: spec.position, old, ...sample, heap: await page.evaluate(() => performance.memory?.usedJSHeapSize ?? null) }); await save();
  };
  const select = async (spec) => {
    const control = page.locator(`[data-app-tab-id="${spec.id}"]`);
    if (await control.count()) await control.click();
    else { await page.getByRole('button', { name: 'More tabs', exact: true }).click(); await page.getByRole('menuitem', { name: spec.custom_name, exact: true }).click(); }
  };
  const ready = async (spec) => {
    await page.waitForFunction(({ href }) => location.pathname + location.search === href, spec, { timeout: 15000 });
    if (spec.kind === 'board') await page.waitForFunction((spec) => {
      const root = document.querySelector('[data-retained-app-view][data-app-view-active="true"]');
      return root?.checkVisibility() && root.querySelectorAll('[data-issue-id]').length === spec.count;
    }, spec, { timeout: 15000 });
    else if (spec.kind === 'document') await page.locator('.page-editor .tiptap').waitFor({ timeout: 15000 });
    else if (spec.kind === 'pages') await page.getByText(spec.text, { exact: true }).first().waitFor({ timeout: 15000 });
    else if (spec.kind === 'pr') { await page.getByTestId('pr-activity-timeline').waitFor({ timeout: 15000 }); await page.waitForFunction(() => !document.querySelector('[data-testid="pr-read-state"]'), null, { timeout: 15000 }); }
    else { await page.getByText(spec.kind === 'triage' ? 'Triage' : 'Feedback', { exact: true }).first().waitFor({ timeout: 15000 }); await page.waitForTimeout(100); }
  };
  await save();
  try {
    await context.route(`${base}/api/**`, routeHandler);
    await page.evaluate(() => { for (const key of Object.keys(sessionStorage)) if (key.startsWith('minddy.app-tabs.')) sessionStorage.removeItem(key); });
    await page.reload({ waitUntil: 'domcontentloaded' }); await ready(specs[0]);
    report.specs = specs; await save();
    for (const spec of specs.slice(1)) {
      report.stage = spec.custom_name; await save();
      await checkpoint(spec, `explore-cold-${spec.position}-${spec.kind}`, () => select(spec));
    }
    const repeats = diagnostic || process.argv.includes('--navigation-explore') ? 1 : 10;
    for (let run = 0; run < repeats; run++) {
      for (const index of [0, 10, 11, 9, 8, 2, 3, 5, 10, 7, 8, 0]) {
        const spec = specs[index]; report.stage = spec.custom_name; await save();
        await checkpoint(spec, `navigation-${spec.kind}-${index}-${run}`, () => select(spec));
      }
    }
    const before = await cdp.send('Performance.getMetrics'); await page.waitForTimeout(15000);
    report.idle.push({ durationMs: 15000, before, after: await cdp.send('Performance.getMetrics') });
    await page.screenshot({ path: `${output}/${label}-navigation-light.png` });
  } catch (error) { report.error = error.message.split('\n')[0]; report.failureState = await page.locator('body').innerText(); throw error; }
  finally {
    await page.goto('about:blank'); await context.unroute(`${base}/api/**`, routeHandler);
    const fields = (row) => ({ id: row.id, href: row.href, pinned: row.pinned, position: row.position, custom_name: row.custom_name });
    assert.deepEqual((await api('/api/me/app-tabs')).map(fields), originalTabs.map(fields), 'Persistent navigation must remain unchanged');
    report.cleanup = true; await save();
  }
}
