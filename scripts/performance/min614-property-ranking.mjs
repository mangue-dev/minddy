// Menu/editor costs only. These do not imply that a property persisted successfully.
export async function rankProperties({ page, panel, measure, state, save }) {
  state.propertyInventory = await panel().locator('button[aria-label]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label')));
  for (const label of ['Change status', 'Change priority', 'Change effort', 'Change assignee', 'Edit categories', 'Change due date', 'Change objective']) {
    for (let run = 0; run < 10; run++) {
      await measure(`property-picker-${label.toLowerCase().replaceAll(' ', '-')}-${run}`, () => panel().getByRole('button', { name: label, exact: true }).click(),
        () => page.locator('[role="listbox"]:visible, [data-slot="popover-content"]:visible').first().waitFor());
      await page.keyboard.press('Escape');
    }
  }
  for (let run = 0; run < 10; run++) {
    await measure(`description-focus-${run}`, () => panel().locator('.tiptap').first().click(),
      () => page.waitForFunction(() => Boolean(document.activeElement?.closest('[role="dialog"] .tiptap'))));
    await panel().getByRole('button', { name: 'Change effort', exact: true }).focus();
  }
  await panel().getByRole('tab', { name: /^Plan/ }).click();
  for (let run = 0; run < 10; run++) {
    const edit = panel().getByRole('button', { name: /^(Edit the plan|Add a plan)$/ });
    await measure(`plan-editor-${run}`, () => edit.click(), () => panel().locator('textarea[placeholder]').last().waitFor());
    await panel().getByRole('button', { name: 'Cancel', exact: true }).click();
  }
  await panel().getByRole('tab', { name: 'Description', exact: true }).click();
  state.checks.push('Seven property pickers, description focus and the populated Plan editor: ten observations each. The inventory records empty objective/attachment/live-workflow data separately. Picker/editor latency is separate from mutation persistence; effort has its explicit persisted-value series.');
  await save();
}
