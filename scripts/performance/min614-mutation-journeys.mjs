import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { rankProperties } from './min614-property-ranking.mjs';
import { verifyReadStates } from './verify-min614-read-states.mjs';
import { verifyColdReadStates } from './verify-min614-cold-reads.mjs';
import { armDomProbe, finishDomProbe } from './min614-dom-probe.mjs';
import { id } from './seed.mjs';
import { verifyMutationJourneys } from './verify-min614-mutations.mjs';

// Native loaded-thread workloads. Writes run once; cleanup inspects ambiguous UUIDs.
export async function measureMutationJourneys({ page, context, fixture, boardTab, pagesTab, base, measure, frames, diagnostic, output, label, recordRequest, cdp }) {
  const phase3c = process.argv.includes('--phase3c');
  const activeSelector = '[data-retained-app-view][data-app-view-active="true"]';
  const active = () => page.locator(activeSelector);
  const panel = () => page.locator('[role="dialog"][data-state="open"]');
  const tab = (spec) => page.locator(`[data-app-tab-id="${spec.id}"]`);
  const state = { fixture: {}, stages: [], failures: [], checks: [], ownedComments: [], cleanup: false };
  state.broadcasts = [];
  state.domProbes = [];
  const arm = async (spec) => { if (phase3c) await armDomProbe(page, { title: original.title, ...spec }); };
  const finish = async (name, run) => { if (phase3c) { state.domProbes.push({ name, run, ...await finishDomProbe(page) }); await save(); } };
  const probe = async (name, run, spec, action, visible) => { await arm(spec); const result = await measure(`${name}-${run}`, action, visible); await finish(name, run); return result; };
  page.on('websocket', (socket) => socket.on('framereceived', ({ payload }) => {
    try {
      const frame = JSON.parse(String(payload));
      const message = Array.isArray(frame) ? { payload: frame[4] } : frame;
      const change = message.payload?.data?.payload ?? message.payload?.data ?? message.payload?.payload;
      if (change?.table === 'comments') state.broadcasts.push({ at: Date.now(), operation: change.operation, record: change.record, old_record: change.old_record });
    } catch {}
  }));
  const pendingWrites = [];
  const statePath = `${output}/${label}-checks.json`;
  const save = () => writeFile(statePath, JSON.stringify(state, null, 2));
  let original, originalComments, originalEvents, filtered = false;
  const epoch = () => page.evaluate(() => performance.timeOrigin + performance.now());
  const api = async (route, method = 'GET', data) => {
    const record = { path: route, method, at: Date.now(), channel: 'verification' };
    recordRequest(record);
    let response;
    try { response = await context.request.fetch(`${base}${route}`, { method, timeout: 20000, ...(data === undefined ? {} : { data }) }); }
    catch (error) { record.duration = Date.now() - record.at; record.failed = error.name; throw new Error(`${method} ${route}: ${error.name}`); }
    record.status = response.status(); record.duration = Date.now() - record.at;
    if (method === 'DELETE' && response.status() === 404) return null;
    assert.ok(response.ok(), `${method} ${route}: ${response.status()}`);
    return response.status() === 204 ? null : response.json();
  };
  async function boardReady(title = original?.title) {
    await page.waitForFunction(({ selector, tabId, count, title }) => {
      const roots = document.querySelectorAll(selector), root = roots[0];
      return roots.length === 1 && root.checkVisibility() && !root.inert &&
        document.querySelector(`[data-app-tab-id="${tabId}"]`)?.getAttribute('aria-selected') === 'true' &&
        root.querySelectorAll('[data-issue-id]').length === count && (!title || root.textContent.includes(title)) &&
        ![...document.querySelectorAll('[role="dialog"][data-state="open"]')].some((node) => node.checkVisibility());
    }, { selector: activeSelector, tabId: boardTab.id, count: filtered ? 480 : 600, title }, { timeout: 15000 });
  }
  async function ready(expected) {
    await page.waitForFunction(({ title, description, issueId, comments, tabId }) => {
      const panels = [...document.querySelectorAll('[role="dialog"][data-state="open"]')].filter((node) => node.checkVisibility() && !node.inert);
      const root = panels[0], normalize = (text) => text.replace(/\s+/g, '');
      if (panels.length !== 1 || root.querySelector('textarea')?.value !== title ||
          document.querySelector(`[data-app-tab-id="${tabId}"]`)?.getAttribute('aria-selected') !== 'true' ||
          normalize(root.querySelector('.tiptap')?.textContent ?? '') !== normalize(description)) return false;
      const rows = root.querySelectorAll('[data-comment-id]');
      return rows.length === comments.length && comments.every(({ id, body }) => {
        const row = root.querySelector(`[data-comment-id="${id}"][data-comment-state="confirmed"]`);
        return row && normalize(row.textContent).includes(normalize(body));
      }) && ['comments', 'events', 'agent', 'automation', 'feedback', 'resources'].every((route) => {
        const request = window.__min614.apiStates[`/api/issues/${issueId}/${route}`];
        return request && request.pending === 0 && request.status === 200;
      });
    }, { title: original.title, description: original.description ?? '', issueId: original.id, comments: expected.map(({ id, body }) => ({ id, body })), tabId: boardTab.id }, { timeout: 5000 });
  }
  const close = async () => { await panel().getByRole('button', { name: 'Close', exact: true }).click(); await boardReady(); await frames(); };
  const open = async (expected) => { await active().locator(`[data-issue-id="${original.id}"]`).click(); await ready(expected); await frames(); };
  const row = (commentId) => panel().locator(`[data-comment-id="${commentId}"]`);
  const composer = () => panel().locator('[role="textbox"][contenteditable="true"]').last();
  const capture = (request) => {
    if (request.method() !== 'POST' || new URL(request.url()).pathname !== `/api/issues/${original?.id}/comments`) return;
    const payload = request.postDataJSON();
    if (!payload?.body?.startsWith('MIN-614 3b ') || !payload.id) return;
    if (!state.ownedComments.includes(payload.id)) state.ownedComments.push(payload.id);
    pendingWrites.push(request.response());
    // Save the identity on dispatch, before acknowledgement, even if the response is lost.
    void save();
  };
  page.on('request', capture);
  const acknowledgement = (path, method) => {
    const pending = page.waitForResponse((response) => new URL(response.url()).pathname === path && response.request().method() === method, { timeout: 25000 })
      .then(async (response) => ({ status: response.status(), at: Date.now(), body: method === 'DELETE' ? { ok: true } : await response.json(), requestMs: response.request().timing().responseEnd }));
    void pending.catch(() => {}); return pending;
  };
  async function pipeline(name, run, action, visible, ack, verify, reconcile) {
    const start = await epoch();
    const observation = await measure(`${name}-${run}`, action, visible);
    await finish(name, run);
    const acknowledged = await ack;
    assert.ok(acknowledged.status >= 200 && acknowledged.status < 300, `${name}: ${acknowledged.status}`);
    const persisted = await verify(acknowledged.body);
    const persistedAt = await epoch();
    await reconcile(acknowledged.body, persisted); await frames();
    state.stages.push({ name, run, start, firstVisibleMs: observation.firstVisibleMs, serverConfirmationMs: acknowledged.at - start,
      persistedReadMs: persistedAt - start, reconciliationMs: (await epoch()) - start, status: acknowledged.status, requestMs: acknowledged.requestMs, id: acknowledged.body.id });
    await save(); return acknowledged.body;
  }
  let expected;
  try {
    original = await api(`/api/issues/${id('issue-0-2')}`);
    originalComments = await api(`/api/issues/${original.id}/comments`);
    originalEvents = await api(`/api/issues/${original.id}/events`);
    assert.equal(original.project_id, fixture.projects[0]); assert.equal(originalComments.length, 2);
    state.fixture = { issue: original.id, title: original.title, effort: original.effort, originalComments: originalComments.map(({ id, body }) => ({ id, body })), eventsBefore: originalEvents.length, descriptionBytes: original.description.length };
    await save();
    const loaded = [];
    for (let n = 0; n < 24; n++) {
      const commentId = randomUUID(); state.ownedComments.push(commentId); await save();
      loaded.push(await api(`/api/issues/${original.id}/comments`, 'POST', { id: commentId, body: `MIN-614 3b loaded thread ${n}: Synthetic discussion with persisted encrypted content.`, ...(n >= 18 ? { parent_id: loaded[n - 18].id } : {}) }));
    }
    expected = [...originalComments, ...loaded];
    state.fixture.loadedComments = expected.length; state.fixture.loadedReplies = 6;
    await page.reload({ waitUntil: 'domcontentloaded' }); await boardReady();
    await measure('loaded-cold-open', () => active().locator(`[data-issue-id="${original.id}"]`).click(), () => ready(expected));
    const repeat = diagnostic || process.argv.includes('--mutation-correctness') || process.argv.includes('--property-correctness') || process.argv.includes('--read-correctness') || process.argv.includes('--cold-read-correctness') || process.argv.includes('--property-ranking') ? 1 : 10;
    for (let run = 0; run < repeat; run++) {
      // The old full menu clock is preserved; the new clock stops at first visibility.
      await probe('menu-first-visible', run, { kind: 'menu' }, () => panel().getByRole('button', { name: 'Issue actions', exact: true }).click(), () => page.getByRole('menu').waitFor());
      await page.keyboard.press('Escape');
      await close();
      await measure(`loaded-warm-open-${run}`, () => active().locator(`[data-issue-id="${original.id}"]`).click(), () => ready(expected), async () => {
        await panel().getByRole('button', { name: 'Issue actions', exact: true }).click(); await page.getByRole('menu').waitFor(); await frames(); await page.keyboard.press('Escape');
      });
      const text = `MIN-614 3b measured ${label} ${run}`;
      await composer().fill(text);
      const createAck = acknowledgement(`/api/issues/${original.id}/comments`, 'POST');
      await arm({ kind: 'comment', text });
      const created = await pipeline('comment-create', run, () => composer().press('ControlOrMeta+Enter'),
        () => panel().locator('[data-comment-id]').filter({ hasText: text }).waitFor(), createAck,
        async (saved) => { const comments = await api(`/api/issues/${original.id}/comments`); assert.equal(comments.filter((c) => c.id === saved.id && c.body === text).length, 1); return comments; },
        async (saved, comments) => { assert.equal(saved.body, text); expected = comments; await ready(expected); });
      const comment = row(created.id);
      await comment.getByRole('button', { name: 'Comment actions', exact: true }).click();
      await probe('editor-first-visible', run, { kind: 'editor', id: created.id }, () => page.getByRole('menuitem', { name: 'Edit', exact: true }).click(), () => comment.locator('[role="textbox"][contenteditable="true"]').waitFor());
      await comment.locator('[role="textbox"][contenteditable="true"]').fill(`${text} edited`);
      const editAck = acknowledgement(`/api/comments/${created.id}`, 'PATCH');
      await arm({ kind: 'editor-closed', id: created.id, text: `${text} edited` });
      await pipeline('comment-edit', run, () => comment.getByRole('button', { name: 'Save', exact: true }).click(),
        () => comment.locator('[role="textbox"][contenteditable="true"]').waitFor({ state: 'detached' }), editAck,
        async (saved) => { const comments = await api(`/api/issues/${original.id}/comments`); assert.equal(saved.id, created.id); assert.equal(comments.find((c) => c.id === created.id)?.body, `${text} edited`); return comments; },
        async (_saved, comments) => { expected = comments; await ready(expected); });
      await comment.getByRole('button', { name: 'Comment actions', exact: true }).click(); await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
      const deleteAck = acknowledgement(`/api/comments/${created.id}`, 'DELETE');
      await arm({ kind: 'comment-removed', id: created.id });
      await pipeline('comment-delete', run, () => page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click(),
        () => comment.waitFor({ state: 'detached' }), deleteAck,
        async () => { const comments = await api(`/api/issues/${original.id}/comments`); assert.ok(!comments.some((c) => c.id === created.id)); return comments; },
        async (_saved, comments) => { expected = comments; await ready(expected); });
      await panel().getByRole('button', { name: 'Change effort', exact: true }).click();
      const effortAck = acknowledgement(`/api/issues/${original.id}`, 'PATCH');
      await arm({ kind: 'property', label: 'Change effort', text: 'L' });
      await pipeline('effort', run, () => page.getByRole('option', { name: 'L', exact: true }).click(),
        () => panel().getByRole('button', { name: 'Change effort', exact: true }).getByText('L', { exact: true }).waitFor(), effortAck,
        async () => { const saved = await api(`/api/issues/${original.id}`); assert.equal(saved.effort, 'l'); return saved; }, async () => { if (phase3c) await panel().getByRole('button', { name: 'Change effort', exact: true }).getByText('L', { exact: true }).waitFor(); });
      await api(`/api/issues/${original.id}`, 'PATCH', { effort: original.effort });
      await close();
      await tab(pagesTab).click(); await page.locator('.page-editor .tiptap, a[href*="/pages/"]').first().waitFor(); await frames();
      const remoteBody = `MIN-614 3b remote ${run}`;
      await api(`/api/comments/${loaded[0].id}`, 'PATCH', { body: remoteBody });
      const hiddenId = randomUUID(); state.ownedComments.push(hiddenId); await save();
      const hidden = await api(`/api/issues/${original.id}/comments`, 'POST', { id: hiddenId, body: `MIN-614 3b hidden create ${run}` });
      await api(`/api/comments/${loaded[12].id}`, 'DELETE');
      expected = await api(`/api/issues/${original.id}/comments`);
      assert.equal(expected.find((c) => c.id === loaded[0].id)?.body, remoteBody); assert.ok(!expected.some((c) => c.id === loaded[12].id));
      await measure(`hidden-board-return-${run}`, () => tab(boardTab).click(), () => boardReady());
      try { await measure(`hidden-comment-reopen-${run}`, () => active().locator(`[data-issue-id="${original.id}"]`).click(), () => ready(expected)); }
      catch (error) {
        state.failures.push({ name: 'hidden-comment-reopen', run, error: error.message.split('\n')[0], at: Date.now(), persistedIds: expected.map((c) => c.id), visible: await panel().locator('[data-comment-id]').evaluateAll((nodes) => nodes.map((node) => ({ id: node.dataset.commentId, text: node.textContent }))) });
        await save();
        // Recovery is outside timings and never changes a failed sample to success.
        await page.reload({ waitUntil: 'domcontentloaded' }); await boardReady(); await open(expected);
      }
      assert.equal(await composer().textContent(), '');
      await api(`/api/comments/${loaded[0].id}`, 'PATCH', { body: loaded[0].body });
      await api(`/api/comments/${hidden.id}`, 'DELETE');
      // Delete a synthetic root with no replies; restore by its captured UUID.
      await api(`/api/issues/${original.id}/comments`, 'POST', { id: loaded[12].id, body: loaded[12].body });
      expected = await api(`/api/issues/${original.id}/comments`);
      await close(); await page.reload({ waitUntil: 'domcontentloaded' }); await boardReady(); await open(expected);
    }
    if (process.argv.includes('--mutation-correctness')) {
      expected = await verifyMutationJourneys({ page, api, original, fixture, panel, composer, row, state, save, close, boardReady, open, ready, output, label });
      await open(expected);
    }
    if (process.argv.includes('--property-ranking')) {
      const objectives = await api(`/api/projects/${original.project_id}/objectives`);
      const relations = await api(`/api/projects/${original.project_id}/issue-relations`);
      const resources = await api(`/api/issues/${original.id}/resources`);
      const automation = await api(`/api/issues/${original.id}/automation`);
      const agent = await api(`/api/issues/${original.id}/agent`);
      const feedback = await api(`/api/issues/${original.id}/feedback`);
      state.capabilityInventory = { objectives: objectives.length, relations: relations.length,
        resourceKinds: resources.map(({ kind }) => kind), commentAttachments: expected.reduce((n, row) => n + (row.attachments?.length ?? 0), 0),
        chainPresent: automation.chain != null, agentRuns: agent.runs.length, agentPullRequestPresent: agent.pullRequest != null, feedbackEntries: feedback.feedback.length,
        objectiveAssigned: original.objective_id !== null, planBytes: original.plan?.length ?? 0 };
      await rankProperties({ page, panel, measure, state, save });
    }
    if (process.argv.includes('--cold-read-correctness')) await verifyColdReadStates({ page, api, original, panel, close, open, expected, state, save });
    if (process.argv.includes('--read-correctness')) expected = await verifyReadStates({ page, api, original, panel, composer, close, open, ready, boardReady, state, save });
    if (process.argv.includes('--property-correctness')) {
      state.propertyChecks = [];
      for (let run = 0; run < 10; run++) {
        for (const effort of ['l', original.effort]) {
          await panel().getByRole('button', { name: 'Change effort', exact: true }).click();
          const ack = acknowledgement(`/api/issues/${original.id}`, 'PATCH');
          await page.getByRole('option', { name: effort.toUpperCase(), exact: true }).click();
          assert.equal((await ack).status, 200);
          const persisted = await api(`/api/issues/${original.id}`); assert.equal(persisted.effort, effort);
          await panel().getByRole('button', { name: 'Change effort', exact: true }).getByText(effort.toUpperCase(), { exact: true }).waitFor();
          state.propertyChecks.push({ run, id: original.id, persistedEffort: persisted.effort, visibleEffort: effort, at: Date.now() }); await save();
        }
      }
      state.checks.push('Ten native effort cycles verify the selected visible value again after server acknowledgement and persisted GET, then restore and verify the original visible/persisted value.');
    }
    if (process.argv.includes('--freshness-check')) {
      await api(`/api/comments/${loaded[12].id}`, 'DELETE');
      expected = await api(`/api/issues/${original.id}/comments`);
      try {
        await measure('remote-delete-only', async () => {}, () => ready(expected));
        state.checks.push('Isolated remote root deletion reconciles to the visible mounted thread.');
      } catch (error) {
        state.failures.push({ name: 'remote-delete-only', error: error.message.split('\n')[0], persistedIds: expected.map((c) => c.id), visibleIds: await panel().locator('[data-comment-id]').evaluateAll((nodes) => nodes.map((node) => node.dataset.commentId)) });
        await save(); await page.reload({ waitUntil: 'domcontentloaded' }); await boardReady(); await open(expected);
      }
    }
    state.checks.push('26 persisted comments including six replies; full IDs/content/membership checked after each write and hidden update; ordinary writes are never replayed.');
    await page.evaluate(() => { document.documentElement.classList.remove('dark'); document.documentElement.style.colorScheme = 'light'; });
    await panel().getByText('Activity', { exact: true }).scrollIntoViewIfNeeded(); await page.screenshot({ path: `${output}/${label}-loaded-light.png` });
    await close();
    // Preserve state while exercising a filtered and a scrolled loaded opening.
    await active().getByRole('button', { name: 'Filters', exact: true }).click(); await page.getByRole('menuitem', { name: 'Hide done issues', exact: true }).click(); await page.keyboard.press('Escape'); filtered = true; await boardReady();
    for (let run = 0; run < repeat; run++) {
    await measure(`filtered-loaded-open-${run}`, () => active().locator(`[data-issue-id="${original.id}"]`).click(), () => ready(expected), async () => {
      await panel().getByRole('button', { name: 'Issue actions', exact: true }).click(); await page.getByRole('menu').waitFor(); await frames(); await page.keyboard.press('Escape');
    });
    if (phase3c) {
      await probe('filtered-menu-first-visible', run, { kind: 'menu' }, () => panel().getByRole('button', { name: 'Issue actions', exact: true }).click(), () => page.getByRole('menu').waitFor()); await page.keyboard.press('Escape');
      const target = row(loaded[1].id);
      await target.getByRole('button', { name: 'Comment actions', exact: true }).click();
      await probe('filtered-editor-first-visible', run, { kind: 'editor', id: loaded[1].id }, () => page.getByRole('menuitem', { name: 'Edit', exact: true }).click(), () => target.locator('[role="textbox"][contenteditable="true"]').waitFor());
      await target.getByRole('button', { name: 'Cancel', exact: true }).click();
    }
    await close();
    }
    await active().getByRole('button', { name: 'Filters', exact: true }).click(); await page.getByRole('menuitem', { name: 'Hide done issues', exact: true }).click(); await page.keyboard.press('Escape'); filtered = false; await boardReady();
    const offsets = await active().locator('[data-board-column-scroller]').evaluateAll((nodes) => nodes.map((node) => { node.scrollTop = 160; return node.scrollTop; }));
    for (let run = 0; run < repeat; run++) {
      await measure(`scrolled-loaded-open-${run}`, () => active().locator(`[data-issue-id="${original.id}"]`).click(), () => ready(expected), async () => {
        await panel().getByRole('button', { name: 'Issue actions', exact: true }).click(); await page.getByRole('menu').waitFor(); await frames(); await page.keyboard.press('Escape');
      });
    if (phase3c) {
      await probe('scrolled-menu-first-visible', run, { kind: 'menu' }, () => panel().getByRole('button', { name: 'Issue actions', exact: true }).click(), () => page.getByRole('menu').waitFor()); await page.keyboard.press('Escape');
      const target = row(loaded[1].id);
      await target.getByRole('button', { name: 'Comment actions', exact: true }).click();
      await probe('scrolled-editor-first-visible', run, { kind: 'editor', id: loaded[1].id }, () => page.getByRole('menuitem', { name: 'Edit', exact: true }).click(), () => target.locator('[role="textbox"][contenteditable="true"]').waitFor());
      await target.getByRole('button', { name: 'Cancel', exact: true }).click();
    }
      await close();
    }
    state.scrolledOffsets = { requested: offsets, restored: await active().locator('[data-board-column-scroller]').evaluateAll((nodes) => nodes.map((node) => node.scrollTop)) };
    if (process.argv.includes('--freeze')) {
      await open(expected); await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
      await api(`/api/comments/${loaded[0].id}`, 'PATCH', { body: 'MIN-614 3b frozen remote edit' });
      expected = await api(`/api/issues/${original.id}/comments`);
      await cdp.send('Page.setWebLifecycleState', { state: 'active' });
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }); await ready(expected); state.checks.push('Real CDP renderer freeze/resume reconciles a remote edit.'); await close();
    }
    if (process.argv.includes('--reconnect')) {
      await open(expected);
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      assert.equal(await page.evaluate(() => navigator.onLine), false);
      if (process.argv.includes('--require-read-states')) await panel().locator('[data-timeline-read-state="paused"]').waitFor();
      await api(`/api/comments/${loaded[0].id}`, 'PATCH', { body: 'MIN-614 3b real offline remote edit' });
      await api(`/api/comments/${loaded[16].id}`, 'DELETE'); expected = await api(`/api/issues/${original.id}/comments`);
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      assert.equal(await page.evaluate(() => navigator.onLine), true);
      await ready(expected); state.checks.push('Real native CDP offline/online transition reconciles a persisted remote edit and deletion with exact visible IDs/content.'); await close();
    }
  } catch (error) {
    state.journeyError = error.message.split('\n')[0];
    state.availabilityFailure = { at: Date.now(), expected: expected?.map(({ id, body }) => ({ id, body })), visible: await panel().locator('[data-comment-id]').evaluateAll((nodes) => nodes.map((node) => ({ id: node.dataset.commentId, text: node.textContent }))).catch(() => null), apiStates: await page.evaluate(() => window.__min614.apiStates).catch(() => null) };
    throw error;
  }
  finally {
    page.off('request', capture);
    await Promise.allSettled(pendingWrites);
    await cdp.send('Page.setWebLifecycleState', { state: 'active' });
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await save();
    async function restoreFixture() {
    try {
      // Inspect persistence before cleanup. A successful HTTP response alone is insufficient.
      if (original) {
        if (state.relationScope) {
          const scope = state.relationScope;
          for (const relation of (await api(scope.path)).filter((relation) => !scope.originalIds.includes(relation.id) && relation.type === 'related' && ((relation.source_id === scope.source && relation.target_id === scope.target) || (relation.source_id === scope.target && relation.target_id === scope.source)))) await api(`/api/issue-relations/${relation.id}`, 'DELETE');
          assert.deepEqual((await api(scope.path)).map((relation) => relation.id).sort(), scope.originalIds.slice().sort());
        }
        if (state.resourceScope) {
          const scope = state.resourceScope;
          const resources = await api(`/api/issues/${scope.issue}/resources`);
          for (const resource of resources.filter((resource) => !scope.originalIds.includes(resource.id) && resource.file_name === scope.marker)) await api(`/api/resources/${resource.id}`, 'DELETE');
          assert.deepEqual((await api(`/api/issues/${scope.issue}/resources`)).map((resource) => resource.id).sort(), scope.originalIds.slice().sort());
        }
        if (state.childOriginal) {
          await api(`/api/issues/${state.childOriginal.id}`, 'PATCH', { parent_id: state.childOriginal.parent_id });
          assert.equal((await api(`/api/issues/${state.childOriginal.id}`)).parent_id, state.childOriginal.parent_id);
        }
        const current = await api(`/api/issues/${original.id}/comments`);
        for (const comment of current.filter((c) => state.ownedComments.includes(c.id))) await api(`/api/comments/${comment.id}`, 'DELETE');
        await api(`/api/issues/${original.id}`, 'PATCH', { effort: original.effort, title: original.title });
        const restored = await api(`/api/issues/${original.id}`), comments = await api(`/api/issues/${original.id}/comments`);
        assert.equal(restored.effort, original.effort); assert.equal(restored.title, original.title);
        assert.deepEqual(comments.map(({ id, body }) => ({ id, body })), originalComments.map(({ id, body }) => ({ id, body })));
        state.fixture.eventsAfter = (await api(`/api/issues/${original.id}/events`)).length;
        state.cleanup = true;
      }
    } catch (error) { state.cleanupError = error.message.split('\n')[0]; throw error; }
    finally { await save(); }
    }
    await restoreFixture();
  }
}
