import assert from 'node:assert/strict';

// Injected read diagnostics are separate from ordinary timings and never replay writes.
export async function verifyReadStates({ page, api, original, panel, composer, close, open, ready, boardReady, state, save }) {
  const path = `/api/issues/${original.id}/comments`, pattern = `**${path}`;
  let release;
  const handlers = [], routeErrors = [];
  const releaseReads = async () => { release?.(); await Promise.allSettled(handlers); await page.unroute(pattern); };
  const snapshot = async (name) => {
    const root = panel();
    const status = root.locator('[data-timeline-read-state]');
    const present = await status.count() > 0;
    const observation = { name, at: Date.now(), rows: await root.locator('[data-comment-id]').evaluateAll((nodes) => nodes.map((node) => ({ id: node.dataset.commentId, text: node.textContent }))),
      readState: present ? await status.getAttribute('data-timeline-read-state') : null,
      messages: present ? await status.textContent() : null,
      request: await page.evaluate((path) => window.__min614.apiStates[path], path) };
    state.readChecks ??= []; state.readChecks.push(observation); await save(); return observation;
  };
  try {
    let expected = await api(path); const target = expected.find((c) => c.body.startsWith('MIN-614 3b loaded thread 0:'));
    assert.ok(target); await close();
    let arrive; const arrived = new Promise((resolve) => { arrive = resolve; });
    const gate = new Promise((resolve) => { release = resolve; });
    await page.route(pattern, async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      let handled; handlers.push(new Promise((resolve) => { handled = resolve; }));
      try { arrive(); await gate; await route.continue(); }
      catch (error) { routeErrors.push(error.message.split('\n')[0]); }
      finally { handled(); }
    });
    await api(`/api/comments/${target.id}`, 'PATCH', { body: 'MIN-614 3c slow remote update' });
    expected = await api(path);
    await page.locator(`[data-app-view-active="true"] [data-issue-id="${original.id}"]`).click(); await arrived;
    await composer().fill('MIN-614 3c retained draft during read');
    const previous = await snapshot('slow-cached-refresh');
    assert.ok(previous.rows.some((row) => row.id === target.id && row.text.includes(target.body)));
    assert.ok(previous.request.pending > 0);
    if (process.argv.includes('--require-read-states')) assert.equal(previous.readState, 'refreshing');
    await releaseReads(); assert.deepEqual(routeErrors, []); await ready(expected);
    const fresh = await snapshot('fresh-after-release');
    assert.ok(fresh.rows.some((row) => row.id === target.id && row.text.includes('MIN-614 3c slow remote update')));
    if (process.argv.includes('--require-read-states')) assert.equal(fresh.readState, 'fresh');
    assert.equal(await composer().textContent(), 'MIN-614 3c retained draft during read');

    await close();
    await page.route(pattern, (route) => route.request().method() === 'GET'
      ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'MIN-614 injected read failure' }) }) : route.continue());
    await page.locator(`[data-app-view-active="true"] [data-issue-id="${original.id}"]`).click();
    await page.waitForTimeout(2200); const failed = await snapshot('failed-cached-refresh');
    assert.equal(failed.request.status, 503); assert.equal(failed.rows.length, expected.length);
    if (process.argv.includes('--require-read-states')) {
      assert.equal(failed.readState, 'error');
      await panel().getByRole('button', { name: 'Try again', exact: true }).waitFor();
    }
    await page.unroute(pattern);
    if (process.argv.includes('--require-read-states')) await panel().getByRole('button', { name: 'Try again', exact: true }).click();
    else { await close(); await open(expected); }
    await ready(expected); await snapshot('fresh-after-explicit-retry');
    await composer().fill(''); await close();

    // Hold a real read, close the issue, then release it. Capture browser cancellation.
    let cancelArrive; const cancelArrived = new Promise((resolve) => { cancelArrive = resolve; });
    const canceled = [];
    const cancelGate = new Promise((resolve) => { release = resolve; });
    const failedRequest = (request) => { if (new URL(request.url()).pathname === path) canceled.push(request.failure()?.errorText); };
    page.on('requestfailed', failedRequest);
    await page.route(pattern, async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      let handled; handlers.push(new Promise((resolve) => { handled = resolve; }));
      try { cancelArrive(); await cancelGate; await route.continue().catch(() => {}); } finally { handled(); }
    });
    await page.locator(`[data-app-view-active="true"] [data-issue-id="${original.id}"]`).click(); await cancelArrived;
    await close(); await page.waitForTimeout(100); await releaseReads(); await page.waitForTimeout(500);
    page.off('requestfailed', failedRequest);
    state.readChecks.push({ name: 'closed-pending-read', at: Date.now(), canceled });
    if (process.argv.includes('--require-read-states')) assert.ok(canceled.length > 0, 'Closing must abort the real pending comments read');
    await api(`/api/comments/${target.id}`, 'PATCH', { body: target.body }); expected = await api(path);
    await page.reload({ waitUntil: 'domcontentloaded' }); await boardReady(); await open(expected);
    await snapshot('reopen-after-canceled-read');
    await save(); return expected;
  } finally { await releaseReads(); }
}
