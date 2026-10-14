/** Serialized into the browser: full visible content, with usable controls. */
export function restoredDestinationReady(spec) {
  const visible = (node) => !!node?.getClientRects().length &&
    getComputedStyle(node).visibility !== "hidden" && !node.closest('[inert], [aria-hidden="true"]');
  const tab = document.querySelector(`[data-app-tab-id="${spec.id}"][aria-selected="true"]`);
  if (!visible(tab) || location.pathname !== new URL(spec.href, location.origin).pathname) return false;
  const loading = [...document.querySelectorAll(window.__restored.loadingSelector)].some(visible);
  if (loading) return false;
  if (["all", "board", "project", "global-board", "project-board"].includes(spec.kind)) {
    return window.__restored.boardReady(spec.cards, spec.kind !== "all" && spec.kind !== "global-board" ? spec.cardPrefix : undefined, spec.cardIds);
  }
  if (spec.kind === "page" || spec.kind === "pages") {
    const surface = [...document.querySelectorAll('[data-page-surface-id]')].find((node) => visible(node) && node.dataset.pageSurfaceId === spec.pageId);
    const editor = surface?.querySelector('.page-editor .tiptap[contenteditable="true"]');
    const title = [...surface?.querySelectorAll('h1, textarea') ?? []].find((node) => visible(node) && (node.value ?? node.textContent).trim() === spec.title);
    return !!title && visible(editor) && editor.querySelectorAll(':scope > h2').length === 8 &&
      editor.querySelectorAll(':scope > p').length === 72 && editor.textContent.includes(spec.bodyText) &&
      [...document.querySelectorAll('[data-sidebar-page-row] a[href]')].filter(visible).length === 20;
  }
  if (spec.kind === "home") return [...document.querySelectorAll('[contenteditable="true"][aria-placeholder*="Numo"]')].some(visible) &&
    [...document.querySelectorAll('h1')].some(visible);
  if (["pr", "pull-requests"].includes(spec.kind)) {
    const selected = document.querySelector(`[data-navigation-href="/pull-requests?pr=${spec.prId}"][aria-current="true"]`);
    const description = [...document.querySelectorAll('[data-testid="pr-description"]')].find(visible);
    const activity = [...document.querySelectorAll('[data-testid="pr-activity-timeline"], p')].some((node) => visible(node) &&
      (node.dataset.testid === "pr-activity-timeline" || node.textContent.trim() === "No comments yet."));
    const usable = (node) => {
      if (!visible(node) || node.disabled || node.getAttribute("aria-disabled") === "true") return false;
      const box = node.getBoundingClientRect();
      const left = Math.max(0, box.left), right = Math.min(innerWidth, box.right);
      const top = Math.max(0, box.top), bottom = Math.min(innerHeight, box.bottom);
      if (left >= right || top >= bottom) return false;
      const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
      return !!hit && (node === hit || node.contains(hit));
    };
    const navigation = [...document.querySelectorAll('[role="tab"]')].filter((node) => visible(node) &&
      /^(Description and activity|Changes)/.test(node.textContent.trim()));
    const composer = document.querySelector('[data-testid="pr-comment-composer-region"] .tiptap[contenteditable="true"]');
    const canComment = window.__restored.prPermissions?.[spec.prId] ?? spec.canComment;
    const permissionsReady = canComment === false || visible(composer);
    if (!visible(selected) || navigation.length !== 2 || !navigation.every(usable) ||
      ![...document.querySelectorAll('h1')].some((node) => visible(node) && node.textContent.trim() === spec.title)) return false;
    if (!spec.prSubview || spec.prSubview === "activity") return description?.textContent.includes("documentation-only draft") && activity && permissionsReady;
    const diff = [...document.querySelectorAll('[data-testid="pr-diff-view"]')].find(visible);
    const filesReady = diff && spec.files.every((path) => {
      const card = diff.querySelector(`[id="pr-file-${path}"]`);
      const expected = path.endsWith(".csv") ? "paint_opportunity_ms" : "Minddy pull request performance validation";
      return visible(card) && [...card.querySelectorAll("diffs-container")].some((node) => node.shadowRoot?.textContent.includes(expected));
    });
    if (!filesReady || !usable(document.querySelector('[data-testid="pr-commits-trigger"]'))) return false;
    if (spec.prSubview === "files") return true;
    if (spec.prSubview === "commits") {
      const popover = document.querySelector('[data-testid="pr-commits-popover"]');
      const entries = [...popover?.querySelectorAll('li[role="button"]') ?? []];
      return visible(popover) && entries.length === spec.commits && entries.every((entry) => visible(entry) && entry.textContent.trim());
    }
    return false;
  }
  const text = (value) => [...document.querySelectorAll('h1, h2, h3, p')].some((node) => visible(node) && node.textContent.trim() === value);
  const button = (value) => [...document.querySelectorAll('button')].some((node) => visible(node) && !node.disabled &&
    (node.textContent.includes(value) || node.getAttribute("aria-label") === value));
  const rows = (section) => [...document.querySelectorAll('[data-navigation-href]')].some((node) => visible(node) &&
    node.dataset.navigationHref.startsWith(section) && node.textContent.trim());
  if (spec.secondary) {
    if ([...document.querySelectorAll('[role="menu"]')].some(visible)) return false;
    const section = `/projects/${spec.projectId}/${spec.kind}?${spec.kind === "triage" ? "issue" : spec.kind === "feedback" ? "post" : "open"}=`;
    const list = [...document.querySelectorAll('[data-navigation-href]')].filter((node) => visible(node) && node.dataset.navigationHref.startsWith(section));
    const ids = list.map((node) => decodeURIComponent(node.dataset.navigationHref.slice(section.length)));
    if (!ids.length || new Set(ids).size !== ids.length || !ids.every((id) => spec.secondary.listIds.includes(id))) return false;
    let proof = { mode: "complete-dom-identities", sourceCount: spec.secondary.listIds.length, mountedRows: ids.length };
    if (ids.length !== spec.secondary.listIds.length) {
      // A windowed viewport is complete only when its real accepted query data
      // contains the entire expected collection and the UI publishes that count.
      let client = window.__restored.client;
      if (!client) {
        let fiber = tab[Object.keys(tab).find((key) => key.startsWith("__reactFiber$"))];
        for (let depth = 0; fiber && depth < 100; depth++, fiber = fiber.return) {
          if (typeof fiber.memoizedProps?.client?.getQueryCache === "function") { client = fiber.memoizedProps.client; break; }
        }
      }
      const key = spec.kind === "triage" ? "issues" : spec.kind;
      const queries = client?.getQueryCache().findAll({ queryKey: [key, spec.projectId] }) ?? [];
      const source = queries.find((query) => {
        if (query.state.status !== "success") return false;
        let rows = spec.kind === "feedback" ? query.state.data?.posts : query.state.data;
        if (!Array.isArray(rows)) return false;
        if (spec.kind === "triage") rows = rows.filter((row) => row.status === "triage");
        if (spec.kind === "objectives") rows = rows.filter((row) => ["planned", "in_progress"].includes(row.status));
        if (spec.kind === "feedback" && spec.secondary.listIds.length < spec.secondary.details.length) rows = rows.filter((row) => !["shipped", "declined", "spam"].includes(row.status));
        return rows.length === spec.secondary.listIds.length && new Set(rows.map((row) => row.id)).size === rows.length &&
          rows.every((row) => spec.secondary.listIds.includes(row.id));
      });
      const count = [...document.querySelectorAll('input[placeholder]')].some((node) => visible(node) && node.placeholder === spec.secondary.collectionPlaceholder);
      if (!source || !count) return false;
      proof = { ...proof, mode: "complete-accepted-query-source", queryStatus: source.state.status, dataUpdatedAt: source.state.dataUpdatedAt ?? null };
    }
    const selected = list.find((node) => node.getAttribute("aria-current") === "true");
    const selectedId = selected && decodeURIComponent(selected.dataset.navigationHref.slice(section.length));
    if (spec.detailId && selectedId !== spec.detailId) return false;
    const detail = spec.secondary.details.find((entry) => entry.id === selectedId);
    if (!detail || !selected.textContent.includes(detail.title)) return false;
    const title = [...document.querySelectorAll('textarea')].some((node) => visible(node) && !node.disabled && !node.readOnly && node.value.trim() === detail.title);
    const normalize = (value) => value.replace(/\s+/g, " ").trim();
    const editor = [...document.querySelectorAll('.tiptap[contenteditable="true"]')].some((node) => visible(node) && normalize(node.innerText ?? node.textContent).includes(detail.bodyText));
    const composer = [...document.querySelectorAll('[role="textbox"][contenteditable="true"][aria-placeholder]')].some(visible);
    const comments = detail.commentIds.every((id) => [...document.querySelectorAll('[data-comment-id]')].some((node) =>
      visible(node) && node.dataset.commentId === id && node.dataset.commentState === "confirmed" && node.textContent.trim() &&
      (!detail.comments || normalize(node.innerText ?? node.textContent).includes(detail.comments.find((comment) => comment.id === id)?.bodyText ?? "__missing_expected_comment__"))));
    if (!title || !editor || !composer || !comments) return false;
    (window.__restored.collectionProof ??= {})[spec.id] = proof;
    if (spec.kind === "triage") return button("Accept") && button("Decline");
    if (spec.kind === "feedback") return button("New feedback");
    if (spec.kind === "objectives") return button("New objective") &&
      [...document.querySelectorAll('a[href]')].some((node) => visible(node) &&
        node.getAttribute("href").includes(`objective=${detail.id}`) && node.textContent.trim() &&
        [...node.parentElement.querySelectorAll('span')].some((count) => visible(count) && count.textContent.trim() === `${detail.doneCount}/${detail.taskCount}`));
    return false;
  }
  if (spec.kind === "triage") return text("Nothing in triage") || rows(`/projects/${spec.projectId}/triage?issue=`);
  if (spec.kind === "feedback") return (text("No feedback yet") && button("New feedback")) || rows(`/projects/${spec.projectId}/feedback?post=`);
  if (spec.kind === "objectives") return (text("Set your first objectives") && button("New objective")) || rows(`/projects/${spec.projectId}/objectives?open=`);
  if (spec.kind === "routines") return (spec.emptyTitles.some(text) && button("Create your first routine")) || rows("/routines?routine=");
  return false;
}

export const RESTORED_LOADING_SELECTOR = '[data-slot="skeleton"], [role="status"][aria-label="Loading"], [data-board-loading-skeleton], [data-testid="pr-sidebar-loading"], [data-testid="pr-detail-loading-content"], [data-testid="pr-activity-skeleton"], [data-testid="pr-files-skeleton"]';
/** Read-only attribution at a fixed refresh age; cache presence grants no write authority. */
export function restoredPreparationMetadata(specs) {
  let client = window.__restored?.client;
  if (!client) {
    let fiber = document.querySelector('[data-app-tab-id]');
    fiber = fiber?.[Object.keys(fiber).find((key) => key.startsWith('__reactFiber$'))];
    for (let depth = 0; fiber && depth < 100; depth++, fiber = fiber.return) {
      if (typeof fiber.memoizedProps?.client?.getQueryCache === 'function') { client = fiber.memoizedProps.client; break; }
    }
  }
  const read = (key, exact = true) => {
    const queries = client?.getQueryCache().findAll({ queryKey: key, exact }) ?? [];
    return queries.length ? queries.map((query) => {
      const state = query.state, data = state.data;
      const collections = Array.isArray(data) ? { rows: data.length } : Object.fromEntries(Object.entries(data ?? {})
        .filter(([, value]) => Array.isArray(value)).map(([name, rows]) => [name, rows.length]));
      return { key: query.queryKey, status: state.status, invalidated: state.isInvalidated, fetchStatus: state.fetchStatus,
        hasData: data !== undefined, dataUpdatedAt: state.dataUpdatedAt, errorUpdatedAt: state.errorUpdatedAt,
        collections, observers: query.getObserversCount() };
    }) : [{ key, status: 'missing', invalidated: null, fetchStatus: null, hasData: false, collections: {} }];
  };
  const projectKeys = ['issues', 'categories', 'members', 'objectives', 'issue-relations', 'integrations', 'views'];
  const destinations = specs.map((spec) => {
    const keys = [], prefixKeys = [], params = new URL(spec.href, location.origin).searchParams;
    if (spec.kind === 'all') keys.push(['me', 'board'], ['views', 'global']);
    if (spec.kind === 'home') keys.push(['my-invitations']);
    if (spec.kind === 'routines') keys.push(['routines'], ['agent-models']);
    if (spec.kind === 'pr') { keys.push(['pull-request', spec.prId], ['pr-comments', spec.prId], ['pr-commits', spec.prId],
      ['pr-review-comments', `/api/pull-requests/${spec.prId}`]); prefixKeys.push(['pull-requests', 'all']); }
    if (spec.projectId) {
      const names = spec.kind === 'page' ? ['issues', 'members', 'objectives'] : spec.kind === 'feedback'
        ? ['issues', 'issue-relations', 'members', 'categories', 'objectives'] : spec.kind === 'objectives'
          ? ['issues', 'members', 'objectives', 'issue-relations'] : projectKeys;
      keys.push(...names.map((name) => [name, spec.projectId]));
      if (spec.kind !== 'board') keys.push(['pages', spec.projectId]);
    }
    let selectedDetailId = null;
    if (spec.kind === 'page') keys.push(['page', spec.pageId]);
    if (spec.kind === 'feedback') {
      prefixKeys.push(['feedback', spec.projectId]);
      const queries = client?.getQueryCache().findAll({ queryKey: ['feedback', spec.projectId] }) ?? [];
      const source = queries.find((query) => query.state.status === 'success' && Array.isArray(query.state.data?.posts));
      const rows = (source?.state.data.posts ?? []).filter((row) => !['shipped', 'declined', 'spam'].includes(row.status))
        .toSorted((a, b) => b.vote_count - a.vote_count || Date.parse(b.created_at) - Date.parse(a.created_at));
      selectedDetailId = params.get('post') ?? rows[0]?.id ?? null;
      if (selectedDetailId) keys.push(...['feedback-detail', 'feedback-comments', 'feedback-events'].map((name) => [name, spec.projectId, selectedDetailId]));
    }
    if (spec.kind === 'triage' || spec.kind === 'objectives') {
      const key = [spec.kind === 'triage' ? 'issues' : 'objectives', spec.projectId];
      const rows = client?.getQueryData(key);
      const visible = Array.isArray(rows) ? rows.filter((row) => spec.kind === 'triage' ? row.status === 'triage' : ['planned', 'in_progress'].includes(row.status)) : [];
      if (spec.kind === 'triage') visible.sort((a, b) => b.created_at.localeCompare(a.created_at));
      selectedDetailId = params.get(spec.kind === 'triage' ? 'issue' : 'open') ?? visible[0]?.id ?? null;
      if (selectedDetailId) keys.push(...(spec.kind === 'triage' ? ['comments', 'events'] : ['objective-comments', 'objective-events', 'objective-resources']).map((name) => [name, selectedDetailId]));
      if (spec.kind === 'objectives' && selectedDetailId) keys.push(['objective-feedback', spec.projectId, selectedDetailId, 'count']);
    }
    const body = spec.kind === 'page' ? client?.getQueryData(['page', spec.pageId]) : null;
    const surface = spec.kind === 'page' ? document.querySelector(`[data-page-surface-id="${spec.pageId}"]`) : null;
    const editor = surface?.querySelector('.tiptap[contenteditable="true"]');
    return { id: spec.id, kind: spec.kind, selectedDetailId, selectionBasis: 'Requested identity or actual accepted list default; no navigation performed',
      queries: [...keys.flatMap((key) => read(key)), ...prefixKeys.flatMap((key) => read(key, false))],
      ...(spec.kind === 'page' ? { page: { scopedIdentityMatches: body?.id === spec.pageId && body?.project_id === spec.projectId,
        version: body?.version ?? null, blocks: body?.content?.content?.length ?? 0, titleMatches: body?.title === spec.title,
        expectedBodyTextPresent: body ? JSON.stringify(body.content).includes(spec.bodyText) : false,
        mounted: !!surface, visibleEditableDOM: !!editor?.getClientRects().length && getComputedStyle(editor).visibility !== 'hidden' && !editor.closest('[inert], [aria-hidden="true"]'),
        readPhase: surface?.closest('[data-query-read-phase]')?.dataset.queryReadPhase ?? null,
        writeBasis: 'Not inferred from cache metadata' } } : {}) };
  });
  return { targetRefreshAgeMs: 3000, observedRefreshAgeMs: performance.now(), queryClientFound: !!client,
    selectedTabId: document.querySelector('[data-app-tab-id][aria-selected="true"]')?.dataset.appTabId ?? null,
    restoredTabCount: document.querySelectorAll('[data-app-tab-id]').length, destinations,
    interpretation: 'Metadata snapshot before the first activation; full usable-content gates and fresh write authority are measured separately' };
}

/** Retain source attribution without request headers, payloads or URL query values. */
export function restoredRequestInitiatorMetadata(event, origin) {
  const scopedPath = (value) => {
    try { const url = new URL(value); return url.origin === origin ? url.pathname : null; }
    catch { return null; }
  };
  const path = scopedPath(event.request?.url);
  if (!path) return null;
  const frames = [];
  let stack = event.initiator?.stack, depth = 0;
  while (stack && depth++ < 4 && frames.length < 40) {
    for (const frame of stack.callFrames ?? []) {
      const sourcePath = scopedPath(frame.url);
      if (!sourcePath || frames.length >= 40) continue;
      frames.push({ functionName: String(frame.functionName ?? "").slice(0, 160), path: sourcePath,
        lineNumber: frame.lineNumber, columnNumber: frame.columnNumber });
    }
    stack = stack.parent;
  }
  return { path, method: event.request.method, hasRscQuery: new URL(event.request.url).searchParams.has("_rsc"),
    type: event.type, timestamp: event.timestamp, wallTime: event.wallTime,
    initiatorType: event.initiator?.type ?? "unknown", initiatorPath: scopedPath(event.initiator?.url), frames,
    unresolvedAsyncParent: !!event.initiator?.stack?.parentId };
}

/** Timeout-only attribution; never export document bodies or comment prose. */
export function restoredFailureDiagnostics(spec) {
  const visible = (node) => !!node?.getClientRects().length && getComputedStyle(node).visibility !== "hidden" && !node.closest('[inert], [aria-hidden="true"]');
  const rect = (node) => { const box = node.getBoundingClientRect(); return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height }; };
  let client = window.__restored.client;
  if (!client) {
    let fiber = document.querySelector('[data-app-tab-id]');
    fiber = fiber?.[Object.keys(fiber).find((key) => key.startsWith('__reactFiber$'))];
    for (let depth = 0; fiber && depth < 100; depth++, fiber = fiber.return) {
      if (typeof fiber.memoizedProps?.client?.getQueryCache === 'function') { client = fiber.memoizedProps.client; break; }
    }
  }
  const active = [...document.querySelectorAll('[data-app-view-active="true"]')];
  const root = active[0], view = root?.getBoundingClientRect();
  const list = [...document.querySelectorAll('[data-navigation-href][aria-current="true"]')].filter(visible);
  const selectedId = spec.detailId ?? list.find((node) => node.dataset.navigationHref.startsWith(`${spec.href}?`))?.dataset.navigationHref.split('=').at(-1);
  const detail = spec.secondary?.details.find((entry) => entry.id === selectedId);
  const issueState = spec.projectId && client?.getQueryState(['issues', spec.projectId]);
  const issues = Array.isArray(issueState?.data) ? issueState.data : [];
  const source = { status: issueState?.status ?? 'missing', invalidated: issueState?.isInvalidated ?? null,
    fetchStatus: issueState?.fetchStatus ?? null, rows: issues.length,
    kanbanRows: issues.filter((row) => !['triage', 'duplicate'].includes(row.status)).length,
    selectedTasks: issues.filter((row) => row.objective_id === selectedId).map(({ id, status }) => ({ id, status })) };
  const links = [...document.querySelectorAll('a[href]')].filter((node) => node.getAttribute('href').includes(`objective=${selectedId}`)).map((node) => {
    const ancestors = []; let ancestor = node;
    for (let index = 0; ancestor && index < 5; index++, ancestor = ancestor.parentElement) ancestors.push({ tag: ancestor.tagName,
      inert: ancestor.inert, ariaHidden: ancestor.getAttribute('aria-hidden'), visibility: getComputedStyle(ancestor).visibility });
    return { href: node.getAttribute('href'), visible: visible(node), rect: rect(node), parentTag: node.parentElement?.tagName,
      adjacentRatios: [...node.parentElement.querySelectorAll('span')].map((span) => ({ text: span.textContent.trim(), visible: visible(span) }))
        .filter((span) => /^\d+\/\d+$/.test(span.text)), ancestors };
  });
  const scrollers = [...root?.querySelectorAll('[data-board-column-scroller]') ?? []].map((node) => {
    const box = node.getBoundingClientRect(), left = Math.max(box.left, view.left, 0), right = Math.min(box.right, view.right, innerWidth);
    const header = node.parentElement?.parentElement?.firstElementChild;
    const count = [...header?.children ?? []].find((child) => child.tagName === 'SPAN' && /^\d+$/.test(child.textContent.trim()));
    return { status: node.dataset.boardColumnStatus, count: count ? Number(count.textContent.trim()) : null,
      rect: rect(node), visible: visible(node), scrollTop: node.scrollTop, scrollHeight: node.scrollHeight,
      clippedWidth: right - left, hits: [20, 48, 76].map((offset) => {
        const x = (left + right) / 2, y = box.top + offset, hit = document.elementFromPoint(x, y), card = hit?.closest('[data-issue-id]');
        return { x, y, tag: hit?.tagName, role: hit?.getAttribute('role'), testId: hit?.dataset.testid,
          cardId: card?.dataset.issueId, rootContains: !!card && root.contains(card), hitIsCard: hit === card, inert: !!card?.closest('[inert]') };
      }) };
  });
  const normalize = (value) => value.replace(/\s+/g, ' ').trim();
  return { pathname: location.pathname, expectedTabId: spec.id, selectedTabId: document.querySelector('[data-app-tab-id][aria-selected="true"]')?.dataset.appTabId,
    activeRoots: active.map((node) => ({ key: node.dataset.retainedAppView, visible: visible(node), inert: node.inert, boardReadState: node.dataset.boardReadState, rect: rect(node) })),
    selectedRows: list.map((node) => node.dataset.navigationHref), selectedDetailId: selectedId ?? null, source,
    newObjectiveButtons: [...document.querySelectorAll('button')].filter((node) => node.textContent.includes('New objective') || node.getAttribute('aria-label') === 'New objective')
      .map((node) => ({ visible: visible(node), disabled: node.disabled, ariaDisabled: node.getAttribute('aria-disabled'), rect: rect(node) })),
    links, ...(detail ? { expected: { title: detail.title, taskCount: detail.taskCount, doneCount: detail.doneCount },
      titleReady: [...document.querySelectorAll('textarea')].some((node) => visible(node) && !node.disabled && !node.readOnly && node.value.trim() === detail.title),
      editorReady: [...document.querySelectorAll('.tiptap[contenteditable="true"]')].some((node) => visible(node) && normalize(node.innerText ?? node.textContent).includes(detail.bodyText)),
      commentsReady: detail.commentIds.every((id) => [...document.querySelectorAll('[data-comment-id]')].some((node) => visible(node) && node.dataset.commentId === id && node.dataset.commentState === 'confirmed')) } : {}),
    board: { expectedCards: spec.cards ?? null, cards: root?.querySelectorAll('[data-issue-id]').length ?? 0, scrollers },
    visibleLoadingCount: [...document.querySelectorAll(window.__restored.loadingSelector)].filter(visible).length };
}
