import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

// Hold only synthetic forge UI responses. Product consumers and cancellation
// remain unchanged; this diagnostic is excluded from matched ordinary timings.
export async function verifyNavigationPreparation({ page, specs, select, ready, output, label }) {
  const state = { checks: [], requests: [], cleanup: false };
  const save = () => writeFile(`${output}/${label}-navigation-preparation.json`, JSON.stringify(state, null, 2));
  const path = `/api/pull-requests/${new URL(specs[3].href, 'http://localhost').searchParams.get('pr')}`;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let held = true;
  const handler = async (route) => {
    state.requests.push({ at: Date.now(), method: route.request().method() });
    await save();
    if (held) await gate;
    try { await route.fallback(); } catch (error) { state.transportErrors ??= []; state.transportErrors.push(String(error).split('\n')[0]); }
  };
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator(`[data-app-tab-id="${specs[0].id}"]`).waitFor({ state: 'attached' });
  await select(specs[5]); await ready(specs[5]);
  await page.route(`**${path}`, handler);
  try {
    await page.locator(`[data-app-tab-id="${specs[3].id}"]`).hover();
    for (let i = 0; i < 100 && !state.requests.length; i++) await page.waitForTimeout(100);
    assert.ok(state.requests.length, 'Normal intent preparation must start');
    await select(specs[11]); await ready(specs[11]);
    state.checks.push({ name: 'active-triage-usable-with-held-preparation', passed: true }); await save();
    state.activationAt = Date.now(); await select(specs[3]);
    await page.getByTestId('pr-read-state').filter({ visible: true }).waitFor();
    state.checks.push({ name: 'held-detail-does-not-count-as-exact', passed: true });
    held = false; release(); await ready(specs[3]);
    assert.ok(state.requests.some((request) => request.at >= state.activationAt), 'Activation requires an authoritative request started after the gesture');
    state.checks.push({ name: 'post-activation-synthetic-authority', passed: true }); await save();
  } catch (error) { state.error = error.message.split('\n')[0]; await save(); throw error; }
  finally { held = false; release(); await page.unroute(`**${path}`, handler); state.cleanup = true; await save(); }
}
