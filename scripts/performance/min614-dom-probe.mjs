// Diagnostic clocks run inside the renderer; historical driver clocks stay intact.
export async function armDomProbe(page, spec) {
  await page.evaluate((spec) => {
    window.__min614.domProbe?.stop();
    const clock = () => performance.timeOrigin + performance.now();
    const result = { spec, armedAt: clock(), dispatchedAt: null, domAt: null, frameAt: null };
    let observer, frame;
    const visible = (node) => node?.checkVisibility() && !node.closest('[inert], [data-app-view-active="false"]');
    const check = () => {
      if (!result.dispatchedAt || result.frameAt) return;
      const root = [...document.querySelectorAll('[role="dialog"][data-state="open"]')].find(visible);
      if (!root || root.querySelector('textarea')?.value !== spec.title) return;
      const row = spec.id ? root.querySelector(`[data-comment-id="${spec.id}"]`) : null;
      let matches = false;
      if (spec.kind === 'menu') matches = [...document.querySelectorAll('[role="menu"]')].some(visible);
      if (spec.kind === 'editor') matches = visible(row?.querySelector('[role="textbox"][contenteditable="true"]'));
      if (spec.kind === 'editor-closed') matches = visible(row) && !row.querySelector('[role="textbox"][contenteditable="true"]') && row.textContent.includes(spec.text);
      if (spec.kind === 'comment-removed') matches = !row;
      if (spec.kind === 'comment') matches = [...root.querySelectorAll('[data-comment-id]')].some((node) => visible(node) && node.textContent.includes(spec.text));
      if (spec.kind === 'property') matches = [...root.querySelectorAll('button')].some((node) => node.getAttribute('aria-label') === spec.label && node.textContent.trim() === spec.text);
      if (!matches) return;
      result.domAt ??= clock();
      frame ??= requestAnimationFrame(() => { frame = null; result.frameAt = clock(); stop(); });
    };
    const dispatch = (event) => {
      if (!event.isTrusted || result.dispatchedAt) return;
      result.dispatchedAt = clock(); result.event = event.type; check();
    };
    const stop = () => {
      observer?.disconnect();
      document.removeEventListener('click', dispatch, true);
      document.removeEventListener('keydown', dispatch, true);
    };
    observer = new MutationObserver(check); observer.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    document.addEventListener('click', dispatch, true); document.addEventListener('keydown', dispatch, true);
    window.__min614.domProbe = { result, stop };
  }, spec);
}

export async function finishDomProbe(page) {
  return page.evaluate(() => {
    const probe = window.__min614.domProbe;
    if (!probe) return null;
    probe.stop(); const r = probe.result;
    return { ...r, dispatchToDomMs: r.domAt && r.dispatchedAt ? r.domAt - r.dispatchedAt : null,
      dispatchToFrameMs: r.frameAt && r.dispatchedAt ? r.frameAt - r.dispatchedAt : null,
      driverPreparationMs: r.dispatchedAt ? r.dispatchedAt - r.armedAt : null };
  });
}
