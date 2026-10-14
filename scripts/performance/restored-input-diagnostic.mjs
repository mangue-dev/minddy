/** Serialized browser-only diagnostic. It never reads text, bodies or credentials. */
export function installRestoredInputDiagnostic({ owner, tabIds, wrapActivate = false }) {
  if (window.__restoredInput) return;
  const allowed = new Set(tabIds);
  const events = [];
  let dropped = 0, activation = 0, current = null, session = null, unsubscribe, originalActivate, wrappedActivate;
  const tabId = (value) => allowed.has(value) ? value : value == null ? null : "outside-fixture";
  const descriptor = (node) => node?.nodeType === 1 ? { tag: node.tagName.toLowerCase(), role: node.getAttribute("role"),
    closestTabId: tabId(node.closest("[data-app-tab-id]")?.getAttribute("data-app-tab-id")),
    disabled: !!node.disabled, ariaDisabled: node.getAttribute("aria-disabled"), ariaBusy: node.getAttribute("aria-busy"),
    inert: !!node.closest('[inert], [aria-hidden="true"]'), pointerEvents: getComputedStyle(node).pointerEvents,
    reactHandlers: (() => {
      const props = node[Object.keys(node).find((key) => key.startsWith("__reactProps$"))];
      return { onClick: typeof props?.onClick === "function", onPointerDown: typeof props?.onPointerDown === "function",
        onMouseDown: typeof props?.onMouseDown === "function" };
    })() } : null;
  const record = (kind, data, eventActivation = activation) => {
    if (events.length < 8192) events.push({ ...data, kind, activation: eventActivation, at: performance.now(), wallClock: Date.now() });
    else dropped++;
  };
  const sessionState = () => {
    if (!session) return { found: false };
    const state = session.getSnapshot();
    return { found: true, activeId: tabId(state.activeId), busy: state.busy, recovering: state.recovering,
      errorCode: state.error == null ? null : /^[a-z_]{1,64}$/.test(state.error) ? state.error : "non-code-error",
      tabCount: state.tabs.length, guardCount: session.guards instanceof Set ? session.guards.size : null,
      ownerMatches: session.owner === owner, disposed: typeof session.disposed === "boolean" ? session.disposed : null,
      activeHrefPath: typeof session.getActiveHref === "function" && session.getActiveHref() ? new URL(session.getActiveHref(), location.origin).pathname : null,
      targetPath: typeof session.target === "string" ? new URL(session.target, location.origin).pathname : null };
  };
  const domState = () => ({ pathname: location.pathname, focused: document.hasFocus(), visibility: document.visibilityState,
    selectedTabId: tabId(document.querySelector('[data-app-tab-id][aria-selected="true"]')?.getAttribute("data-app-tab-id")),
    busyTablists: [...document.querySelectorAll('[role="tablist"][aria-busy="true"]')].length,
    bodyPointerEvents: getComputedStyle(document.body).pointerEvents,
    visiblePortals: [...document.querySelectorAll('[role="menu"], [role="dialog"], [data-radix-popper-content-wrapper]')]
      .filter((node) => node.getClientRects().length && getComputedStyle(node).visibility !== "hidden" && !node.closest('[inert], [aria-hidden="true"]')).slice(0, 12).map(descriptor),
    visibleEditors: [...document.querySelectorAll('[contenteditable="true"], textarea')].filter((node) => node.getClientRects().length && !node.closest('[inert], [aria-hidden="true"]')).length,
    visibleReadPhases: [...document.querySelectorAll('[data-query-read-phase]')].filter((node) => node.getClientRects().length && !node.closest('[inert], [aria-hidden="true"]')).map((node) => node.getAttribute("data-query-read-phase")),
    session: sessionState() });
  const candidateSession = (value) => {
    const candidate = typeof value?.getSnapshot === "function" ? value : value?.session;
    if (!candidate || typeof candidate.activate !== "function" || typeof candidate.subscribe !== "function" || typeof candidate.registerDeparture !== "function") return null;
    const state = candidate.getSnapshot();
    return candidate.owner === owner && candidate.disposed !== true && Array.isArray(state?.tabs) && state.tabs.length === allowed.size &&
      state.tabs.every((tab) => allowed.has(tab.id) && tab.user_id === owner) ? candidate : null;
  };
  const attach = () => {
    if (session?.disposed === true) {
      record("session-observation-lost", { reason: "disposed", state: sessionState() });
      unsubscribe?.();
      if (wrappedActivate && session.activate === wrappedActivate) session.activate = originalActivate;
      session = null; unsubscribe = undefined; originalActivate = undefined; wrappedActivate = undefined;
    }
    if (session) return;
    const tab = document.querySelector("[data-app-tab-id]");
    let fiber = tab?.[Object.keys(tab).find((key) => key.startsWith("__reactFiber$"))];
    for (let depth = 0; fiber && depth < 100; depth++, fiber = fiber.return) {
      const props = fiber.memoizedProps;
      const values = [props?.value, props?.session];
      let hook = fiber.memoizedState;
      for (let count = 0; hook && count < 64; count++, hook = hook.next) values.push(hook.memoizedState, hook.memoizedState?.current);
      for (const value of values) {
        try { session = candidateSession(value); } catch { /* A foreign Fiber value is not a session. */ }
        if (session) break;
      }
      if (session) break;
    }
    if (!session) return;
    record("session-attached", { state: sessionState(), activationWrapped: wrapActivate });
    unsubscribe = session.subscribe(() => record("session-transition", { state: domState() }));
    if (wrapActivate) {
      originalActivate = session.activate;
      wrappedActivate = function (...args) {
        const operationActivation = activation, requestedTabId = tabId(args[0]);
        record("session-activate-call", { requestedTabId, state: sessionState() }, operationActivation);
        let returned;
        try { returned = originalActivate.call(this, ...args); }
        catch (error) { record("session-activate-throw", { requestedTabId, errorType: error?.name ?? "unknown", state: sessionState() }, operationActivation); throw error; }
        if (returned && typeof returned.then === "function") returned.then(
          () => record("session-activate-settled", { requestedTabId, fulfilled: true, state: sessionState() }, operationActivation),
          () => record("session-activate-settled", { requestedTabId, fulfilled: false, state: sessionState() }, operationActivation));
        return returned;
      };
      session.activate = wrappedActivate;
    }
  };
  const listeners = [];
  const lifecycle = (event) => record("focus-lifecycle", { type: event.type, trusted: event.isTrusted, state: domState() });
  document.addEventListener("visibilitychange", lifecycle);
  window.addEventListener("blur", lifecycle);
  window.addEventListener("focus", lifecycle);
  for (const type of ["pointerdown", "pointerup", "pointermove", "mousedown", "mouseup", "mousemove", "click"]) {
    const listener = (event) => {
      if (!current) return;
      const eventActivation = activation;
      record("input-event", { type, trusted: event.isTrusted, x: event.clientX, y: event.clientY,
        target: descriptor(event.target), path: event.composedPath().slice(0, 10).map(descriptor).filter(Boolean),
        phase: "capture", defaultPrevented: event.defaultPrevented, state: domState() });
      setTimeout(() => record("after-input-task", { type, defaultPreventedAfterDispatch: event.defaultPrevented, state: domState() }, eventActivation), 0);
    };
    const bubble = (event) => {
      if (!current) return;
      record("input-event", { type, trusted: event.isTrusted, phase: "bubble", defaultPrevented: event.defaultPrevented,
        target: descriptor(event.target), state: domState() });
    };
    document.addEventListener(type, listener, true);
    document.addEventListener(type, bubble, false);
    listeners.push([type, listener, true], [type, bubble, false]);
  }
  const rect = (node) => {
    const box = node?.getBoundingClientRect();
    return box ? { x: box.x, y: box.y, width: box.width, height: box.height, left: box.left, top: box.top, right: box.right, bottom: box.bottom } : null;
  };
  window.__restoredInput = {
    arm(input) {
      activation++; current = { activation, firstEventIndex: events.length }; attach();
      const target = [...document.querySelectorAll("[data-app-tab-id]")].find((node) => node.getAttribute("data-app-tab-id") === input.expectedTabId);
      const hit = document.elementFromPoint(input.x, input.y);
      const before = { expectedTabId: tabId(input.expectedTabId), kind: input.kind, name: input.name, x: input.x, y: input.y,
        driverRect: input.driverRect, activation, expectedTab: descriptor(target), freshExpectedRect: rect(target),
        hit: descriptor(hit), hitRect: rect(hit), expectedContainsHit: !!target && !!hit && (target === hit || target.contains(hit)),
        enclosingTablist: descriptor(target?.closest('[role="tablist"]')), state: domState() };
      record("before-dispatch", before);
      return before;
    },
    read() { return { activation, droppedEvents: dropped, events: events.slice(current?.firstEventIndex ?? 0), state: domState() }; },
    dispose() {
      unsubscribe?.();
      if (session && wrappedActivate && session.activate === wrappedActivate) session.activate = originalActivate;
      for (const [type, listener, capture] of listeners) document.removeEventListener(type, listener, capture);
      document.removeEventListener("visibilitychange", lifecycle);
      window.removeEventListener("blur", lifecycle);
      window.removeEventListener("focus", lifecycle);
      current = null;
    },
  };
}
