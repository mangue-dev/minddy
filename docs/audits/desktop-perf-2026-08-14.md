# Performance audit — minddy desktop app (Electron 43 / macOS)

## 1. The diagnosis, in three lines

The desktop app pays a tax that the browser does not pay: `app/globals.css:1711` places `-webkit-app-region: no-drag` on **all** the focusable elements of the document (`a, button, input, …, [role="option"], [tabindex]`), which transforms each button, each menu item and each list line into an **annotated region** that Blink collects and sends back by IPC to the browser process — the same one that populates macOS mouse events.
Two aggravators are connected to it: the two `drag` sockets placed on elements whose framer-motion **animate the geometry** (`.sidebar-brand-row` and `.app-shell > div > header`, globals.css:1739 and 1782), therefore a map of regions reconstructed at each frame of the unfolding of the rail — and 20 Radix dropdowns left in `modal` by default, which write `body.style.pointerEvents = "none"` (**inherited** property) each time it opens and closes, i.e. a style recalculation of the entire document on the menu animation frame.
The rest (non-memorized maps, non-memorized contexts, backdrop-filters) is real but it is **cost per rendering**, not per frame: they are amplifiers, not the source.

**What is not decided, and how to decide it.** The existence of the rules is certain (read above). The *cost* of Blink's annotated region model is an inference: nothing in this repository has measured it, and the comment from globals.css:1704 instead states "The cost is zero" — which is precisely the assumption to break. The manipulation is in §5; the litmus test takes 30 seconds: **open the same board in Chrome and in the desktop app.** If Chrome is fluid, everything that is not `data-desktop-app` is exonerated and the order in §3 is the correct one. If Chrome jerks so much, the thesis falls and you have to switch to level (b) — memorization of the board.

---

## 2. The causes, by expected gain

### CERTAIN — read in the code, indisputable mechanism

#### C1. The 20 modal dropdowns write `pointer-events` to `<body>` on each open *and* close
`components/new-menu.tsx:80`, `components/app-sidebar.tsx:437`, `components/app-breadcrumb.tsx:69`, `components/board-toolbar.tsx:919` and `:962`, `components/objective-detail.tsx:450`, `components/resources.tsx:178`, `components/project-card.tsx:116`, `components/cycle/cycle-header.tsx:88`, `components/issue-plan.tsx:268`, `components/pages/block-menu.tsx:216`, `components/pages/page-breadcrumb.tsx:103`, `components/routines/routine-detail.tsx:427`, `components/agents/session-compose.tsx:71`, `components/mobile-nav-actions.tsx:41`, `components/git/provider-connect-buttons.tsx:157`, `components/feedback/feedback-team-page.tsx:1597`.

`DropdownMenu` of mango-ui does not force anything (`node_modules/mangue-ui/src/components/ui/dropdown-menu.tsx:21-25`: pass-through), so Radix applies its default `modal={true}`. In this mode, `DismissableLayer` executes `ownerDocument.body.style.pointerEvents = "none"` (`@radix-ui/react-dismissable-layer/dist/index.mjs:111`, restored l.121) and `RemoveScroll` injects `body{overflow:hidden;padding-right:Npx}`. `pointer-events` is **inherited**: setting it to `<body>` invalidates the calculated style of each node in the document, and `padding-right` forces a complete relayout — twice per menu open.

**Symptom**: dropdown burst, literally. It falls during the ~100ms of `zoom-in-95`, so we *see* it on the panel that appears.

The repository already knows how to do this: `components/issue-context-menu.tsx:294`, `components/plan-task-row.tsx:76`, `components/issue-timeline.tsx:571` and the three of `pull-requests/pr-detail.tsx` pass `modal={false}`. Fix: reverse the default **in mangue-ui**, not in a local copy.

```tsx
// node_modules/mangue-ui/src/components/ui/dropdown-menu.tsx:21
function DropdownMenu({
  modal = false,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" modal={modal} {...props} />
}
```

Only side effect: the background remains scrollable open menu - which Radix closes anyway at the first external scroll.

#### C2. The two `drag` sockets are placed on rectangles that framer-motion animates
`app/globals.css:1739-1741` (`.app-shell > div > header`) and `:1782-1787` (`.sidebar-brand-row`).

`.sidebar-brand-row` is a child of `motion.aside` whose framer animates the width 56 → 256 px (`components/app-sidebar.tsx:810-815`), triggered by `onPointerMove` (`:822`). Its rectangle therefore changes at each frame of the animation, the vector of regions differs at each frame, and Electron reconstructs the movable region of the window on the browser process side. On ProMotion: ~38 reconstructions for a simple flight over the rail.

**Symptom**: Cursor jerkiness, and the fact that it is felt *on hover* rather than on click — the gesture that causes the cost is the mouse movement itself.

These two sockets are **redundant** with `.desktop-drag-band` (`globals.css:1682-1694`), which is `position: fixed; inset: 0 0 auto 0; height: 60px` and already covers exactly the mark line and the first 60 pixels of the header, with a rectangle that never moves.

```diff
-/* app/globals.css:1739 */
-html[data-desktop-app] .app-shell > div > header {
-  -webkit-app-region: drag;
-}

 html[data-desktop-app] .sidebar-brand-row {
   container-type: inline-size;
-  -webkit-app-region: drag;
 }
```

Keep `container-type: inline-size`: it is he who carries the dragging of the mark (`100cqw`, globals.css:1789).

#### C3. `applyWindowButtons` unconditionally rests the native buttons, on each hover of the rail
`desktop/src/main.ts:59-84`. No comparison: `setWindowButtonVisibility` then `setWindowButtonPosition(TRAFFIC_LIGHTS)` on each call, and Electron responds to each with a `RedrawTrafficLights()` — from the synchronous AppKit on the UI thread of the browser process. However, `useHoldWindowButtons("rail", …)` (`components/app-sidebar.tsx:780`) switches each time the rail is unfolded/folded, therefore each time the sidebar is hovered, and `useHoldWindowButtons("modal", …)` each time a dialog, palette or drawer is opened *and* closed.

The renderer intentionally refuses to deduplicate (`lib/use-window-buttons.ts:50-55`) because `useWindowButtonsSlot` needs the response from the bridge to unfreeze its layout. Deduplication must therefore live in the main, **on native calls only**:

```ts
/** What was actually applied to the window, so it is not applied again. */
let appliedButtons: string | null = null;

function applyWindowButtons(target?: BrowserWindow): void {
  const window = target ?? mainWindow;
  if (process.platform !== "darwin" || !window) return;
  const fullScreen = window.isFullScreen();
  const key = `${fullScreen}:${wantsWindowButtons}`;
  if (key !== appliedButtons) {
    appliedButtons = key;
    window.setWindowButtonVisibility(fullScreen || wantsWindowButtons);
    if (!fullScreen && wantsWindowButtons) window.setWindowButtonPosition(TRAFFIC_LIGHTS);
  }
  // ALWAYS republish: this is the response useWindowButtonsSlot is waiting for.
  publishWindowButtons(wantsWindowButtons && !fullScreen);
}
```

Put `appliedButtons = null` back into the `did-start-navigation` handler (`main.ts:303`): a new document starts from scratch.

#### C4. A `MutationObserver` `childList + subtree` on `<body>` runs everywhere, including outside the desktop app
`lib/use-window-buttons.ts:180-185`. It is indeed **unique** (singleton of module l.158) and its callback is coalesced to a frame (l.173-179) — the observation which spoke of “two observers” and “burst” was false. What remains true and non-trivial: Chromium allocates a `MutationRecord` with its `StaticNodeList` for **each** node inserted or removed anywhere (react-window recycling, tiptap hitting, agent thread streaming, framer mounts), and at each mutating frame the callback executes `document.querySelector(MODAL_SELECTOR)` — 7 compound selectors (l.136-144) which, in the dominant case, do not match anything and therefore cross the entire tree.

This path is **not** desktop specific: `DesktopWindowButtons` is mounted unconditionally (`app/(app)/app-providers.tsx:99`) and returns `null` out of shell. This is therefore a candidate that the Chrome/desktop test exonerates or charges on its own.

Fix: two **distinct** observers (the documented trap l.152-154 only applies to two `observe()` of the *same* observer), and a bridge guard.

```ts
if (!getDesktopBridge()) return () => {};   // nothing to observe in a browser

// Attributes everywhere: coverage UNCHANGED. An attributes-only observation
// allocates NO record for node insertions — all the cost was there.
attrObserver = new MutationObserver(schedule);
attrObserver.observe(document.body, {
  subtree: true, attributes: true,
  attributeFilter: ["data-slot", "data-state", "aria-modal"],
});

// Portal arrival: DIRECT children of <body>, without a subtree.
childObserver = new MutationObserver(schedule);
childObserver.observe(document.body, { childList: true });
```

To then check on the four surfaces that MIN-291 says he noted (⌘K palette, notebook, drawer, wizard): if one is not made a direct child of `<body>`, keep `childList` in `subtree` for it and simply lighten `readModalOpen`.

#### C5. The horizontal scroll of the board re-renders the entire board, for invisible pellets above 640 px
`components/kanban-board.tsx:253-267` and `:365-369`. `updateActiveColumn` calls `setActiveColumn(idx)` — a state of `KanbanBoard` — each time a column threshold is crossed. No card is memorized: each crossing replays N cards. Its only consumer is `<ColumnDots>`, marked `sm:hidden` (`:467`). On desktop, this work is entirely wasted. The immediate neighbor (`scrollProps.onScroll`, `lib/use-scroll-fade.ts:81-87`) has already been fixed for exactly this reason, with the comment saying that it "blew up the whole interface".

Note: `components/global-kanban-board.tsx:371` does not have this default.

```tsx
const updateActiveColumn = useCallback((el: HTMLDivElement) => {
  // The dots are `sm:hidden`: above 640 px there is nothing to show,
  // and above all nothing to STATE — setActiveColumn re-renders the entire board.
  if (window.innerWidth >= 640) {
    setActiveColumn((prev) => (prev === 0 ? prev : 0));
    return;
  }
  …
}, [columnCount]);
```

#### C6. Three contexts render an object literal, including the top of the tree
`lib/auth-context.tsx:379-398`, `lib/projects-context.tsx:61-73` (with an inline `openCreateProject` arrow l.64-67), `lib/create-context.tsx:329-331`, plus `lib/use-projects-query.ts:72-80`.

`AuthProvider` is the highest provider (`app/(app)/app-providers.tsx`), and its handler `onAuthStateChange` (l.127-133) does `setSession(s)` + `setUser(…)` **without comparison**: supabase-js re-issues `SIGNED_IN`/`TOKEN_REFRESHED` when returning to the foreground and each time the token is refreshed, always with new objects. The cascade is verifiable end-to-end: `use-projects-query.ts:33` consumes `useAuth` → `ProjectsProvider` re-renders → `create-context.tsx:118-119` → `global-board.tsx:88-89` → all cards.

**Symptom**: the startle when returning to the window — the most frequent gesture in an office shell.

```ts
// lib/auth-context.tsx:132
setSession((prev) => (prev?.access_token === s?.access_token ? prev : s));
```
and a `useMemo` on the three values. On `projects-context.tsx`, first stabilize `openCreateProject` in `useCallback`: its identity is in the dependencies of `commandGroups` (`components/app-shell-chrome.tsx:956`) **and** of `sections` (`:1420`), therefore of `paletteGroups` (`:1434`) — the trap that `components/mobile-account.tsx:54-56` documents verbatim. Do not touch the bail-out of `user`: `refreshUser`/`updateUserMetadata` rely on it to propagate metadata.

#### C7. Persistence filter targets a key that does not exist
`lib/query-provider.tsx:89` lists `["agent-activity"]`, while the key actually placed is `["agent-active-issues", projectId ?? "__global__"]` (`components/agent/agent-activity-context.tsx:68`). The 15 s poll (`:72-73`) is therefore **serialized on disk** on each tick, while the file header (l.77-80) asserts that "the prefixes below are the REAL keys". `lib/query-persist.test.ts:31` locks the non-existent key: it passes and proves nothing.

```diff
-  ["agent-activity"],
+  ["agent-active-issues"], // components/agent/agent-activity-context.tsx:68
```

Correct the test in the same gesture.

---

### PROBABLE — inferred mechanism, to be confirmed by profile

#### P1. Global `no-drag` digging — suspect #1
`app/globals.css:1711-1732`. The rule is certain and its perimeter too: it literally marks everything that clicks. Each row of the palette is both `role="option"` **and** `tabIndex` (`lib/command-palette/components/ResultItem.tsx:98-101`), each Radix menu and select item is, each mango-ui button is. On a non-virtualized board (react-window is only used **by `lib/command-palette/components/ResultsList.tsx:14`), there are several hundred to several thousand rectangles.

What is inferred, and therefore to be measured: that `LocalFrameView::UpdateDocumentAnnotatedRegions()` retraces the layout tree at the end of each layout, calls `AbsoluteBoundingBoxRect()` on each marked element, compares the vector to the previous one and sends it in IPC to the browser process which reconstructs one `SkRegion` on its UI thread. If this model is correct, it is the only flaw in this entire audit that explains the **three** symptoms together *and* explains why they are only seen in the shell.

The fix does not consist of shortening the list but of changing the model: **the regions are geometric**, a `no-drag` placed on a container digs everything that this container covers. Marking the sheets was never necessary.

```css
/* The elements that actually occupy the 60 px band. */
html[data-desktop-app] :is(.app-shell > div > header, .sidebar-brand-row)
  :is(a, button, input, select, textarea, [role="button"], [tabindex]) {
  -webkit-app-region: no-drag;
}

/* Floating surfaces: ONE rectangle each, on its root. They
   cover their own controls, so their descendants declare nothing. */
html[data-desktop-app] :is(
    [data-radix-popper-content-wrapper],
    [data-slot="dialog-content"],
    [data-slot="alert-dialog-content"],
    [data-slot="sheet-content"],
    [data-slot="drawer-content"],
    [data-slot="side-panel-content"],
    [cmdk-root],
    [data-sonner-toaster]
  ) {
  -webkit-app-region: no-drag;
}
```

We go from a few thousand rectangles to around ten. Then check screen by screen — this is the only thing that the global rule really guaranteed: that no control of the first 60 pixels is swallowed by the tape. Anything that lives under 60 px never needed to be dug.

#### P2. The board replays everything, with each rendition — the amplifier
`components/issue-card.tsx` is 1483 lines, `memo` is not imported anywhere (l.3), neither for `IssueCard` (l.876) nor for `IssueCardBody` (l.640) nor for the columns. Each card runs ~15 hooks (six `useTranslations`, `useAuth` l.946, `useSortable` l.948, three agent contexts, `usePlanGates` l.954 = 2 react-query observers, `useProjectGitLinkQuery` l.958, `useAttachmentUploads`, `useFileDrop`…). Three positions are added, all **closed menu content**:

- `components/agent/use-agent-menu-actions.tsx:216-231`: nine callbacks in dependencies, all made inline in `issue-card.tsx:1202-1215` — the `useMemo` therefore **never** falls correctly, and remanufactures ~20 action objects, ~16 JSX icons and a dozen `t(...)` per card and per rendering.
- `components/issue-card.tsx:709`: `plainPreview(issue.description)` without memo, 8 regex (including `/```[\s\S]*?```/g` unanchored, `/^\s{0,3}#{1,6}\s+/gm`, `/^\s*[-*+]\s+/gm`, l.127-138) on the **entire** description, while the rendering is `line-clamp-3`.
- The five pickers (`:166`, `:206`, `:254`, `:360`, `:423`) rebuild their options tables with one JSX `icon` per entry, on new sources themselves (`:823` `members={[...memberMap.values()]}`, `:847` same categories).

None of this is a per-frame source — it's what turns **a** provider rendering or **a** scroll threshold crossing into a long frame. To be corrected **after** C5 and C6, otherwise `memo` will not bite: `IssueCard` remains subscribed to `useAuth` and the three agent contexts, which pass through `memo` without seeing it.

```tsx
const description = useMemo(
  () => (issue.description ? plainPreview(issue.description.slice(0, 400)) : ""),
  [issue.description]
);
```

And check what `useAgentActive` / `useAgentHasSession` / `useIssuePr` publishes: if one exposes an unremembered value, it cancels `memo` on all cards at each agent event. These three contexts were not opened by this audit.

#### P3. The side panel veil blurs the viewport while reading a ticket
`node_modules/mangue-ui/src/components/ui/side-panel.tsx:93`: `fixed inset-0 isolate z-50 bg-black/10 supports-backdrop-filter:backdrop-blur-xs`. Edited by `components/issue-side-panel.tsx:755` — the most frequent gesture of the product. Same pattern in `dialog.tsx:89`, `sheet.tsx:40`, `alert-dialog.tsx:61`. mangue-ui 0.5.1 resolves its exports to `./src`, so it is these classes that go into production.

Two nuances to keep in mind, which prevent it from being ranked high: the veil blocks hovering behind it (the most frequent source of repaint disappears), and the content of the panel is painted **above** the veil (typing in the description does not re-trigger the filter). What really stands out: the real-time updates and framer animations of the board.

Neutralize in one block, **out of all `@layer`** — in Tailwind v4 the utilities are in `@layer utilities`, a non-layered rule beats them whatever the specificity:

```css
/* app/globals.css, outside @layer: a full-viewport blur for 10% black over
   an already solid background is not visible, and costs an intermediate surface on each
   repaint of the board behind it. */
[data-slot$="-overlay"] { backdrop-filter: none !important; }
```

Then check by eye that `bg-black/10` still separates sufficiently into a clear theme; going up to `bg-black/20` costs zero frames where blurring costs each repaint.

#### P4. The palette actions popover enters a forced layout loop at each arrow
`lib/command-palette/components/ActionsPopover.tsx:121-131`: `getBoundingClientRect()` then `setPosition({ top, left })` — new object, therefore never bail-out — subscribed in `window.addEventListener("scroll", updatePosition, true)` (l.135). The trigger is not the page scroll (the anchor is `styles.searchView`, in the fixed modal of the palette) but **internal**: `:189-196` calls `scrollIntoView({ behavior: "smooth" })` at each index change, an animated scroll which emits ~60 events/s, all captured in capture. Each arrow pressed in the dropdown therefore opens a forced layout loop for ~300 ms.

The minimal and exact fix is ​​to **remove** the listener, not throttle it:

```tsx
// ActionsPopover.tsx:133-140 — the anchor is inside the palette's fixed modal:
// it does not move with page scrolling. The only scroll that reached this
// listener was the animated scrollIntoView at l.189-196.
updatePosition();
window.addEventListener("resize", updatePosition);
return () => window.removeEventListener("resize", updatePosition);
```

And keep an identity bail-out for the resize: `setPosition((prev) => prev && prev.top === top && prev.left === left ? prev : { top, left })`.

#### P5. The persistence of the react-query cache, to measure before touching
`lib/query-provider.tsx:144-149`. The string is checked in the libs: `persist.js:53-58` reacts to `added`/`removed`/`updated`, calls `persistQueryClientSave` which executes `dehydrate` **without** throttle, then `persistClient` — only throttled — whose body is `JSON.stringify` + `localStorage.setItem`, synchronous on the main thread. `gcTime` is at 24 h (l.45), so nothing comes out of the cache.

Three corrections to the original observation: the throttle is at **trailing** front, so the writing does not fall “right during the opening animation” of a menu — it is a periodic jerk, uncorrelated with the gesture; the cost is not in `dehydrate` (which does not clone anything); and the "5-20 ms" is an estimate, not a reading. **There is no reason to touch this file before measuring** `localStorage.getItem("minddy.query-cache").length` on a real board. Under ~100 KB, there is nothing to fix here — except C7, which is a filter bug, not a performance arbitration.

If the measure justifies the gesture: envelope `requestIdleCallback` + throttle 10 s, **with a dump on `pagehide` and on `visibilitychange`** — without which a reload throws up to 10 s of pending writes, while persistence only exists for reloading (MIN-89).

#### P6. The spell checker is never cut off, and its suggestions are unattainable
`desktop/src/main.ts:264-276`: The `webPreferences` block lists `contextIsolation`, `nodeIntegration`, `sandbox`, `webviewTag`, `backgroundThrottling` — not `spellcheck`, which is `true`. On macOS, each text modification triggers a round trip to `NSSpellChecker` on the UI thread of the browser process. The service is completely lost: `desktop/src/menu.ts` does not build any context menu and `main.ts` never listens to `context-menu` — only the underlines remain.

```ts
      webviewTag: false,
      // The spell checker goes through NSSpellChecker on macOS for every text
      // modification, on the browser process's UI thread — and none of its
      // suggestions can be reached (no context menu is built).
      spellcheck: false,
      backgroundThrottling: true,
```

#### P7. The fade mask is placed on the scrolling containers
`lib/use-scroll-fade.ts:112-118` renders `WebkitMaskImage`/`maskImage` in `scrollProps.style`, applied to the scroller itself: `components/kanban-column.tsx:111` (one instance per column), `components/global-kanban-column.tsx:125`, and `components/kanban-board.tsx:371` — a mask *within* a mask. A hidden scroller can no longer be scrolled by layer translation: the mask is anchored to the border box and the content must be re-composed every frame. Added to this, per column, is a `ResizeObserver` **and** a `MutationObserver` in `childList + subtree` (`:100-103`).

Exit the scroller fade — `edges` is already rendered by the hook (`:123`), there is nothing more to measure:

```tsx
<div className="relative flex min-h-0 flex-1 flex-col">
  <div ref={setScrollRef} onScroll={scrollProps.onScroll} className="…overflow-y-auto…">…</div>
  {edges.start && <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-background to-transparent" />}
  {edges.end && <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-background to-transparent" />}
</div>
```

#### P8. The lasso loop alternates layout writes and reads each frame
`components/marquee-selection.tsx:319` calls `autoScroll()` **unconditionally**, before testing `dirty`. `autoScroll` (l.288-315) continues: reading of rect → writing of `scrollLeft` → rereading → `document.elementFromPoint` (which forces an update of style + layout after the previous writing) → raising the ancestors with `getComputedStyle().overflowY` and readings of `scrollHeight`/`clientHeight` per level → write `scrollTop`. Two to three forced layouts per frame, including stationary pointer. Then `apply()` writes the overlay styles **before** doing N `getBoundingClientRect()`.

Resolve the scroller in the `pointermove` handler rather than every frame, only measure if `dx !== 0 || dy !== 0`, and in `apply()` **read before writing** — only one layout per frame.

---

### Bottom of the table — to do in passing, without waiting for an image

| Default | File:line | Gesture |
| --- | --- | --- |
| Each `<Tooltip>` builds its own `TooltipProvider` (8-10 per card) | `node_modules/mangue-ui/src/components/ui/tooltip.tsx:21-28` | Remove the provider from the wrapper, mount **one** at the root. Also fixes a bug: the Radix “skip delay” only works between tooltips from the same provider. |
| Invisible blur under 95% background | `components/assistant-fab.tsx:102`, `components/pages/page-toc.tsx:215`, `components/bulk-issue-actions.tsx:81` | Remove `backdrop-blur-*`. This is free GPU work, not a performance fix — don't budget for it. |
| `backdrop-filter: blur(0.5px)` full screen on palette veil | `lib/command-palette/styles/CommandPalette.module.css:20` | Delete the line, **and nothing else**: `.overlay` has no `background` (l.12-22); adding a scrim would be a design change. |
| Numo's face animates SVG attributes in a loop, including masking under 1200 px (`max-desktop:hidden` mask without unmounting) | `components/assistant-fab.tsx:112`, `components/mobile-nav-actions.tsx:34` | `animated={false}` — the activity signal already goes through `AgentBeam` (`assistant-fab.tsx:85-90`). |
| The FAB goes back to each SSE token to read a boolean | `components/assistant-fab.tsx:39`, `lib/assistant-chat-context.tsx:195-216` | Split context: a separate `AssistantBusyContext`. Only bites closed panel (the FAB makes `null` open panel, l.62). |
| `usePaletteStore()` called bare, without selector | `lib/command-palette/hooks/useMobileGestures.ts:77` | Four selectors. The consumer file itself documents the rule (`SearchView.tsx:113-122`). |
| The preload blocks the renderer on a synchronous IPC to read a version | `desktop/src/preload.ts:24` | `additionalArguments: ["--minddy-version=…"]`. Cost of **first delivery** only. |
| `Analytics` + `SpeedInsights` in root layout | `app/layout.tsx:185-186` | Lower them into `(marketing)` and `(legal)`. |
| `onPointerMove={openRail}` on entire sidebar | `components/app-sidebar.tsx:822` | `onPointerMove={overlay && !hovered ? openRail : undefined}`. |

---

## 3. The action plan

### (a) Less than an hour, best gain/risk ratio

In this order — each is independent of the others, none requires prior action:

1. **`modal={false}` defaults to `DropdownMenu`** in mango-ui (C1). One line, 20 dropdowns fixed at once. The repository already has 6 sites passing it by hand, with justification.
2. **Remove the two animated `drag` sockets** from globals.css (C2). Two deletions; the fixed band already does the job.
3. **Deduplicate `applyWindowButtons`** (C3), keeping the `publishWindowButtons` unconditional.
4. **Keep `updateActiveColumn` under 640 px** (C5).
5. **Fix `["agent-activity"]` → `["agent-active-issues"]`** and the test that locks the wrong key (C7).
6. **Memorize the three context values** + bail-out on `access_token` (C6).
7. **Remove `scroll` listener from `ActionsPopover`** (P4).
8. **`spellcheck: false`** (P6).

### (b) A substantial workstream

- **Recast the `no-drag` digging by surface** (P1). This is the position with the highest expected gain, but its fix changes a product security invariant: “nothing interactive in the 60 px becomes a window handle”. You must return to the six screens listed in the MIN-292 comment, one by one, windowed **and** full screen, rail folded **and** unfolded.
- **Memorize the board** (P2): `React.memo` on `IssueCard`/`IssueCardBody`/the columns, stable callbacks in `kanban-column.tsx` (take the `issue` as an argument, like `onUpdateIssue` already does), `extraActions` calculated when opening the menu and not at each rendering, the lists of pickers reported to the board next to `memberMap`/`categoryMap`/`objectiveMap` (`kanban-board.tsx:108-121`), `agentsEnabled` resolved once per board. **After (a).6**, otherwise the memorization does not bite. And open the three agent contexts, which this audit has not read.
- **Remove the scrollers mask** (P7) and **correct the lasso loop** (P8).
- **A unique `TooltipProvider`** in mango-ui, with the check that no tooltip is orphaned (Radix raises, the rest will tell).

### (c) Measure before touching

- **The cost model of annotated regions** (P1). Until a profile shows the position, the order between (a) and (b) remains an assumption. This is the most cost-effective measure in this entire document.
- **The size of the localStorage snapshot** (P5). `localStorage.getItem("minddy.query-cache").length` on a real board. Under ~100 KB, we don't touch anything.
- **`issues.length` on a real project** before limiting `components/relation-target-picker.tsx:38`, which mounts all open tickets without virtualization. Below ~80 candidates, the default costs nothing.
- **GPU time of sails** (P3) before going beyond the `[data-slot$="-overlay"]` rule.

---

## 4. What was excluded, and why

**The `backdrop-blur` of the FAB as the cause of the diffuse drops.** The code is indeed the one described (`assistant-fab.tsx:102`, `fixed z-40` button mounted on the entire app), but the element does `h-10 w-10 md:h-11 md:w-11` (l.101): the reading of the background and the convolution are limited to ~2,000 px², on the GPU side. There is no “viewport size surface re-rastered every frame”. The blur is invisible under `bg-card/95` — it's storage, not a lead.

**Paddle veiling as a cause of continuous jerking.** `blur(0.5px)` is a trivial convolution and only lasts the opening time. We remove the line because it is of no use to anyone, not because it will render an image. And above all: **do not add `background`** as compensation, the veil is deliberately transparent (`CommandPalette.module.css:12-22`).

**The `backdrop-filter` transitioning from the Numo panel** (`components/assistant/panel-geometry.ts:62`). The announced link — “at each opening” — is false: upon opening the panel arrives in compact mode, where l.63-64 places `!bg-transparent supports-backdrop-filter:!backdrop-blur-none`; there is nothing to interpolate, and the initial value of a transition does not animate during editing. Only the compact⇄extended toggle pays, a rare gesture. **And don't touch `.assistant-panel-morph`** (`app/globals.css`, `@layer utilities` block): the comment just above explains that anchoring `right`/`bottom` in both modes *is* what makes the desired move.

**The `getBoundingClientRect` of the zen block** (`components/zen-nav-overlay.tsx:101`). As long as the pointer remains on the same side of the border, `setOpen` yawns, no rendering occurs, the layout remains **clean** — and a rect on a clean layout is served from the cache. There is only a forced reflow at the moment of the switch, once per input and once per output. Range: Zen mode, block unfolded. The proposed fix (cached rect reread at `resize`) **would introduce a regression**: the tested area would become false as soon as a layout change moves it without resizing the window (rail collapse, secondary bar teleported) — exactly the bug this code was written to remove. **Change nothing is the correct answer.**

**Cut agent activity poll** (`agent-activity-context.tsx:72`). The real-time bridge **never** invalidates `["agent-active-issues", …]` (`lib/realtime-provider.tsx:409-427` and `:451-462` invalidate `ALL_AGENT_SESSIONS_KEY`, `["agent-runs","issue",id]`, `["pull-request",id]`). Changing `refetchInterval` to `false` would freeze the “Numo working” halo and PR pellets until the next edit. If we want to touch it one day: first add the missing invalidation, then extend the backstop to 60 s — never delete it.

**Cut real-time invalidation of `["billing","usage"]`** (`realtime-provider.tsx:201`). This is the function that the `20260818090000_billing_realtime.sql` migration was written to serve: the header gauge that goes down while an agent is working (MIN-72). Once `agentsEnabled` is placed on the board, the question no longer arises - only one observer remains, and refreshing it no longer returns any cards.

**Move the three requests from `CreateProvider` under `{target && …}`.** They are already inert: `useMembersQuery(target, !!target)` (`create-context.tsx:143`), and `useCategoriesQuery`/`useObjectivesQuery` keep `enabled = !!projectId`. `target` is only placed when a dialogue is first opened (l.125). Their keys are worth `["members",""]` etc., which no invalidation affects. Work for zero gain, which would also displace the state of a dialogue deliberately left edited (l.124).

**The 100 observers `useProjectGitLinkQuery` per board** (`issue-card.tsx:958`). They share **one** Query: react-query duplicates, there are not 100 queries. And the key is only written by linking or unlinking a repository — not a continuous source. The gesture remains good (hoisting on the board) but for hygiene, not for an image.

**`useMobileGestures` as cause of startle.** The re-rendering of `SearchView` that it causes is superficial: `filteredItems`, `itemsWithCalculator`, `groupStartIndices` (`SearchView.tsx:455-460`) are `useMemo` of which no dependency moves when alone `actionsPopoverQuery`/`actionActiveIndex` changes — scoring is not replayed, and `ResultsList` is virtualized. A few tenths of a millisecond. We correct because it's free and the file contradicts itself, not for profit.

**The first proposed fix for the window button watcher** (a `attributes`-only watcher with a `known` child set of `<body>`). It reopens the bug that MIN-291 closed: without `childList`, an already known portal that receives its content later no longer emits anything, and a dialog already open at the time of the first subscription becomes invisible forever — macOS fires across the corner of the dialog. The form retained in C4 is that with two distinct observers.

---

## 5. The measuring procedure

### Open DevTools from the Electron window

There is **no** menu item for this: `desktop/src/menu.ts` does not construct `toggleDevTools` or context menu, and `main.ts` never calls `openDevTools()`. Go through the debug protocol.

```bash
cd /Users/clementguerin/Projets/minddy-ticketing/minddy/desktop
npm run build && npx electron . --remote-debugging-port=9222
```

Then, in Chrome: `chrome://inspect` → **Configure…** → add `localhost:9222` → **inspect** on target `www.minddy.app`. We obtain the complete DevTools, Performance panel included, on the window renderer.

On an already installed binary, the same flag works:
`/Applications/minddy.app/Contents/MacOS/minddy --remote-debugging-port=9222`

⚠️ Only one heavy process at a time on this Mac: close Playwright, the dev servers and the other Electron windows before saving, otherwise the profile measures the contention and not the app.

### The test that decides, before any profile (30 seconds)

Open **the same board**, on the same account, in Chrome (`https://www.minddy.app`) and in the desktop app, side by side. Hover over the sidebar, open a status dropdown on a card, move the cursor.

- Fluid Chrome, jerky desktop → the thesis of §1 holds. `data-desktop-app` does not exist in a browser, none of the rules for `globals.css:1682-1800` apply to it, and `getDesktopBridge()` is null: P1, C2, C3, and the cost of C4 are the only remaining suspects.
- Both jerk the same → the thesis falls. The station is then in the web (C1, C5, C6, P2), and the order of the plan switches to level (b).

### Read a Performance profile on ProMotion

The screen is 120 Hz: **budget per frame is 8.3 ms, not 16.7.** A 12 ms task that goes unnoticed on a 60 Hz screen visibly skips here. This is also why the symptom is felt on the Mac and not elsewhere.

1. **Performance** panel, check **Screenshots**, set **CPU: 4× slowdown** — the default sought is a cost *proportional to the number of elements*, the slowdown makes it readable without distorting it.
2. **Record 5 seconds** during this specific gesture, in this order: hover over the sidebar from one edge to the other (triggers the width animation), open a status dropdown on a card, close it, move the cursor over the list.
3. In the **Main** track, search, in order of diagnostic value:
   - long tasks just **after** each `Layout`, without `Paint` behind — signature of the annotated region journey (P1/C2). They appear in the “Update Layer Tree” or in the unassigned portion of the task, not under an explicit name: these are the orphan blocks that must be identified.
   - a `Recalculate Style` covering a **number of elements equal to the entire document** when the menu is opened — signature of `body{pointer-events:none}` (C1). The “Elements affected” line in the detail is direct proof.
   - repeated `Function Call` carrying `updateActiveColumn` / `setActiveColumn` during a horizontal scroll (C5).
   - bursts of `Recalculate Style` + `Layout` when the window returns to the foreground (C6).
4. **A/B which is better than reading internals**: in the Elements tab, select `<html>`, remove the `data-desktop-app` attribute, repeat exactly the same gesture and re-record. All the rules in the “desktop app” section of globals.css fall at once — the window is no longer movable during testing, that's the price. If the profile flattens, P1 and C2 are demonstrated and stage (b) becomes priority. If nothing changes, we have saved a project.

### The screen to reproduce

A **project board with 60 cards or more** (`/p/<clé>`), wide window (unfolded rail, ≥1200 px for the sidebar to be rendered), indifferent theme. This is the screen where the three mechanisms intersect: the largest number of mounted `[tabindex]`/`[role]` elements (P1), the animated sidebar on hover (C2), the modal dropdowns of the card pickers (C1), and the horizontal scroller (C5). For the "cursor" variant, add a slow hover along the rail border — this is the gesture that triggers both the width animation, region rebuild, and C3's `RedrawTrafficLights`.
