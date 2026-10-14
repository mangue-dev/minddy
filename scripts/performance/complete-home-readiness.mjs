/** Full Home dependencies, rather than composer visibility alone. Runs in the renderer. */
export function completeHomeReady() {
  const visible = node => node.getClientRects().length && !node.closest('[inert], [aria-hidden="true"]') && getComputedStyle(node).visibility !== "hidden";
  if (location.pathname !== "/home" || ![...document.querySelectorAll('h1')].some(visible) ||
      ![...document.querySelectorAll('[contenteditable="true"][aria-placeholder*="Numo"]')].some(visible)) return false;
  let fiber = document.querySelector('[data-app-tab-id]');
  fiber = fiber?.[Object.keys(fiber).find(key => key.startsWith('__reactFiber$'))];
  let client;
  for (let depth = 0; fiber && depth < 100; depth++, fiber = fiber.return) {
    if (typeof fiber.memoizedProps?.client?.getQueryCache === 'function') { client = fiber.memoizedProps.client; break; }
  }
  return !!client && [['projects'], ['my-invitations'], ['me', 'triage-counts'], ['me', 'smart-assign-warnings']].every(key => {
    const state = client.getQueryState(key);
    return state?.status === 'success' && state.data !== undefined && !state.isInvalidated;
  }) && ![...document.querySelectorAll('[data-slot="skeleton"]')].some(visible);
}

/** Metadata only: distinguish missing UI from query readiness and lookup failures. */
export function completeHomeDiagnostics() {
  let fiber = document.querySelector('[data-app-tab-id]') ?? document.querySelector('h1');
  fiber = fiber?.[Object.keys(fiber).find(key => key.startsWith('__reactFiber$'))];
  let client;
  for (let depth = 0; fiber && depth < 100; depth++, fiber = fiber.return) {
    if (typeof fiber.memoizedProps?.client?.getQueryCache === 'function') { client = fiber.memoizedProps.client; break; }
  }
  return { pathname: location.pathname, width: innerWidth, height: innerHeight, readyState: document.readyState,
    tabCount: document.querySelectorAll('[data-app-tab-id]').length,
    headings: document.querySelectorAll('h1').length,
    composers: document.querySelectorAll('[contenteditable="true"][aria-placeholder*="Numo"]').length,
    clientFound: !!client, bridgePresent: !!window.minddy,
    queries: [['projects'], ['my-invitations'], ['me', 'triage-counts'], ['me', 'smart-assign-warnings']].map(key => {
      const state = client?.getQueryState(key);
      return { key, status: state?.status ?? 'missing', fetchStatus: state?.fetchStatus, invalidated: state?.isInvalidated,
        hasData: state?.data !== undefined, errorStatus: state?.error?.status ?? null };
    }) };
}
