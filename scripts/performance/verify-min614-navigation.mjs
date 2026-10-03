import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

// Supplemental native checks. Writes are untimed, captured before acknowledgement,
// never replayed, and restored through the same authorized API before returning.
export async function verifyNativeNavigation({ page, context, specs, select, ready, issues, base, output, label, measure }) {
  const state = { checks: [], cleanup: false, issue: null };
  const save = () => writeFile(`${output}/${label}-navigation-checks.json`, JSON.stringify(state, null, 2));
  const api = async (path, method = 'GET', data) => {
    const response = await context.request.fetch(`${base}${path}`, { method, ...(data ? { data } : {}) });
    assert.ok(response.ok(), `${method} ${path}: ${response.status()}`); return response.json();
  };
  try {
    await select(specs[3]); await ready(specs[3]);
    const files = page.getByRole('tab', { name: /^Files/ });
    await measure('supplemental-pr-small-files', () => files.click(), () => page.getByTestId('pr-diff-view').filter({ visible: true }).waitFor());
    await select(specs[5]); await ready(specs[5]);
    await select(specs[3]);
    assert.equal(await files.getAttribute('aria-selected'), 'true', 'Retained PR keeps its internal tab');
    state.checks.push({ name: 'pr-internal-tab-retained', passed: true }); await save();
    await page.getByRole('tab', { name: /^Commits/ }).click();
    await page.getByText('No commits', { exact: false }).first().waitFor();
    state.checks.push({ name: 'pr-commits-empty-adapter', passed: true }); await save();
    await page.getByRole('tab', { name: /^Activity/ }).click();
    await select(specs[10]); await ready(specs[10]);
    await measure('supplemental-pr-large-files', () => page.getByRole('tab', { name: /^Files/ }).click(), () => page.getByTestId('pr-diff-view').filter({ visible: true }).waitFor());
    const diff = await page.getByTestId('pr-diff-view').filter({ visible: true }).evaluate((node) => ({ files: node.querySelectorAll('[id]').length, deferred: node.querySelectorAll('[data-testid="pr-diff-deferred-body"]').length }));
    state.checks.push({ name: 'pr-large-files-rendered', passed: true, ...diff }); await save();
    await page.getByRole('tab', { name: /^Activity/ }).click();

    // Document selection is local UI state; no editor input or autosave is sent.
    await select(specs[2]); await ready(specs[2]);
    const editor = page.locator('.page-editor .tiptap').filter({ visible: true });
    const selection = await editor.evaluate((node) => {
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT), text = walker.nextNode();
      node.focus(); const range = document.createRange(); range.setStart(text, 0); range.setEnd(text, Math.min(8, text.textContent.length));
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); return selection.toString();
    });
    await select(specs[7]); await ready(specs[7]); await select(specs[2]); await ready(specs[2]);
    state.checks.push({ name: 'document-selection', before: selection, after: await page.evaluate(() => window.getSelection()?.toString()), focused: await editor.evaluate((node) => node.contains(document.activeElement)) }); await save();

    // Exercise close/reopen through the real session UI with virtual persistence.
    const tab = page.locator(`[data-app-tab-id="${specs[2].id}"]`);
    await tab.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Close tab', exact: true }).click();
    await tab.waitFor({ state: 'detached' });
    state.checks.push({ name: 'close-virtual-document-tab', passed: true }); await save();
    await select(specs[1]); await ready(specs[1]);
    await page.locator(`a[href="${specs[1].firstHref}"]`).filter({ visible: true }).first().click();
    await ready(specs[2]);
    assert.equal((await editor.textContent()).replace(/\s/g, ''), specs[2].bodyText.replace(/\s/g, ''));
    state.checks.push({ name: 'reopen-document-in-pages-tab', passed: true }); await save();

    // Install the loss gate before the replacement socket is constructed.
    await context.addInitScript(() => {
      const Original = window.WebSocket;
      window.__min614Loss = { hold: false, dropped: 0 };
      window.WebSocket = class extends Original {
        constructor(...args) {
          super(...args);
          this.addEventListener('message', (event) => {
            if (window.__min614Loss.hold) { window.__min614Loss.dropped++; event.stopImmediatePropagation(); }
          });
        }
      };
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await select(specs[5]); await ready(specs[5]);
    const target = issues[0].find((row) => row.status === 'triage'); assert.ok(target);
    const original = await api(`/api/issues/${target.id}`);
    state.issue = { id: original.id, originalTitle: original.title, originalStatus: original.status, intendedTitle: original.title + ' [MIN-614 hidden navigation check]' }; await save();
    await select(specs[3]); await ready(specs[3]);
    await page.evaluate(() => { window.__min614Loss.hold = true; });
    try { await api(`/api/issues/${target.id}`, 'PATCH', { title: state.issue.intendedTitle }); }
    catch (error) { state.ambiguousWrite = String(error); await save(); }
    const persisted = await api(`/api/issues/${target.id}`);
    assert.equal(persisted.title, state.issue.intendedTitle, 'Read persisted result once; never replay the write');
    await page.waitForTimeout(2000);
    state.lossGate = await page.evaluate(() => ({ ...window.__min614Loss })); await save();
    await page.evaluate(() => { window.__min614Loss.hold = false; window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); });
    const expected = { ...specs[5], titles: [state.issue.intendedTitle] };
    await select(expected); await ready(expected);
    state.checks.push({ name: 'hidden-write-authoritative-resume', passed: true, missedMessagesObserved: state.lossGate.dropped > 0, recovery: 'existing pageshow persisted catch-up owner' }); await save();
    if (state.ambiguousWrite) throw new Error('Ambiguous write persisted; stop after restoration');
  } catch (error) { state.error = error.message.split('\n')[0]; await save(); throw error; }
  finally {
    if (state.issue) {
      const current = await api(`/api/issues/${state.issue.id}`);
      assert.ok([state.issue.originalTitle, state.issue.intendedTitle].includes(current.title));
      if (current.title !== state.issue.originalTitle) await api(`/api/issues/${state.issue.id}`, 'PATCH', { title: state.issue.originalTitle });
      const restored = await api(`/api/issues/${state.issue.id}`);
      assert.equal(restored.title, state.issue.originalTitle); assert.equal(restored.status, state.issue.originalStatus);
    }
    state.cleanup = true; await save();
  }
}
