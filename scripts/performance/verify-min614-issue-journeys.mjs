import assert from "node:assert/strict";
import { id } from "./seed.mjs";

// Supplemental native correctness checks. Injected failures are never latency evidence.
export async function verifyIssueJourneys({ page, api, other, fixture, panel, ready, open, close, boardReady, checks }) {
  const mutable = await api(`/api/issues/${id('issue-0-2')}`);
  const comments = await api(`/api/issues/${mutable.id}/comments`);
  const relationPath = `/api/projects/${mutable.project_id}/issue-relations`;
  const relations = new Set(), resources = new Set(), newComments = new Set();
  let release;
  const routes = [];
  const intercept = async (path, handler) => {
    const pattern = `**${path}`;
    await page.route(pattern, handler);
    routes.push(pattern);
  };
  async function addRelation() {
    await panel().getByRole('button', { name: 'Link an issue or objective', exact: true }).click();
    await page.getByRole('option', { name: 'Related', exact: true }).click();
    await page.getByRole('option').filter({ hasText: other.title }).click();
  }
  try {
    await open(mutable, comments);
    let held;
    const arrived = new Promise((resolve) => { held = resolve; });
    await intercept(relationPath, async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      await new Promise((resolve) => { release = resolve; held(); });
      await route.continue();
    });
    const ack = page.waitForResponse((response) => new URL(response.url()).pathname === relationPath && response.request().method() === 'POST');
    await addRelation();
    await panel().getByRole('button').filter({ hasText: other.title }).waitFor();
    await arrived;
    assert.ok(release, 'Relation did not issue its persisted write');
    assert.equal((await api(relationPath)).filter((row) => row.source_id === mutable.id && row.target_id === other.id).length, 0);
    release(); release = null;
    const relationAck = await ack;
    assert.equal(relationAck.status(), 201);
    const saved = await relationAck.json();
    relations.add(saved.id);
    assert.equal((await api(relationPath)).filter((row) => row.id === saved.id).length, 1);
    await page.unroute(`**${relationPath}`);
    await api(`/api/issue-relations/${saved.id}`, 'DELETE'); relations.delete(saved.id);
    await close(); await page.reload({ waitUntil: 'domcontentloaded' }); await boardReady(); await open(mutable, comments);
    await intercept(relationPath, async (route) => route.request().method() === 'POST'
      ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'MIN-614 injected relation failure' }) }) : route.continue());
    await addRelation();
    await panel().getByRole('button').filter({ hasText: other.title }).waitFor({ state: 'detached' });
    assert.equal((await api(relationPath)).filter((row) => row.source_id === mutable.id && row.target_id === other.id).length, 0);
    await page.unroute(`**${relationPath}`);
    checks.push('MIN-630 native revalidation: relation visible before held POST, canonical persisted identity, failed POST rollback; unit tests cover endpoint kinds and concurrent failures');

    await intercept(`/api/issues/${mutable.id}`, async (route) => route.request().method() === 'PATCH'
      ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'MIN-614 injected property failure' }) }) : route.continue());
    await panel().getByRole('button', { name: 'Change effort', exact: true }).click();
    await page.getByRole('option', { name: 'L', exact: true }).click();
    await panel().getByRole('button', { name: 'Change effort', exact: true }).getByText(mutable.effort.toUpperCase(), { exact: true }).waitFor();
    assert.equal((await api(`/api/issues/${mutable.id}`)).effort, mutable.effort);
    await page.unroute(`**/api/issues/${mutable.id}`);
    checks.push('Failed property PATCH restores the original visible and persisted effort');

    const text = 'MIN-614 supplemental failed comment retry';
    await intercept(`/api/issues/${mutable.id}/comments`, async (route) => route.request().method() === 'POST'
      ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'MIN-614 injected comment failure' }) }) : route.continue());
    const composer = panel().locator('[role="textbox"][contenteditable="true"]').last();
    await composer.fill(text); await composer.press('ControlOrMeta+Enter');
    const failed = panel().locator('[data-comment-state="error"]').filter({ hasText: text });
    await failed.waitFor();
    assert.equal((await api(`/api/issues/${mutable.id}/comments`)).filter((row) => row.body === text).length, 0);
    await page.unroute(`**/api/issues/${mutable.id}/comments`);
    await composer.fill('MIN-614 newer unsent draft');
    const [confirmed] = await Promise.all([
      page.waitForResponse((response) => new URL(response.url()).pathname === `/api/issues/${mutable.id}/comments` && response.request().method() === 'POST'),
      failed.getByRole('button', { name: 'Try again', exact: true }).click(),
    ]);
    assert.equal(confirmed.status(), 201);
    const comment = await confirmed.json(); newComments.add(comment.id);
    await panel().locator(`[data-comment-id="${comment.id}"][data-comment-state="confirmed"]`).waitFor();
    assert.equal((await api(`/api/issues/${mutable.id}/comments`)).filter((row) => row.body === text).length, 1);
    assert.equal(await composer.textContent(), 'MIN-614 newer unsent draft');
    await composer.fill('');
    checks.push('Failed comment remains retryable; retry persists exactly one row and preserves a newer unsent composer draft');
    await close();

    const attached = await api(`/api/issues/${mutable.id}/resources`, 'POST', { resources: [{ kind: 'page', page_id: fixture.firstPage, file_name: 'MIN-614 linked synthetic Page' }] });
    for (const resource of attached) resources.add(resource.id);
    await api(`/api/issues/${other.id}`, 'PATCH', { parent_id: mutable.id });
    await page.reload({ waitUntil: 'domcontentloaded' }); await boardReady(); await open(mutable, comments);
    const pageResource = panel().locator(`a[href="/projects/${mutable.project_id}/pages/${fixture.firstPage}"]`);
    await pageResource.waitFor();
    assert.ok((await api(`/api/issues/${mutable.id}/resources`)).some((row) => row.page_id === fixture.firstPage));
    await panel().getByRole('button').filter({ hasText: other.title }).click();
    await ready({ ...other, parent_id: mutable.id }, await api(`/api/issues/${other.id}/comments`));
    await close();
    assert.equal(await page.evaluate(() => Boolean(document.activeElement?.closest('[data-app-view-active="false"], [inert]'))), false);
    checks.push('Authorized encrypted Page resource resolves to its existing page; populated sub-issue navigation loads the child; dismissal does not leave focus in an inert or hidden view');
  } finally {
    release?.();
    for (const pattern of routes) await page.unroute(pattern);
    await api(`/api/issues/${mutable.id}`, 'PATCH', { title: mutable.title, effort: mutable.effort });
    await api(`/api/issues/${other.id}`, 'PATCH', { parent_id: other.parent_id });
    for (const relation of relations) await api(`/api/issue-relations/${relation}`, 'DELETE');
    for (const resource of resources) await api(`/api/resources/${resource}`, 'DELETE');
    for (const comment of newComments) await api(`/api/comments/${comment}`, 'DELETE');
    assert.deepEqual((await api(`/api/issues/${mutable.id}/comments`)).map((row) => row.id).sort(), comments.map((row) => row.id).sort());
    assert.equal((await api(`/api/issues/${other.id}`)).parent_id, other.parent_id);
  }
}
