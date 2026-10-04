import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

// Supplemental native checks. Writes are untimed, captured before acknowledgement,
// never replayed, and restored through the same authorized API before returning.
export async function verifyNativeNavigation({ page, context, specs, select, ready, issues, base, output, label, measure, inspectTabs }) {
  const state = { checks: [], cleanup: false, issue: null };
  const save = () => writeFile(`${output}/${label}-navigation-checks.json`, JSON.stringify(state, null, 2));
  const stage = async (name) => {
    state.stage = name; state.virtualTabs = inspectTabs();
    state.observation = await page.evaluate(() => ({ url: location.href, selected: document.querySelector('[data-app-tab-id][aria-selected="true"]')?.dataset.appTabId, roots: [...document.querySelectorAll('[data-retained-app-view]')].map((node) => ({ key: node.dataset.retainedAppView, tab: node.dataset.retainedTabId, active: node.dataset.appViewActive })), editors: [...document.querySelectorAll('.page-editor .tiptap')].map((node) => ({ visible: node.checkVisibility() })) })); await save();
  };
  const api = async (path, method = 'GET', data) => {
    const response = await context.request.fetch(`${base}${path}`, { method, ...(data ? { data } : {}) });
    assert.ok(response.ok(), `${method} ${path}: ${response.status()}`); return response.json();
  };
  const readyDiff = (count) => page.waitForFunction((count) => {
    const root = [...document.querySelectorAll('[data-testid="pr-diff-view"]')].find((node) => node.checkVisibility());
    if (!root || root.querySelectorAll('[id^="pr-file-"]').length !== count) return false;
    const first = root.querySelector('[id="pr-file-synthetic/file-0.ts"]');
    const text = (node) => (node.shadowRoot ? text(node.shadowRoot) : '') + [...node.childNodes].map((child) => child.nodeType === 3 ? child.textContent : text(child)).join('');
    return first && text(first).replace(/\s/g, '').includes('exportconstitem0=0;');
  }, count, { timeout: 15000 });
  try {
    await select(specs[3]); await ready(specs[3]);
    const files = page.getByRole('tab', { name: /^Files/ });
    await measure('supplemental-pr-small-files', () => files.click(), () => readyDiff(12));
    const smallWasMounted = await page.locator(`[data-retained-tab-id="${specs[3].id}"]`).count() > 0;
    await select(specs[5]); await ready(specs[5]);
    const smallStayedMounted = await page.locator(`[data-retained-tab-id="${specs[3].id}"]`).count() > 0;
    await select(specs[3]);
    const selectedFiles = await files.getAttribute('aria-selected');
    if (smallStayedMounted) assert.equal(selectedFiles, 'true', 'Retained PR keeps its internal tab');
    state.checks.push({ name: 'pr-small-internal-tab', retained: smallWasMounted && smallStayedMounted, filesSelectedAfterReturn: selectedFiles === 'true', scope: 'Cold eviction resets are reported separately from retained-state guarantees' }); await save();
    await page.getByRole('tab', { name: /^Commits/ }).click();
    await page.getByText('No commits', { exact: false }).first().waitFor();
    state.checks.push({ name: 'pr-commits-empty-adapter', passed: true }); await save();
    await page.getByRole('tab', { name: /^Activity/ }).click();
    await select(specs[10]); await ready(specs[10]);
    await measure('supplemental-pr-large-files', () => page.getByRole('tab', { name: /^Files/ }).click(), () => readyDiff(441));
    const diff = await page.getByTestId('pr-diff-view').filter({ visible: true }).evaluate((node) => ({ files: node.querySelectorAll('[id^="pr-file-"]').length, deferred: node.querySelectorAll('[data-testid="pr-diff-deferred-body"]').length, elements: node.querySelectorAll('*').length }));
    state.checks.push({ name: 'pr-large-files-rendered', passed: true, ...diff }); await save();
    await select(specs[11]); await ready(specs[11]);
    const largeStayedMounted = await page.locator(`[data-retained-tab-id="${specs[10].id}"]`).count() > 0;
    await select(specs[10]);
    const largeFiles = await page.getByRole('tab', { name: /^Files/ }).getAttribute('aria-selected');
    if (largeStayedMounted) { assert.equal(largeFiles, 'true'); await readyDiff(441); }
    state.checks.push({ name: 'pr-large-internal-tab', retained: largeStayedMounted, filesSelectedAfterReturn: largeFiles === 'true' }); await save();
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
    await stage('before-document-close');
    await tab.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Close tab', exact: true }).click();
    await tab.waitFor({ state: 'detached' });
    state.checks.push({ name: 'close-virtual-document-tab', passed: true }); await save();
    // Pages intentionally resumes the project document remembered by its owner.
    await stage('before-reopen-list'); await select(specs[1]); await stage('after-reopen-list-gesture');
    await ready(specs[2]);
    assert.equal((await editor.textContent()).replace(/\s/g, ''), specs[2].bodyText.replace(/\s/g, ''));
    for (let i = 0; i < 30 && inspectTabs().find((tab) => tab.id === specs[1].id)?.href !== specs[2].href; i++) await page.waitForTimeout(100);
    assert.equal(inspectTabs().find((tab) => tab.id === specs[1].id)?.href, specs[2].href, 'Remembered redirect must reconcile the existing tab target');
    state.checks.push({ name: 'reopen-remembered-document-in-pages-tab', passed: true }); await save();
    await stage('reopened-document');

    // Install the loss gate before the replacement socket is constructed.
    await context.addInitScript(() => {
      const Original = window.WebSocket;
      window.__min614Loss = { hold: false, dropped: 0, missedTargetEvents: 0, target: null };
      window.WebSocket = class extends Original {
        constructor(...args) {
          super(...args);
          this.addEventListener('message', (event) => {
            if (window.__min614Loss.hold) {
              window.__min614Loss.dropped++;
              try {
                const frame = JSON.parse(String(event.data)), message = Array.isArray(frame) ? { payload: frame[4] } : frame;
                const change = message.payload?.data?.payload ?? message.payload?.data ?? message.payload?.payload;
                if (change?.table === 'issues' && [change.record?.id, change.old_record?.id].includes(window.__min614Loss.target)) window.__min614Loss.missedTargetEvents++;
              } catch {}
              event.stopImmediatePropagation();
            }
          });
        }
      };
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator(`[data-app-tab-id="${specs[0].id}"]`).waitFor({ state: 'attached' });
    await select(specs[5]); await ready(specs[5]);
    const target = issues[0].find((row) => row.status === 'triage'); assert.ok(target);
    const original = await api(`/api/issues/${target.id}`);
    state.issue = { id: original.id, originalTitle: original.title, originalStatus: original.status, intendedTitle: original.title + ' [MIN-614 hidden navigation check]' }; await save();
    await select(specs[3]); await ready(specs[3]);
    await page.evaluate((id) => { window.__min614Loss.target = id; window.__min614Loss.hold = true; }, target.id);
    try { await api(`/api/issues/${target.id}`, 'PATCH', { title: state.issue.intendedTitle }); }
    catch (error) { state.ambiguousWrite = String(error); await save(); }
    const persisted = await api(`/api/issues/${target.id}`);
    assert.equal(persisted.title, state.issue.intendedTitle, 'Read persisted result once; never replay the write');
    await page.waitForTimeout(2000);
    state.lossGate = await page.evaluate(() => ({ ...window.__min614Loss })); await save();
    await page.evaluate(() => { window.__min614Loss.hold = false; window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); });
    const expected = { ...specs[5], titles: [state.issue.intendedTitle] };
    await select(expected); await ready(expected);
    state.checks.push({ name: 'hidden-write-authoritative-resume', passed: true, missedTargetEventsObserved: state.lossGate.missedTargetEvents, recovery: 'existing pageshow persisted catch-up owner' }); await save();
    if (state.ambiguousWrite) throw new Error('Ambiguous write persisted; stop after restoration');
  } catch (error) { state.error = error.message; state.failureUrl = page.url(); state.failureTab = await page.locator('[data-app-tab-id][aria-selected="true"]').getAttribute('data-app-tab-id'); await save(); throw error; }
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
