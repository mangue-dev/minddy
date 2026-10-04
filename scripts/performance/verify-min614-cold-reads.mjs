import assert from 'node:assert/strict';
import { id } from './seed.mjs';

// Read-only native diagnostics on two issues whose timelines were not opened in this launch.
export async function verifyColdReadStates({ page, api, original, panel, close, open, expected, state, save }) {
  state.coldReadChecks = [];
  await close();
  for (const [index, failure] of [[4, false], [5, true]]) {
    const issue = await api(`/api/issues/${id(`issue-0-${index}`)}`);
    assert.equal(issue.project_id, original.project_id);
    const comments = await api(`/api/issues/${issue.id}/comments`);
    const pattern = new RegExp(`/api/issues/${issue.id}/(?:comments|events)$`);
    let release; const gate = new Promise((resolve) => { release = resolve; });
    const handled = [], errors = [];
    const snapshot = async (name) => {
      const row = { name, issueId: issue.id, expectedIds: comments.map(({ id }) => id),
        readState: await panel().locator('[data-timeline-read-state]').getAttribute('data-timeline-read-state'),
        visibleIds: await panel().locator('[data-comment-id]').evaluateAll((nodes) => nodes.map((node) => node.dataset.commentId)),
        noActivityVisible: await panel().getByText('No activity yet.', { exact: true }).isVisible(), at: Date.now() };
      state.coldReadChecks.push(row); await save(); return row;
    };
    const fresh = async () => {
      await page.waitForFunction(({ issue, comments }) => {
        const root = [...document.querySelectorAll('[role="dialog"][data-state="open"]')].find((node) => node.checkVisibility() && !node.inert);
        if (!root || root.querySelector('textarea')?.value !== issue.title || root.querySelector('[data-timeline-read-state]')?.getAttribute('data-timeline-read-state') !== 'fresh') return false;
        return root.querySelectorAll('[data-comment-id]').length === comments.length && comments.every(({ id, body }) => root.querySelector(`[data-comment-id="${id}"][data-comment-state="confirmed"]`)?.textContent.includes(body)) &&
          ['comments', 'events', 'agent', 'automation', 'feedback', 'resources'].every((part) => { const read = window.__min614.apiStates[`/api/issues/${issue.id}/${part}`]; return read && read.pending === 0 && read.status === 200; });
      }, { issue, comments: comments.map(({ id, body }) => ({ id, body })) }, { timeout: 5000 });
    };
    try {
      await page.route(pattern, async (route) => {
        if (route.request().method() !== 'GET') return route.continue();
        let done; handled.push(new Promise((resolve) => { done = resolve; }));
        try {
          if (failure) await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'MIN-614 injected cold read failure' }) });
          else { await gate; await route.continue(); }
        } catch (error) { errors.push(error.message.split('\n')[0]); }
        finally { done(); }
      });
      await page.locator(`[data-app-view-active="true"] [data-issue-id="${issue.id}"]`).click();
      const phase = failure ? 'error' : 'loading';
      await panel().locator(`[data-timeline-read-state="${phase}"]`).waitFor();
      assert.equal(await panel().locator('textarea').first().inputValue(), issue.title);
      const observed = await snapshot(failure ? 'cold-read-error' : 'cold-read-loading');
      assert.deepEqual(observed.visibleIds, []); assert.equal(observed.noActivityVisible, false);
      release(); await Promise.all(handled); await page.unroute(pattern); assert.deepEqual(errors, []);
      if (failure) await panel().getByRole('button', { name: 'Try again', exact: true }).click();
      await fresh(); await snapshot(failure ? 'cold-read-fresh-after-retry' : 'cold-read-fresh-after-release');
      await close();
    } finally { release(); await Promise.allSettled(handled); await page.unroute(pattern); }
  }
  await open(expected);
  state.checks.push('Two previously unopened issue timelines distinguish held initial loading and failed initial comments/events from successful empty activity; explicit retry/release yields exact fresh visible IDs/content. No writes.'); await save();
}
