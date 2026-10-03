import assert from 'node:assert/strict';
import { id } from './seed.mjs';

// Real native UI failure/concurrency checks, kept outside ordinary latency samples.
export async function verifyMutationJourneys({ page, api, original, fixture, panel, composer, state, save, close, boardReady, open, ready }) {
  const path = `/api/issues/${original.id}/comments`;
  const routes = [], releases = [];
  const intercept = async (routePath, handler) => { const pattern = `**${routePath}`; await page.route(pattern, handler); routes.push(pattern); return pattern; };
  let expected;
  try {
    const failedText = 'MIN-614 3b injected failed comment';
    const failedRoute = await intercept(path, (route) => route.request().method() === 'POST'
      ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'MIN-614 injected failure before persistence' }) }) : route.continue());
    await composer().fill(failedText); await composer().press('ControlOrMeta+Enter');
    const failed = panel().locator('[data-comment-state="error"]').filter({ hasText: failedText }); await failed.waitFor();
    const failedId = await failed.getAttribute('data-comment-id'); assert.ok(state.ownedComments.includes(failedId));
    assert.ok(!(await api(path)).some((comment) => comment.id === failedId));
    await page.unroute(failedRoute); await composer().fill('MIN-614 3b newer unsent draft');
    await failed.getByRole('button', { name: 'Try again', exact: true }).click();
    await panel().locator(`[data-comment-id="${failedId}"][data-comment-state="confirmed"]`).waitFor();
    expected = await api(path); assert.equal(expected.filter((comment) => comment.id === failedId && comment.body === failedText).length, 1);
    assert.equal(await composer().textContent(), 'MIN-614 3b newer unsent draft'); await composer().fill(''); await ready(expected);
    state.checks.push('Injected pre-write 503 retains the failed UUID/body; explicit retry persists exactly one row and preserves a newer unsent draft.'); await save();

    const failedCommentPath = `/api/comments/${failedId}`;
    const failedMutationRoute = await intercept(failedCommentPath, (route) => ['PATCH', 'DELETE'].includes(route.request().method())
      ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'MIN-614 injected existing-comment mutation failure' }) }) : route.continue());
    const failedComment = panel().locator(`[data-comment-id="${failedId}"]`);
    await failedComment.getByRole('button', { name: 'Comment actions', exact: true }).click(); await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
    const editDraft = failedComment.locator('[role="textbox"][contenteditable="true"]'); await editDraft.fill('MIN-614 3b retained edit draft');
    const rejectedEdit = page.waitForResponse((response) => new URL(response.url()).pathname === failedCommentPath && response.request().method() === 'PATCH');
    await failedComment.getByRole('button', { name: 'Save', exact: true }).click(); assert.equal((await rejectedEdit).status(), 503);
    assert.equal(await editDraft.textContent(), 'MIN-614 3b retained edit draft'); assert.equal((await api(path)).find((comment) => comment.id === failedId)?.body, failedText);
    await failedComment.getByRole('button', { name: 'Cancel', exact: true }).click();
    await failedComment.getByRole('button', { name: 'Comment actions', exact: true }).click(); await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
    const rejectedDelete = page.waitForResponse((response) => new URL(response.url()).pathname === failedCommentPath && response.request().method() === 'DELETE');
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click(); assert.equal((await rejectedDelete).status(), 503);
    await failedComment.waitFor(); assert.equal((await api(path)).find((comment) => comment.id === failedId)?.body, failedText);
    if (await page.getByRole('alertdialog').count()) await page.keyboard.press('Escape');
    await page.unroute(failedMutationRoute); await ready(expected);
    state.checks.push('Injected edit/delete 503 keeps the edit draft, original confirmed row and persisted body; no successful obsolete UI is accepted.'); await save();

    if (process.argv.includes('--phase3c')) {
      const committedBody = 'MIN-614 3c edit with ambiguous acknowledgement';
      let patchCount = 0;
      const ambiguousEdit = await intercept(failedCommentPath, async (route) => {
        if (route.request().method() !== 'PATCH') return route.continue();
        patchCount++;
        const response = await route.fetch(); assert.equal(response.status(), 200);
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'MIN-614 injected lost edit acknowledgement' }) });
      });
      await failedComment.getByRole('button', { name: 'Comment actions', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
      await editDraft.fill(committedBody);
      const lostAck = page.waitForResponse((response) => new URL(response.url()).pathname === failedCommentPath && response.request().method() === 'PATCH');
      await failedComment.getByRole('button', { name: 'Save', exact: true }).click(); assert.equal((await lostAck).status(), 503);
      await editDraft.waitFor(); assert.equal(await editDraft.textContent(), committedBody);
      expected = await api(path); assert.equal(expected.filter((row) => row.id === failedId && row.body === committedBody).length, 1);
      await failedComment.getByRole('button', { name: 'Cancel', exact: true }).click();
      await ready(expected); assert.equal(patchCount, 1); await page.unroute(ambiguousEdit);
      state.checks.push('Post-commit edit acknowledgement loss retains the submitted draft and reconciles the canonical persisted body by GET; exactly one PATCH and one row, with no replay.'); await save();
    }

    // Commit once, then replace the acknowledgement: inspect persistence before any retry.
    const ambiguousText = 'MIN-614 3b ambiguous acknowledgement';
    const ambiguousRoute = await intercept(path, async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      const response = await route.fetch(); assert.equal(response.status(), 201);
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'MIN-614 injected lost acknowledgement after commit' }) });
    });
    await composer().fill(ambiguousText); await composer().press('ControlOrMeta+Enter');
    const ambiguous = panel().locator('[data-comment-id]').filter({ hasText: ambiguousText }); await ambiguous.waitFor();
    const ambiguousId = await ambiguous.getAttribute('data-comment-id');
    await panel().locator(`[data-comment-id="${ambiguousId}"][data-comment-state="confirmed"]`).waitFor();
    expected = await api(path); assert.equal(expected.filter((comment) => comment.id === ambiguousId && comment.body === ambiguousText).length, 1);
    await ready(expected); await page.unroute(ambiguousRoute);
    state.checks.push('Injected post-commit 503 reconciles by the dispatch UUID through an authorized read without replaying the write or creating a duplicate.'); await save();

    const held = [];
    let allHeld; const heldArrival = new Promise((resolve) => { allHeld = resolve; });
    const heldRoute = await intercept(path, async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      await new Promise((resolve) => { held.push({ resolve, id: route.request().postDataJSON().id }); releases.push(resolve); if (held.length === 2) allHeld(); });
      await route.continue();
    });
    for (const body of ['MIN-614 3b concurrent first', 'MIN-614 3b concurrent second']) {
      await composer().fill(body); await composer().press('ControlOrMeta+Enter');
      await panel().locator('[data-comment-state="sending"]').filter({ hasText: body }).waitFor();
    }
    await page.waitForFunction(() => document.querySelectorAll('[data-comment-state="sending"]').length === 2);
    await heldArrival; assert.equal(held.length, 2); assert.ok(held.every((write) => state.ownedComments.includes(write.id)));
    assert.ok(!(await api(path)).some((comment) => held.some((write) => write.id === comment.id)));
    await composer().fill('MIN-614 3b concurrent unsent draft'); held[1].resolve();
    await panel().locator(`[data-comment-id="${held[1].id}"][data-comment-state="confirmed"]`).waitFor();
    held[0].resolve(); await panel().locator(`[data-comment-id="${held[0].id}"][data-comment-state="confirmed"]`).waitFor();
    expected = await api(path); assert.ok(held.every((write) => expected.filter((comment) => comment.id === write.id).length === 1));
    assert.equal(await composer().textContent(), 'MIN-614 3b concurrent unsent draft'); await composer().fill(''); await ready(expected); await page.unroute(heldRoute);
    state.checks.push('Two actual composer writes settle in reverse order; exact IDs/content/membership reconcile without duplicates and retain a newer draft.'); await save();

    const propertyPath = `/api/issues/${original.id}`;
    const propertyRoute = await intercept(propertyPath, (route) => route.request().method() === 'PATCH'
      ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'MIN-614 injected property failure' }) }) : route.continue());
    await panel().getByRole('button', { name: 'Change effort', exact: true }).click(); await page.getByRole('option', { name: 'L', exact: true }).click();
    await panel().getByRole('button', { name: 'Change effort', exact: true }).getByText(original.effort.toUpperCase(), { exact: true }).waitFor();
    assert.equal((await api(propertyPath)).effort, original.effort); await page.unroute(propertyRoute);
    state.checks.push('Injected property PATCH restores original visible and persisted effort.'); await close();

    const other = await api(`/api/issues/${id('issue-0-1')}`), relationPath = `/api/projects/${original.project_id}/issue-relations`;
    const matchesRelation = (relation) => relation.type === 'related' && ((relation.source_id === original.id && relation.target_id === other.id) || (relation.source_id === other.id && relation.target_id === original.id));
    const beforeRelations = await api(relationPath);
    assert.ok(!beforeRelations.some((relation) => matchesRelation(relation)));
    state.relationScope = { path: relationPath, source: original.id, target: other.id, originalIds: beforeRelations.map((relation) => relation.id) };
    state.childOriginal = { id: other.id, parent_id: other.parent_id }; await save(); await open(expected);
    const relations = [];
    let relationArrived; const relationArrival = new Promise((resolve) => { relationArrived = resolve; });
    const relationRoute = await intercept(relationPath, async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      state.relationDispatch = route.request().postDataJSON(); await save();
      await new Promise((resolve) => { relations.push(resolve); releases.push(resolve); relationArrived(); }); await route.continue();
    });
    const addRelation = async () => {
      await panel().getByRole('button', { name: 'Link an issue or objective', exact: true }).click();
      await page.getByRole('option', { name: 'Related', exact: true }).click(); await page.getByRole('option').filter({ hasText: other.title }).click();
    };
    await addRelation(); await panel().getByRole('button').filter({ hasText: other.title }).waitFor();
    await relationArrival; assert.equal(relations.length, 1); assert.ok(!(await api(relationPath)).some((relation) => matchesRelation(relation)));
    const relationAck = page.waitForResponse((response) => new URL(response.url()).pathname === relationPath && response.request().method() === 'POST');
    relations[0](); const acknowledged = await relationAck; assert.equal(acknowledged.status(), 201);
    const persistedRelations = await api(relationPath); const saved = persistedRelations.find((relation) => matchesRelation(relation));
    assert.ok(saved?.id); state.relationPersistedId = saved.id; await save(); await page.unroute(relationRoute);
    await api(`/api/issue-relations/${saved.id}`, 'DELETE');
    await close(); await page.reload({ waitUntil: 'domcontentloaded' }); await boardReady(); await open(expected);
    const rejectedRoute = await intercept(relationPath, (route) => route.request().method() === 'POST'
      ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'MIN-614 injected relation failure' }) }) : route.continue());
    await addRelation(); await panel().getByRole('button').filter({ hasText: other.title }).waitFor({ state: 'detached' });
    assert.ok(!(await api(relationPath)).some((relation) => matchesRelation(relation))); await page.unroute(rejectedRoute);
    state.checks.push('MIN-630 native revalidation: relation visible before held POST, canonical persisted ID, failed POST rollback; its implementation is unchanged.'); await save(); await close();

    state.resourceScope = { issue: original.id, originalIds: (await api(`/api/issues/${original.id}/resources`)).map((resource) => resource.id), marker: 'MIN-614 3b linked synthetic Page' }; await save();
    await api(`/api/issues/${original.id}/resources`, 'POST', { resources: [{ kind: 'page', page_id: fixture.firstPage, file_name: state.resourceScope.marker }] });
    await api(`/api/issues/${other.id}`, 'PATCH', { parent_id: original.id });
    await page.reload({ waitUntil: 'domcontentloaded' }); await boardReady(); await open(expected);
    await panel().locator(`a[href="/projects/${original.project_id}/pages/${fixture.firstPage}"]`).waitFor();
    assert.ok((await api(`/api/issues/${original.id}/resources`)).some((resource) => resource.page_id === fixture.firstPage));
    await panel().getByRole('button').filter({ hasText: other.title }).click();
    await panel().locator('textarea').first().waitFor();
    await page.waitForFunction((title) => [...document.querySelectorAll('[role="dialog"][data-state="open"] textarea')].some((node) => node.value === title && node.checkVisibility()), other.title);
    const childComments = await api(`/api/issues/${other.id}/comments`);
    for (const comment of childComments) await panel().locator(`[data-comment-id="${comment.id}"][data-comment-state="confirmed"]`).waitFor();
    await close(); assert.equal(await page.evaluate(() => Boolean(document.activeElement?.closest('[data-app-view-active="false"], [inert]'))), false);
    state.checks.push('A populated encrypted Page resource is visible; actual child navigation loads the child title/comment IDs; dismissal leaves focus outside hidden/inert views.'); await save();
    return expected;
  } finally { for (const release of releases) release(); for (const pattern of routes) await page.unroute(pattern); }
}
