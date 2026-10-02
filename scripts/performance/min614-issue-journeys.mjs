import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { id } from "./seed.mjs";
import { verifyIssueJourneys } from "./verify-min614-issue-journeys.mjs";

// The parent validates the encrypted fixture account; all content uses authenticated routes.
export async function measureIssueJourneys({ page, context, fixture, boardTab, pagesTab, base, measure, frames, diagnostic, output, label, recordRequest }) {
  const activeSelector = '[data-retained-app-view][data-app-view-active="true"]';
  const active = () => page.locator(activeSelector);
  const panel = () => page.locator('[role="dialog"][data-state="open"]');
  const tab = (spec) => page.locator(`[data-app-tab-id="${spec.id}"]`);
  const apiErrors = [];
  let cleanupMode = false;
  const api = async (route, method = "GET", data) => {
    const attempts = method === 'GET' || cleanupMode ? 3 : 1;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const record = { path: route, method, at: Date.now(), channel: 'verification', attempt };
      recordRequest(record);
      let response;
      try { response = await context.request.fetch(`${base}${route}`, { method, timeout: 15000, ...(data === undefined ? {} : { data }) }); }
      catch (error) {
        record.duration = Date.now() - record.at; record.failed = error.name;
        apiErrors.push({ ...record });
        if (attempt === attempts) throw new Error(`${method} ${route}: transport failed (${error.name})`);
        await page.waitForTimeout(500); continue;
      }
      record.duration = Date.now() - record.at; record.status = response.status();
      if (!response.ok()) {
        apiErrors.push({ ...record });
        if ([502, 503, 504].includes(response.status()) && attempt < attempts) { await page.waitForTimeout(500); continue; }
      }
      assert.ok(response.ok(), `${method} ${route}: ${response.status()}`);
      return response.status() === 204 ? null : response.json();
    }
  };
  const issue = await api(`/api/issues/${fixture.firstIssue}`);
  const other = await api(`/api/issues/${id('issue-0-1')}`);
  const comments = await api(`/api/issues/${issue.id}/comments`);
  const otherComments = await api(`/api/issues/${other.id}/comments`);
  const events = await api(`/api/issues/${issue.id}/events`);
  assert.equal(issue.project_id, fixture.projects[0]);
  assert.equal(other.project_id, issue.project_id);
  assert.match(issue.title, /^Performance task 1\.1:/);
  assert.equal(comments.length, 2);
  const createdComments = new Set(), createdRelations = new Set(), createdResources = new Set();
  let filtered = false, originalMutable;
  const checks = [], mutations = [];
  const repetitions = diagnostic ? 1 : 10;
  const statePath = `${output}/${label}-checks.json`;
  async function boardReady(count = filtered ? 480 : 600, title) {
    await page.waitForFunction(({ activeSelector, spec, count, title }) => {
      const roots = document.querySelectorAll(activeSelector), root = roots[0];
      return roots.length === 1 && root.checkVisibility() && !root.inert &&
        document.querySelector(`[data-app-tab-id="${spec.id}"]`)?.getAttribute("aria-selected") === "true" &&
        location.pathname === new URL(spec.href, location.origin).pathname &&
        root.querySelectorAll('[data-issue-id]').length === count &&
        (!title || root.textContent.includes(title)) &&
        ![...document.querySelectorAll('[role="dialog"][data-state="open"]')].some((node) => node.checkVisibility());
    }, { activeSelector, spec: boardTab, count, title }, { timeout: 45000 });
  }
  async function ready(expected = issue, expectedComments = comments) {
    await page.waitForFunction(({ title, description, issueId, expectedComments, boardTabId }) => {
      const panels = [...document.querySelectorAll('[role="dialog"][data-state="open"]')].filter((node) => node.checkVisibility() && !node.inert);
      const root = panels[0];
      if (panels.length !== 1 || root.querySelector('textarea')?.value !== title ||
          document.querySelector(`[data-app-tab-id="${boardTabId}"]`)?.getAttribute('aria-selected') !== 'true') return false;
      const editor = root.querySelector('.tiptap');
      const normalize = (text) => text.replace(/\s+/g, '');
      return editor?.checkVisibility() && normalize(editor.textContent) === normalize(description) &&
        expectedComments.every(({ id, body }) => {
          const comment = root.querySelector(`[data-comment-id="${id}"][data-comment-state="confirmed"]`);
          return comment && normalize(comment.textContent).includes(normalize(body));
        }) &&
        ['comments', 'events', 'agent', 'automation', 'feedback', 'resources'].every((route) => {
          const state = window.__min614.apiStates[`/api/issues/${issueId}/${route}`];
          return state && state.pending === 0 && state.status === 200;
        }) && root.textContent.includes('Activity') && root.textContent.includes('Resources');
    }, { title: expected.title, description: expected.description ?? "", issueId: expected.id, expectedComments: expectedComments.map(({ id, body }) => ({ id, body })), boardTabId: boardTab.id }, { timeout: 45000 });
  }
  async function input() {
    await panel().getByRole('button', { name: 'Issue actions', exact: true }).click();
    await page.getByRole('menu').waitFor();
    await frames();
    await page.keyboard.press('Escape');
  }
  async function close() {
    await panel().getByRole('button', { name: 'Close', exact: true }).click();
    await boardReady();
    await frames();
  }
  async function open(expected = issue, expectedComments = comments) {
    await active().locator(`[data-issue-id="${expected.id}"]`).click();
    await ready(expected, expectedComments);
    await frames();
  }
  async function toggleFilter() {
    await active().getByRole('button', { name: 'Filters', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Hide done issues', exact: true }).click();
    await page.keyboard.press('Escape');
    filtered = !filtered;
    await boardReady();
  }
  async function pages() {
    await tab(pagesTab).click();
    if (pagesTab.href === `/projects/${fixture.projects[0]}/pages`) await page.locator(`a[href="${pagesTab.href}/${fixture.firstPage}"]`).first().waitFor();
    else await page.locator('.page-editor .tiptap').waitFor();
    await frames();
  }
  try {
    await tab(boardTab).click();
    await boardReady();
    await measure('issue-cold-complete', () => active().locator(`[data-issue-id="${issue.id}"]`).click(), () => ready(), input);
    if (process.argv.includes('--inventory')) {
      await writeFile(`${output}/${label}-inventory.json`, JSON.stringify({ snapshot: await panel().ariaSnapshot(), fixture: { comments: comments.length, events: events.length, descriptionBytes: issue.description.length } }, null, 2));
      await page.screenshot({ path: `${output}/${label}-issue.png` });
      await close();
      return;
    }
    await close();
    if (process.argv.includes('--correctness')) {
      await verifyIssueJourneys({ page, api, other, fixture, panel, ready, open, close, boardReady, checks });
      return;
    }
    for (let run = 0; run < repetitions; run++) {
      await measure(`issue-warm-complete-${run}`, () => active().locator(`[data-issue-id="${issue.id}"]`).click(), () => ready(), input);
      await measure(`activity-expand-${run}`, () => panel().getByRole('button', { name: /^\d+ events$/ }).last().click(),
        () => page.waitForFunction(({ count }) => {
          const root = [...document.querySelectorAll('[role="dialog"][data-state="open"]')].find((node) => node.checkVisibility());
          return root?.querySelector('button[aria-expanded="true"]') && root.querySelectorAll('ol ol li').length >= count - 1;
        }, { count: events.length }), input);
      assert.ok(await panel().locator('ol ol li').count() >= events.length - 1, 'Activity group has not rendered every event');
      await panel().getByRole('button', { name: /^\d+ events$/ }).last().click();
      await measure(`issue-return-${run}`, () => panel().getByRole('button', { name: 'Close', exact: true }).click(), () => boardReady());
    }
    checks.push('Loaded description, two original comments, full expanded activity and stored PR affordance; active visible readiness checks every detail API');
    const scrollers = active().locator('[data-board-column-scroller]');
    const offsets = await scrollers.evaluateAll((nodes) => nodes.map((node) => { node.scrollTop = 160; return node.scrollTop; }));
    assert.ok(offsets.some((value) => value > 0));
    // Use a card already visible at this offset; preserve the viewport instead of scrolling to the first card.
    const scrolledId = await active().locator('[data-issue-id]').evaluateAll((nodes) => nodes.find((node) => {
      const rect = node.getBoundingClientRect(), parent = node.closest('[data-board-column-scroller]').getBoundingClientRect();
      return rect.top >= parent.top && rect.bottom <= parent.bottom;
    })?.dataset.issueId);
    assert.ok(scrolledId);
    const scrolledIssue = await api(`/api/issues/${scrolledId}`);
    const scrolledComments = await api(`/api/issues/${scrolledId}/comments`);
    await open(scrolledIssue, scrolledComments);
    await close();
    for (let run = 0; run < repetitions; run++) {
      await measure(`issue-scrolled-${run}`, () => active().locator(`[data-issue-id="${scrolledId}"]`).click(), () => ready(scrolledIssue, scrolledComments), input);
      await close();
      assert.deepEqual(await scrollers.evaluateAll((nodes) => nodes.map((node) => node.scrollTop)), offsets);
    }
    await scrollers.evaluateAll((nodes) => nodes.forEach((node) => { node.scrollTop = 0; }));
    await toggleFilter();
    for (let run = 0; run < repetitions; run++) {
      await measure(`issue-filtered-${run}`, () => active().locator(`[data-issue-id="${issue.id}"]`).click(), () => ready(), input);
      await close();
    }
    await toggleFilter();
    checks.push('Scroll offsets and filtered counts preserved after every dismissal');
    const relation = await api(`/api/projects/${issue.project_id}/issue-relations`, 'POST', { source_id: issue.id, target_id: other.id, type: 'related' });
    createdRelations.add(relation.id);
    // Reload outside timings so setup is consumed even when realtime delivery is delayed.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await boardReady();
    await open(other, otherComments);
    await close();
    await open();
    for (let run = 0; run < repetitions; run++) {
      await measure(`issue-switch-${run}`, () => panel().getByRole('button').filter({ hasText: other.title }).click(), () => ready(other, otherComments), input);
      await panel().getByRole('button').filter({ hasText: issue.title }).click();
      await ready();
    }
    await close();
    for (let run = 0; run < repetitions; run++) {
      await pages();
      await measure(`retained-board-return-${run}`, () => tab(boardTab).click(), () => boardReady());
      await measure(`retained-issue-open-${run}`, () => active().locator(`[data-issue-id="${issue.id}"]`).click(), () => ready(), input);
      await close();
    }
    checks.push('Related-issue navigation updates the visible title/description/comments; retained tab activation followed by issue reopen');
    // Mutate a third existing synthetic issue so the loaded activity workload above remains stable.
    const mutable = await api(`/api/issues/${id('issue-0-2')}`);
    assert.equal(mutable.project_id, issue.project_id);
    originalMutable = mutable;
    const mutableComments = await api(`/api/issues/${mutable.id}/comments`);
    await open(mutable, mutableComments);
    for (let run = 0; run < repetitions; run++) {
      await panel().getByRole('button', { name: 'Change effort', exact: true }).click();
      const patchResponse = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/issues/${mutable.id}` && response.request().method() === 'PATCH').then(async (response) => ({ response, at: await page.evaluate(() => performance.timeOrigin + performance.now()) }));
      const patchStart = await page.evaluate(() => performance.timeOrigin + performance.now());
      await measure(`property-optimistic-${run}`, () => page.getByRole('option', { name: 'L', exact: true }).click(),
        () => panel().getByRole('button', { name: 'Change effort', exact: true }).getByText('L', { exact: true }).waitFor());
      const patchAck = await patchResponse;
      assert.equal(patchAck.response.status(), 200);
      const persisted = await api(`/api/issues/${mutable.id}`);
      assert.equal(persisted.effort, 'l');
      mutations.push({ name: 'property-confirmation', run, persistedMs: patchAck.at - patchStart });
      await panel().getByRole('button', { name: 'Change effort', exact: true }).click();
      const restored = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/issues/${mutable.id}` && response.request().method() === 'PATCH');
      await page.getByRole('option', { name: mutable.effort.toUpperCase(), exact: true }).click();
      assert.equal((await restored).status(), 200);
      // Reopen to reconcile a restoration if the fixture's realtime channel is delayed.
      await close();
      await open(mutable, mutableComments);
      const text = `MIN-614 pass 3 comment ${label} ${run}`;
      const composer = panel().locator('[role="textbox"][contenteditable="true"]').last();
      await composer.fill(text);
      const confirmation = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/issues/${mutable.id}/comments` && response.request().method() === 'POST').then(async (response) => {
        assert.equal(response.status(), 201);
        const saved = await response.json();
        createdComments.add(saved.id);
        await panel().locator(`[data-comment-id="${saved.id}"][data-comment-state="confirmed"]`).waitFor();
        await frames();
        return { response, saved, at: await page.evaluate(() => performance.timeOrigin + performance.now()) };
      });
      const started = await page.evaluate(() => performance.timeOrigin + performance.now());
      await measure(`comment-optimistic-${run}`, () => composer.press('ControlOrMeta+Enter'), () => panel().locator('[data-comment-id]').filter({ hasText: text }).waitFor());
      const acknowledged = await confirmation;
      const savedResponse = acknowledged.response, saved = acknowledged.saved;
      createdComments.add(saved.id);
      await panel().locator(`[data-comment-id="${saved.id}"][data-comment-state="confirmed"]`).waitFor();
      await frames();
      mutations.push({ name: 'comment-confirmation', run, persistedMs: acknowledged.at - started, responseMs: savedResponse.request().timing().responseEnd });
      const stored = await api(`/api/issues/${mutable.id}/comments`);
      assert.equal(stored.filter((comment) => comment.id === saved.id && comment.body === text).length, 1);
      const row = panel().locator(`[data-comment-id="${saved.id}"]`);
      await row.getByRole('button', { name: 'Comment actions', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
      await row.locator('[role="textbox"][contenteditable="true"]').fill(`${text} edited`);
      const editAck = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/comments/${saved.id}` && response.request().method() === 'PATCH');
      await measure(`comment-edit-${run}`, () => row.getByRole('button', { name: 'Save', exact: true }).click(), async () => {
        const response = await editAck;
        assert.equal(response.status(), 200);
        assert.equal((await response.json()).body, `${text} edited`);
        await row.locator('[role="textbox"][contenteditable="true"]').waitFor({ state: 'detached' });
        await row.getByText(`${text} edited`, { exact: true }).waitFor();
      });
      assert.equal((await api(`/api/issues/${mutable.id}/comments`)).find((comment) => comment.id === saved.id).body, `${text} edited`);
      await row.getByRole('button', { name: 'Comment actions', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
      await row.waitFor({ state: 'detached' });
      assert.ok(!(await api(`/api/issues/${mutable.id}/comments`)).some((entry) => entry.id === saved.id));
      createdComments.delete(saved.id);
    }
    await close();
    for (let run = 0; run < repetitions; run++) {
      await pages();
      const title = `${mutable.title} [MIN-614 hidden ${run}]`;
      await api(`/api/issues/${mutable.id}`, 'PATCH', { title });
      await page.waitForTimeout(700);
      await measure(`hidden-update-board-${run}`, () => tab(boardTab).click(), () => boardReady(600, title));
      await measure(`hidden-update-issue-${run}`, () => active().locator(`[data-issue-id="${mutable.id}"]`).click(), () => ready({ ...mutable, title }, mutableComments), input);
      await api(`/api/issues/${mutable.id}`, 'PATCH', { title: mutable.title });
      await ready(mutable, mutableComments);
      await close();
    }
    checks.push('Real optimistic comment creation and persisted GET confirmation, comment edits and cleanup; hidden remote title update and restoration');
    await page.evaluate(() => { document.documentElement.classList.remove('dark'); document.documentElement.style.colorScheme = 'light'; });
    await open();
    await page.screenshot({ path: `${output}/${label}-issue-light.png` });
    await panel().getByText('Activity', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/${label}-activity-light.png` });
    await close();
  } finally {
    // Preserve confirmation samples even if a later cleanup verification times out.
    await writeFile(statePath, JSON.stringify({ checks, mutations, apiErrors, fixture: { events: events.length, comments: comments.length, descriptionBytes: issue.description.length }, cleanup: false }, null, 2));
    cleanupMode = true;
    const actions = [
      ...(originalMutable ? [() => api(`/api/issues/${originalMutable.id}`, 'PATCH', { title: originalMutable.title, effort: originalMutable.effort })] : []),
      ...[...createdComments].map((commentId) => () => api(`/api/comments/${commentId}`, 'DELETE')),
      ...[...createdRelations].map((relationId) => () => api(`/api/issue-relations/${relationId}`, 'DELETE')),
      ...[...createdResources].map((resourceId) => () => api(`/api/resources/${resourceId}`, 'DELETE')),
    ];
    const cleaned = await Promise.allSettled(actions.map((action) => action()));
    const failures = cleaned.filter((result) => result.status === 'rejected');
    assert.equal(failures.length, 0, `Cleanup failed: ${failures.map((result) => result.reason.message).join('; ')}`);
    if (filtered && await active().count()) { if (await panel().count()) await close(); await toggleFilter(); }
    assert.equal((await api(`/api/issues/${issue.id}`)).title, issue.title);
    assert.equal((await api(`/api/issues/${issue.id}/comments`)).length, comments.length);
    if (originalMutable) {
      const restored = await api(`/api/issues/${originalMutable.id}`);
      assert.equal(restored.title, originalMutable.title); assert.equal(restored.effort, originalMutable.effort);
    }
    await writeFile(statePath, JSON.stringify({ checks, mutations, apiErrors, fixture: { events: events.length, comments: comments.length, descriptionBytes: issue.description.length }, cleanup: true }, null, 2));
  }
}
