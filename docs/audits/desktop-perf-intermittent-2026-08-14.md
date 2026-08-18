# Second pass — why the defect is RARE

minddy desktop app (Electron 43 / macOS). Complete, without replacing it, `docs/audits/desktop-perf-2026-08-14.md`.

---

## 1. What the testimony decided

**"Honestly, both are equally fluid" eliminates any permanent cost.** A tax paid at each frame - a vector of annotated regions reconstructed at each layout, a `Recalculate Style` on the entire document at each menu opening, a board not memorized - is felt continuously, and is felt *more* where it is heavier. If the steady state is the same in Chrome and in the shell, then what separates them is not a coefficient, it is an **event**. The central thesis of the first pass — the global `no-drag` digging of `app/globals.css:1710-1731` as the main cause — is therefore **discarded**. What remains true in this first report does not change a word: the rules exist, their scope is indeed that described, C1 (20 Radix dropdowns in `modal` writing `pointer-events:none` on `<body>`), C5, C6, C7, P2, P4 and P6 are real defects and their fixes remain good. They are simply not the answer to *that* question. §5 of this report (the DevTools manipulation, the A/B `data-desktop-app`, the budget of 8.3 ms on ProMotion) remains the best page of the document and serves as the basis for §3 below.

**“Rare enough not to arrive when you look for it” imposes three things on any explanation.** First a **named condition** which is only true sometimes: a threshold crossed, two tasks running against each other, a window state, an accumulation in a process which lives for days. Then the **inversion of the search gesture**: searching means clicking slowly, moving the mouse, returning quickly — three gestures which precisely consume or disarm the candidate mechanisms. Finally, a mechanism that is triggered **each time a menu is opened is automatically disqualified**, however costly it may be, since it would reproduce on demand. And two distinct symptoms, which we must refuse to mix: “the rail which closes more slowly” is a **degraded frame rate animation** (lost frames); “a popover that opens, closes and opens in just 100 ms” is **not a rendering problem** — it is an unmount/remount or state toggle, therefore a **logic** event. Mixing them up would be the most costly mistake in this document; §2 separates them, and §3 gives the instrument which distinguishes them in a newspaper line.

A note of method, which weighs on the reading of the A/B test: in daily use, the shell window is the one that we **leave and find** twenty times a day (⌘W the cache, `desktop/src/main.ts:323-327`), while the Chrome tab of the test was open side by side, visible, for a few minutes. The mechanisms governed by a hidden→visible cycle are therefore structurally **absent from the comparative test** while being everyday in use. This is exactly the “both are equally fluid, and yet the native app does things that the browser doesn’t do” profile.

---

## 2. The mechanisms retained, by explanatory power

### A. “The rail that closes more slowly”

#### A1 — Missing resume drops up to 600 react-query cache scans in a synchronous loop, at the precise moment the window returns

**The mechanism.** On `visibilitychange` → visible, the resume effect calls `catchUp([...USER_SCOPE_KEYS, ...topicIds.flatMap(projectScopeKeys)])` ([lib/realtime-provider.tsx:749](lib/realtime-provider.tsx)). `catchUp` ([:620-631](lib/realtime-provider.tsx)) is a `for` **synchronous** loop that calls `queryClient.invalidateQueries({ queryKey })` one key at a time, without `refetchType` — so defaults to `"active"`. Each call does **two** full cache scans (`findAll` into `invalidateQueries`, then a second into the `refetchQueries` it chains together), not one. The count: 9 user keys ([:481-491](lib/realtime-provider.tsx)) + 11 keys per project + 21 shared prefixes deduplicated once ([:492-545](lib/realtime-provider.tsx)), capped at 25 project channels (`MAX_PROJECT_CHANNELS`, [lib/realtime-topics.ts:17](lib/realtime-topics.ts)). On a five-project account: ~85 calls, therefore ~170 courses; to the ceiling, ~305 calls and ~610 routes. And the cache has no ceiling: `gcTime` is worth 24 h ([lib/query-provider.tsx:45](lib/query-provider.tsx)) and **the shell document is never reloaded** (no `reload` nor `forceReload` in the menu, [desktop/src/menu.ts:66-70](desktop/src/menu.ts)), so N grows all day — one `["comments",id]` and one `["events",id]` per open ticket. The cost is O(calls × N), with N rising on its own.

**The condition that makes it intermittent.** A threshold, read in the code: `shouldCatchUpOnResume` ([lib/realtime-resume.ts:48-57](lib/realtime-resume.ts)) only returns `true` if the socket has declared itself down, **or** if the absence exceeds `RESUME_AFTER_HIDDEN_MS = 15_000` ([:35](lib/realtime-resume.ts)). A three-second back and forth — the exact gesture of someone trying to reproduce — triggers **nothing**. You have to be gone for more than fifteen seconds *and* interact within a second of returning. The cost depends on two variables that we do not see by observing: the number of projects in the account, and the number of requests accumulated since the last launch. The same gesture costs 20 ms in the morning and 150 ms in the evening.

**Why the shell changes the outcome.** The path is not missing from Chrome — switching tabs toggles `visibilityState` the same way. What the shell changes is the **frequency**, and it changes it structurally: ⌘W and the red light **hide** the window instead of destroying it ([desktop/src/main.ts:323-327](desktop/src/main.ts), [desktop/src/menu.ts:84-91](desktop/src/menu.ts)), `app.on("activate")` brings it back ([:560-564](desktop/src/main.ts)), and the app never exits on darwin ([:570-572](desktop/src/main.ts)). The visible→hidden→visible cycle is therefore replayed dozens of times per day **on the same document, with the same cache**, where a ⌘W in Chrome destroys the tab and where the next reload starts from a limited snapshot. A single window is also hidden for *long* periods (we go to the editor, to the terminal): the 15 s threshold is crossed almost every time.

**The fix.** Not what you think. Restricting to `type: "active"` would break the marking of inactive requests, which is exactly what comment [:614-618](lib/realtime-provider.tsx) describes and what makes a surface reopened after absence request the truth again (with `staleTime: 5 * 60_000`, [lib/query-provider.tsx:132](lib/query-provider.tsx), it would be re-served stale for five minutes). Limiting to on-screen projects is worse: the others feed `GLOBAL_BOARD_KEY`, `HOME_SUMMARY_KEY` and `TRIAGE_COUNTS_KEY`, read by the sidebar on all pages. The right gesture is **a single course**:

```ts
// lib/realtime-provider.tsx:620 — same coverage (active AND inactive),
// one findAll instead of several hundred.
const catchUp = useCallback((keys: QueryKey[]) => {
  const wanted = new Set(keys.map((k) => JSON.stringify(k)));
  void queryClient.invalidateQueries({
    predicate: (q) => {
      // A key matches if one of its prefixes is requested.
      for (let n = q.queryKey.length; n > 0; n--) {
        if (wanted.has(JSON.stringify(q.queryKey.slice(0, n)))) return true;
      }
      return false;
    },
  });
}, [queryClient]);
```

#### A2 — After a socket cut, the catch-up is replayed ONCE PER CHANNEL, and `wakeRealtime` itself causes the cut three seconds after A1

**The mechanism.** In `openScope`, the callback of `channel.subscribe` marks `dropped = true` on `CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED` and replays `catchUp(scopeKeys)` on re-subscription ([lib/realtime-provider.tsx:664-677](lib/realtime-provider.tsx)). Now `dropped` is a **closure variable per channel** ([:644](lib/realtime-provider.tsx)) while the `seen` which duplicates lives **inside** `catchUp` ([:622](lib/realtime-provider.tsx)): it is new on each call. An outage closes *all* the channels at once — a single WebSocket carries all 26 topics, and phoenix propagates the error to each one (`onConnClose` → `triggerChanError`, `@supabase/phoenix/assets/js/phoenix/socket.js:547-579`, escalated to `CHANNEL_ERROR` by `@supabase/realtime-js/dist/main/RealtimeChannel.js:157`). Upon reconnection, each channel recalls `catchUp(32)`: 137 invalidations on a four-project account, 809 at the ceiling, the vast majority of which replay the same 21 shared prefixes. And as the joins arrive over the ACKs, the work is **spread over several consecutive images** — that is to say exactly the duration of a rail animation (`transitions.shell`, [components/app-sidebar.tsx:795](components/app-sidebar.tsx)).

**The condition that makes it intermittent — and this is the point that the first pass couldn't see.** It's not just "an outage happens sometimes". This is because **A1 makes A2**. `resume` calls `wakeRealtime(realtime)` ([:751](lib/realtime-provider.tsx)) which, on a socket that says it is open, sends a beat then, `ZOMBIE_PROBE_MS = 3_000` later, a second **intended to force phoenix to conclude death and rejoin everything** ([lib/realtime-resume.ts:87-103](lib/realtime-resume.ts)). In other words: any recovery lasting more than fifteen seconds triggers A1 at the moment of return, **then A2 three seconds later**, if the socket was zombie. Both are composed of a single gesture, and this gesture is the one that the shell makes everyday. The rest of the time — living socket, short absence — nothing leaves. The condition is named, uncontrollable, and its frequency is a direct function of whether the window hides instead of dying. `dropped` is also false at the first subscription: the defect does not exist when the app is launched, only for someone who leaves it open.

**The fix.** Keep the flag per channel — it also catches the drop of **a single** channel (join refused, expired token on a private topic), which a socket-level listener would not see. Hoist only the **queue**: a `catchUpCoalesced(keys)` at the provider level, which stacks in a `Set<string>` and empties into a single `invalidateQueries({ predicate })` per loop turn. It's the same patch as A1, and it renders both. ⚠ **Separate file from `timers`** ([:586-612](lib/realtime-provider.tsx)): this map carries the mode in its coalescence identity (`${refetch}:${hash}`, [:598](lib/realtime-provider.tsx)) so that a `"none"` does not swallow a `"active"` pending; sharing it would reintroduce this exact bug.

#### A3 — The hidden window goes into memory purge, and we pay for it when we return

**The mechanism.** The two “close” gestures are rewired to `hide()` ([desktop/src/main.ts:323-327](desktop/src/main.ts), [desktop/src/menu.ts:88-90](desktop/src/menu.ts)). As it is the only window (`setWindowOpenHandler` refuses any other, [:216-223](desktop/src/main.ts)), the renderer process finds itself without any visible page: Chromium puts it in the background, with what that implies of purging tiles from the composer and decoded images, and macOS downgrades its QoS. At the following `show()` ([:363](desktop/src/main.ts), [:502](desktop/src/main.ts), [:562](desktop/src/main.ts)), everything has to be redone, and the process is **never renewed**.

**The condition.** Conjunction: the window must have remained hidden long enough to pass the purge threshold — minutes, not seconds — **and** the user must interact within 1 second of returning. Hiding for ten seconds and coming back costs nothing visible.

**Honesty about this observation.** The Chromium mechanism invoked (`MemoryPurgeManager`, QoS downgrade) is not readable **nowhere** in this repository nor in `node_modules`: it is an inference, and nothing has measured it. It can also explain **only** symptom (a): a purge of tiles is paid for in re-rasterization, it does not dismantle any React subtree. I keep it in third position because it shares its triggering condition with A1 and A2 — the window return — and because §3 instruments them at once. **No blind fix here**, and especially not "really turn the red light": desktop notifications are issued **by the renderer** ([lib/use-desktop-notifications.ts:86-93](lib/use-desktop-notifications.ts)), destroying the window would delete them, without APNS or FCM to catch up ([:24-26](lib/use-desktop-notifications.ts)). The comment [desktop/src/main.ts:321-322](desktop/src/main.ts) says it verbatim. It is a paid choice, not open arbitration.

---

### B. “The popover that opens, closes and opens”

**First say it straight: nothing in this pass explains this symptom with certainty.** The three mechanisms below are the only candidates that literally produce a logic event, and none cover the full case. This is precisely why §3 is the real deliverable of this document.

#### B1 — Region map `-webkit-app-region` is geometry sent to the browser process, and during the 300 ms of rail animation it is out of date

**The mechanism.** Three rules overlap in the top 60 px: the fixed strip ([app/globals.css:1684-1693](app/globals.css)), the shell header ([:1739-1740](app/globals.css)) and the mark line ([:1778-1782](app/globals.css)) to `drag`, dug by the global rule `no-drag` ([:1710-1731](app/globals.css)). These hollows are **geometric**: Blink collects them at the end of the layout and sends the vector of rectangles to the browser process, which alone decides whether a `mousedown` belongs to the window or the page. Now what occupies the strip **moves**: the `motion.aside` animates its width 56 ↔ 256 px ([components/app-sidebar.tsx:810-815](components/app-sidebar.tsx)) and all the content slides with it; the mark translates from `100cqw - 100%` ([app/globals.css:1785-1786](app/globals.css)). When an arbitration decision arrives on a map of a delay image, a press which aimed for a control is consumed by macOS as a window hold: **the renderer receives neither `pointerdown` nor `click`**, so Radix's `DismissableLayer` does not close what it should close and the trigger does not open; conversely a press that the expired card believes `no-drag` arrives at the page while the window begins to move.

**The condition that makes it intermittent.** The map is only false **while it's changing**: the ~300ms of rail animation, or the frame where the mark begins its slide. Outside of these windows — the vast majority of the time — it is accurate. You must therefore click in the top 60 px in the few hundred milliseconds following brushing against the rail. It's a common gesture (we brush against the bar going up to the header) but **never the one we do again when we're searching**: searching is clicking slowly, and slowly the card has had time to arrive.

**Why native only.** `-webkit-app-region` only makes sense for an unframed window, and the four blocks are prefixed `html[data-desktop-app]` ([:1684](app/globals.css), [:1710](app/globals.css), [:1739](app/globals.css), [:1778](app/globals.css)). The attribute is only set by [components/desktop-chrome.tsx:24-26](components/desktop-chrome.tsx), and only if `getDesktopBridge()` is non-zero. In Chrome there are **no** cards, no arbitration, no delays possible.

**The fix — and why it should not be done blindly.** Remove the two `drag` sockets placed on **animated** rectangles ([:1739-1740](app/globals.css) and the `-webkit-app-region: drag` of [:1782](app/globals.css), keeping `container-type: inline-size` which carries sliding): the fixed strip already covers exactly the same 60 px with a rectangle that never moves. That's for sure. Lightening global digging, on the other hand, undoes the invariant that comment [:1699-1709](app/globals.css) describes as the reason for the rule — "nothing interactive within 60 px becomes a window handle." See §4.

#### B2 — `SidebarRow` changes the TYPE of its root element with `collapsed`: each rail toggle destroys and recreates the lines

**The mechanism.** `row` is a `MotionLink` ([components/app-sidebar.tsx:273-286](components/app-sidebar.tsx)) or a `motion.button` ([:288-300](components/app-sidebar.tsx)), and it is **wrapped** in `<Tooltip><TooltipTrigger asChild>…` only `if (collapsed || item.shortcut)` ([:303-322](components/app-sidebar.tsx)). For any line **without** `shortcut` — project entries, sections — the type of the element rendered at that position therefore changes from `MotionLink` to `Tooltip` and back at each rail toggle. React does not reconcile two different types: it unmounts the subtree and mounts a new one. **The DOM node is replaced, and its focus falls back to `<body>`.**

**The condition, and its limit.** The rail must tilt while a line without a shortcut carries the focus or a surface. The real and verifiable case: we **click** a project entry — `onFocusCapture` only places `focusWithin` on `:focus-visible` ([:826-839](components/app-sidebar.tsx)), so the line has the focus but the bar does not retain it; the pointer leaves, 150 ms later `hovered` drops ([:750](components/app-sidebar.tsx)), `collapsed` switches ([:753](components/app-sidebar.tsx)) and the focused line is replaced. The tab starts from the top of the document.

**What needs to be removed from it.** The double oscillation scenario (the winding causing a `focusout` which reverts `collapsed`) **is not achievable**: as long as `focusWithin` is true, `collapsed` is false ([:753](components/app-sidebar.tsx)), so the winding cannot occur with focus retained; and when it occurs, `setFocusWithin(false)` is a no-op. And this mechanism **is not native only**: it occurs identically in a browser. What the shell adds is a third `collapsed` driver (`useHoldWindowButtons("rail", wide && collapsed)`, [:780](components/app-sidebar.tsx)) and additional rendering of the entire bar a macrotask later, when the IPC responds. It is here because it is **the only verified mechanism in the repository that literally produces mounting→unmounting→mounting of a surface**, and because its fix is ​​free.

**The fix.** Return the `<Tooltip>` unconditionally and only vary its opening:

```tsx
// components/app-sidebar.tsx:303 — stable structure: the row node
// is never replaced again, and keyboard focus survives expansion.
row = (
  <Tooltip
    delayDuration={TOOLTIP_DELAY_MS}
    disableHoverableContent
    open={collapsed || item.shortcut ? undefined : false}
  >
    <TooltipTrigger asChild>{row}</TooltipTrigger>
    <TooltipContent side="right" className="flex items-center gap-2">…</TooltipContent>
  </Tooltip>
);
```

And harden `onBlurCapture` ([:840-848](components/app-sidebar.tsx)): `if (e.relatedTarget === null) return;` — a loss of focus which does not designate any new target is not an exit from the bar, this is also what deactivating the window using the macOS menu bar produces.

#### B3 — `settling` is unfrozen by any message from the bridge, not by the response it expects

**The mechanism.** `settling` is the flag "closing the dialog is still digested by the main process" ([lib/use-window-buttons.ts:281-289](lib/use-window-buttons.ts)), set during rendering ([:302-305](lib/use-window-buttons.ts)) and cleared in one place: the subscription manager, which `setVisible(next); setSettling(false); setStarted(true)` on **all** message `minddy:window-buttons-state` ([:319-323](lib/use-window-buttons.ts)), without checking that it is indeed the response to the release that we expect. Now the channel carries **five producers**, all asynchronous: the response to any request ([desktop/src/main.ts:84](desktop/src/main.ts)), the rebroadcast of the cache on `minddy:window-buttons-ready` ([:359](desktop/src/main.ts) → [:88-91](desktop/src/main.ts), a `webContents.send` which waters **all** the `ipcRenderer.on` of the document, therefore the neighbors of the new subscriber), `did-start-navigation` ([:303-307](desktop/src/main.ts)) and the four full screen events ([:313-320](desktop/src/main.ts)). One message too many, arriving at the wrong time, unfreezes the layout one round trip too early: `reserved` falls back to `visible` ([lib/use-window-buttons.ts:348](lib/use-window-buttons.ts)), the place closes, and the effect [:310-312](lib/use-window-buttons.ts) poisons the frozen value in passing.

**Which this observation CANNOT explain, and it must be said.** A popover does **not** enter `MODAL_SELECTOR` ([:136-144](lib/use-window-buttons.ts)), and this is deliberate: the comment [:132-134](lib/use-window-buttons.ts) explicitly excludes `role="dialog"` without `aria-modal` “and the buttons would flash with each opened menu”. A popover never toggles `modal`, so cannot trigger this mechanism. It only explains the jump of the **mark line** — and again: on the pages with a secondary bar (those where the rail exists, therefore those of symptom (a)), the 320 ms transition is **disarmed** by `:not([data-rail])` ([app/globals.css:1802-1806](app/globals.css), `data-rail` set by [components/app-sidebar.tsx:888](components/app-sidebar.tsx)): The mark teleports instead of sliding. And the 68 px setting of `HeaderWindowButtonsSlot` ([components/desktop-window-buttons.tsx:110-123](components/desktop-window-buttons.tsx)) renders **nothing at all** above 1200 px, i.e. never on a default window of 1280 ([desktop/src/main.ts:228](desktop/src/main.ts)).

**What remains, and why I keep it.** The design hole is authentic: an acknowledgment that does not identify what it acknowledges, in a five-producer protocol. It has a **second, non-decorative victim**: `windowButtons.reserved` is read by `leavesThroughWindowButtons` ([components/app-sidebar.tsx:719-720](components/app-sidebar.tsx)); a `pointerleave` that falls into the transient window sees `reserved === false`, the exit from the top left corner is no longer recognized, and the rail closes under a pointer that was going to click the lights - the fault that MIN-291 closed, resurrected intermittently.

**The fix.** A sequence number: a counter incremented with each `applyWindowButtons` triggered by a `minddy:window-buttons`, carried by the message, and `setSettling(false)` **only** on a number strictly greater than that of the request issued by `pushToBridge`; `setVisible` remains unconditional. And make `minddy:window-buttons-ready` a **targeted** response (`event.sender.send(...)` to [desktop/src/main.ts:359](desktop/src/main.ts)) rather than a broadcast. ⚠ **Do not retain the “variant without touching the protocol”** (unfreeze only on a message whose value differs): it releases `settling` to `true` in the exact case that [lib/use-window-buttons.ts:50-55](lib/use-window-buttons.ts) documents as real — folded rail, a dialog opens and closes, the released request republishes `false`, same value, never unfreeze. We would exchange a rare race for a deterministic latched state.

---

### C. Found along the way, explains neither symptom

**The dying document removes buttons for the next document, which has no one to request them again.** `wantsWindowButtons` is a **main** variable ([desktop/src/main.ts:54](desktop/src/main.ts)) that survives documents; `holds` is a module of the **page** ([lib/use-window-buttons.ts:29](lib/use-window-buttons.ts)) which dies with it. `did-start-navigation` hands over `wantsWindowButtons = true` and publishes ([desktop/src/main.ts:303-307](desktop/src/main.ts)) — but it pulls to the **start** of the navigation, so the message goes to the old, still-living document. If a reason is given, its `watchContradiction` ([lib/use-window-buttons.ts:110-116](lib/use-window-buttons.ts)) pushes `false` during the network round trip, and the new document starts `holds` empty without ever pushing anything (`useHoldWindowButtons` exits on `if (!active) return`, [:73-84](lib/use-window-buttons.ts)). **The macOS lights remain absent.** Only three entry points: the startup `loadURL` (no old document), `minddy://open?next=…` ([:122](desktop/src/main.ts)) and `goHome` ([:185](desktop/src/main.ts) and [:213](desktop/src/main.ts)) — there is no keyboard reload ([desktop/src/menu.ts:66-70](desktop/src/menu.ts)). The repair gesture is not what we think: `goHome` loads `/home` ([lib/desktop/config.ts:33](lib/desktop/config.ts)), a page without secondary bar, therefore without rail mode to unfold — what repairs is a cycle of reason, in practice opening then closing the ⌘K palette. **A window without lights is a window that can no longer be closed or reduced with the mouse**: to be corrected, even if this is not the question of this pass. The fix is an unconditional `pushToBridge()` in a mount effect, placed in **root layout** or in [components/desktop-chrome.tsx](components/desktop-chrome.tsx) (not in `DesktopWindowButtons`, mounted only under [app/(app)/app-providers.tsx:99](<app/(app)/app-providers.tsx>), therefore missing from login, `/f/`, `/p/`, not-found).

**The pointer return watcher remains armed without limit.** `closeRail(e)` does not close when the pointer leaves the top-left corner: it calls `watchPointerReturn()` and returns ([components/app-sidebar.tsx:744-748](components/app-sidebar.tsx)), which sets a `document.addEventListener("pointermove", onMove, { once: true })` and **nothing else** — no delay, no limit ([:730-742](components/app-sidebar.tsx)), and `openRail` does not disarm it ([:696-702](components/app-sidebar.tsx)). The rail can therefore remain unfolded over the secondary bar during an entirely keyboard sequence, and close at the first mouse movement, minutes later. The clearest case: exiting the unfolded rail through the top-left corner, this is exactly the route to click the red light — which **hides** the window; it is therefore stored with the rail unfolded, and reopened as is. Strictly native: `leavesThroughWindowButtons` requires `windowButtons.reserved`, which is constantly worth `false` outside the shell (`settling` remains `true` for life, `frozen.current` is never written — [lib/use-window-buttons.ts:300](lib/use-window-buttons.ts), [:310-312](lib/use-window-buttons.ts), [:348](lib/use-window-buttons.ts)). But the user would have described it as “the bar stays open”, not “it stutters”. Fix: disarm in `openRail`, and hook fallback to `window.addEventListener("blur")` and `visibilitychange` with `document.hidden` — **not** to a timer, which would reopen the bug that MIN-291 closed.

---

## 3. How to catch him in the act

The fault does not recur on demand. **A profiling session will never find it**: the time to open DevTools and press Save has passed. We therefore need instrumentation that **runs constantly, keeps a trace, and freezes on command** — the user's gesture is no longer "reproducing" but "I just saw it, dump".

### 3.1 The rotating buffer in the renderer, emptied to the clipboard by a shortcut

This is the main instrument, and it alone decides between the two symptoms: the log will tell if the popover was **unmounted** (React) or only **closed** (state), and if a long frame preceded it.

Where to put it: **`lib/desktop/trace.ts`**, mounted from [components/desktop-chrome.tsx](components/desktop-chrome.tsx) (the component which already installs `data-desktop-app`, therefore the one which guarantees that the web is not instrumented). How to turn it off: It only turns on if `localStorage.getItem("minddy.trace") === "1"`, which is put on and off from the console without redeploying.

```ts
// lib/desktop/trace.ts — MIN-29x instrumentation. Off by default.
// Allumer : localStorage.setItem("minddy.trace","1") puis recharger.
// Clear   : ⌥⌘0 — the last 90 seconds are copied to the clipboard.
export function startDesktopTrace(): () => void {
  if (localStorage.getItem("minddy.trace") !== "1") return () => {};

  const ring: string[] = [];
  const t0 = performance.now();
  const log = (kind: string, detail: Record<string, unknown> = {}) => {
    ring.push(`${(performance.now() - t0).toFixed(1)} ${kind} ${JSON.stringify(detail)}`);
    if (ring.length > 4000) ring.shift();
  };

  // (a) Long frames. This is symptom (a), measured.
  const longtask = new PerformanceObserver((l) => {
    for (const e of l.getEntries()) log("longtask", { ms: Math.round(e.duration) });
  });
  longtask.observe({ type: "longtask", buffered: true });

  // (b) Input latency. A pointerdown whose `processingStart` arrives
  //     100 ms after the gesture is a frame lost BEFORE the logic;
  //     a pointerdown that NEVER appears means macOS swallowed it (B1).
  const evt = new PerformanceObserver((l) => {
    for (const e of l.getEntries() as PerformanceEventTiming[]) {
      log("event", {
        name: e.name,
        delay: Math.round(e.processingStart - e.startTime),
        dur: Math.round(e.duration),
      });
    }
  });
  evt.observe({ type: "event", durationThreshold: 16 });

  // (c) THE question for symptom (b): was the surface UNMOUNTED?
  //     Radix portals its poppers as direct children of <body>.
  const SURF = '[data-radix-popper-content-wrapper],[data-slot$="-content"],[cmdk-root]';
  const surfaces = new MutationObserver((records) => {
    for (const r of records) {
      for (const n of r.addedNodes)
        if (n instanceof Element && n.matches?.(SURF)) log("surface+", { id: n.getAttribute("id") });
      for (const n of r.removedNodes)
        if (n instanceof Element && n.matches?.(SURF)) log("surface-", { id: n.getAttribute("id") });
    }
  });
  surfaces.observe(document.body, { childList: true });

  // (d) Window state and absence duration — the condition for A1/A3.
  let hiddenAt = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { hiddenAt = performance.now(); log("hidden"); }
    else log("visible", { awayMs: Math.round(performance.now() - hiddenAt) });
  });
  window.addEventListener("blur", () => log("win-blur"));
  window.addEventListener("focus", () => log("win-focus"));

  // (e) The bridge, on the page side: what we request and what comes back.
  //     Add this INSIDE pushToBridge and the useWindowButtonsSlot subscription
  //     (lib/use-window-buttons.ts:57-63 et :319-323) via window.__minddyTrace.
  (window as any).__minddyTrace = log;

  const dump = (e: KeyboardEvent) => {
    if (!(e.altKey && e.metaKey && e.code === "Digit0")) return;
    const text = ring.join("\n");
    void navigator.clipboard.writeText(text);   // clipboard-sanitized-write
    console.log(text);                          // and in the console, just in case
  };
  window.addEventListener("keydown", dump);

  return () => {
    longtask.disconnect(); evt.disconnect(); surfaces.disconnect();
    window.removeEventListener("keydown", dump);
  };
}
```

Two one-line instruments to be installed at the same time, otherwise the trace doesn't say much:

```ts
// lib/realtime-provider.tsx:620, at the start of catchUp
(window as any).__minddyTrace?.("catchUp", { n: keys.length, cache: queryClient.getQueryCache().getAll().length });

// lib/use-window-buttons.ts:59 (send) and :320 (receive)
(window as any).__minddyTrace?.("bridge>", { visible: holds.size === 0 });
(window as any).__minddyTrace?.("bridge<", { next, settling, modal });
```

**What we read in the dump.** Symptom (b) is read on three consecutive lines: `surface+` … `surface-` … `surface+` less than 200 ms apart. If a `longtask` of more than 50 ms separates them, it is a lost frame and the symptom is in fact (a). If there is **nothing** in between, it's a state toggle — and the line just before says which one (`bridge<`, `catchUp`, `visible`). Symptom (a) reads as a line `catchUp` followed by a `longtask`: the `cache` field tells how many queries were searched, and its growth from one day to the next is proof of A1. A `event` with `delay` raised without `longtask` in front points to the browser process (§3.2). A `pointerdown` which is missing even though we clicked correctly is B1.

### 3.2 The main side bridge log, with the clocks of the two processes

The renderer does not see what the browser process is doing. A `console.log` in the main output on the stdout of the terminal which launched the shell (and in `Console.app` for the installed app): it's sufficient, and it survives everything.

```ts
// desktop/src/main.ts, at the start of applyWindowButtons (l.59) and publishWindowButtons (l.88)
const T0 = Date.now();
const trace = (kind: string, d: unknown = {}) =>
  process.env.MINDDY_TRACE && console.log(`[trace] ${Date.now() - T0} ${kind}`, d);
```

To be asked on four points, no more: `applyWindowButtons` (with `wantsWindowButtons` and `isFullScreen()`), `publishWindowButtons` (with the value), `did-start-navigation` ([:303](desktop/src/main.ts)), and the three `show()` ([:363](desktop/src/main.ts), [:502](desktop/src/main.ts), [:562](desktop/src/main.ts)). Add the two window events that the page cannot know about and which tell the occlusion and sleep state:

```ts
window.on("show",  () => trace("win:show",  { visible: window.isVisible() }));
window.on("hide",  () => trace("win:hide"));
window.on("blur",  () => trace("win:blur"));
// Sleep and screen locking: the most frequent cause of A2.
powerMonitor.on("suspend",     () => trace("power:suspend"));
powerMonitor.on("resume",      () => trace("power:resume"));
powerMonitor.on("lock-screen", () => trace("power:lock"));
```

**The signature of C (lost lights)**: two lines `applyWindowButtons` a few milliseconds apart just after `did-start-navigation`, the first at `true`, the second at `false` — the second is the dead document message. Without this log we cannot distinguish it from an omission of the page.

### 3.3 The demonstration of B3, in thirty seconds

The fault does not reproduce manually because the IPC round trip is 2 to 4 ms at rest. **We widen the run window**: wrap the `publishWindowButtons(...)` call of [desktop/src/main.ts:84](desktop/src/main.ts) in a `setTimeout(..., 250)`, then open and close a dialog quickly. If the startle becomes systematic and disappears by removing the `setTimeout`, the mechanism is demonstrated. **This is the demo, not the fix** — the actual budget to beat is ~200ms, not 100: `modalOpen` tracks the presence of the node in the DOM ([lib/use-window-buttons.ts:162-167](lib/use-window-buttons.ts)) and the Radix veil remains mounted until `animationend` (`duration-100 data-closed:animate-out`, `node_modules/mangue-ui/src/components/ui/dialog.tsx:89`).

### 3.4 The A/B that exonerates B1 in one minute

In the Electron window inspector (`--remote-debugging-port=9222`, recipe in §5 of the first pass), remove the `data-desktop-app` attribute from `<html>`: the four blocks of [app/globals.css:1684-1810](app/globals.css) fall suddenly, the window becomes immobile for the duration of the test. Then repeat the faulty gesture — brush the rail from one side to the other and immediately click in the header, a hundred times — with the `event` counter in §3.1 on. If the number of `pointerdown` recorded finally reaches the number of clicks made, B1 is demonstrated. ⚠ Only one heavy process at a time on this Mac.

### 3.5 The line to measure before believing A1

A command in the console, twice: when launching the app, then in the evening.

```js
queryClient.getQueryCache().getAll().length   // N, le multiplicande
localStorage.getItem("minddy.query-cache")?.length
```

If N does not move by a significant factor over a day, A1 loses its “accumulation” half and goes back down a notch.

---

## 4. The plan

### (a) Do it blind — the fix is ​​good either way

1. **`catchUp` in a single run** ([lib/realtime-provider.tsx:620-631](lib/realtime-provider.tsx)), via `invalidateQueries({ predicate })`. Identical coverage, active and inactive included. Close A1 and prepare A2.
2. **Coalesce catch-ups per channel** ([:664-677](lib/realtime-provider.tsx)) in a queue at the provider level, **separate** from `timers`. Farm A2.
3. **Duration floor on `shouldCatchUpOnResume`** ([lib/realtime-resume.ts:55](lib/realtime-resume.ts)): a socket momentarily disconnected during a backoff does not justify an invalidation of all perimeters. It doesn't dig any fresh holes - a channel that fell and then rejoined already catches up with its own perimeter ([lib/realtime-provider.tsx:664-669](lib/realtime-provider.tsx)) - but **write it in the comment**, otherwise the next reader will undo it.
4. **Sequence number on button protocol** ([lib/use-window-buttons.ts:319-323](lib/use-window-buttons.ts)) and **targeted response** to `minddy:window-buttons-ready` ([desktop/src/main.ts:359](desktop/src/main.ts)). Farm B3 and his second victim.
5. **`pushToBridge()` unconditional at mount**, at the root layout level, plus `appliedButtons = null` in `did-start-navigation` if we do the native deduplication of C3 (first pass). Closes C. Verifiable in one command: `open 'minddy://open?next=/'` rail folded.
6. **`SidebarRow`: `<Tooltip>` unconditional** ([components/app-sidebar.tsx:303](components/app-sidebar.tsx)) + keep `relatedTarget === null` on `onBlurCapture` ([:840](components/app-sidebar.tsx)). Closes B2, and fixes a loss of keyboard focus after each click in the bar.
7. **Disarm `watchPointerReturn` in `openRail`** and connect the fallback to `blur` / `visibilitychange`, never to a timer ([:696-702](components/app-sidebar.tsx), [:730-742](components/app-sidebar.tsx)).
8. **The two `drag` sockets placed on animated rectangles** ([app/globals.css:1739-1740](app/globals.css) and [:1782](app/globals.css)): the fixed strip already covers the same 60 px with a rectangle that never moves. He is the safe half of B1.
9. **Install the instrumentation in §3**, off by default. This is what makes the sequel possible.

Everyone is independent. None require prior action. **None are guaranteed to close the symptom** — that's the honest difference with the first pass.

### (b) To do only with a trace

- **Lighten global `no-drag` digging** ([app/globals.css:1710-1731](app/globals.css)) — the second half of B1. The patch changes a product security invariant that comment [:1699-1709](app/globals.css) describes in black and white, and which was paid for by auditing MIN-292 on six screens. First, §3.4 must have shown missing `pointerdown`.
- **A3, purging the hidden window.** Nothing to correct until §3.1 (d) showed a systematically larger `longtask` after a long absence than after a short absence. And the one obvious "fix" — making the red light actually turn off — is out of the question: it would kill desktop notifications.
- **The second weighing of A1**: if §3.5 shows a `N` which does not increase, gesture (a).1 remains good but its gain is small, and the track moves.

---

## 5. What was discarded

### False — the code says otherwise

- **“`backgroundThrottling` lets the socket die in the background. »** [desktop/src/main.ts:272-275](desktop/src/main.ts) logs a probe (MIN-290) that **measured** the Supabase WebSocket surviving seven minutes in the background with throttling active. Writing the inverse without a new measurement is like undoing an adjustment based on an assumption.
- **“Real-time catch-up flashes surfaces by toggling loading states. »** `catchUp` invalidates queries which **have** their data: in react-query v5, `isPending` remains false, only `isFetching` switches. And the repository **requires** that the loading UI reads `isPending` ([lib/query-loading.test.ts](lib/query-loading.test.ts), which iterates through `app/`, `components/` and `lib/`). A grep on the entire repository only renders two uses of `isFetching`, only one of which is rendered ([components/feedback/feedback-participants-group.tsx:124](components/feedback/feedback-participants-group.tsx)), off-board. Nothing comes apart this way. There's still unnecessary network work — real waste, not the symptom.
- **“Freezing/thawing buttons causes popovers to flash. »** A popover is **deliberately** outside of `MODAL_SELECTOR` ([lib/use-window-buttons.ts:132-144](lib/use-window-buttons.ts)): it poses no reason and never toggles `modal`.
- **“The folding of the rail moves the anchor from any floating surface. »** In overlay mode — the only one where the rail exists — `flowWidth` remains constant at `COLLAPSED_WIDTH` ([components/app-sidebar.tsx:793](components/app-sidebar.tsx)) and the `aside` is `absolute … z-40` ([:854](components/app-sidebar.tsx)): **Nothing** outside the bar moves during collapse. The comment [:783-792](components/app-sidebar.tsx) already says this.
- **“The mark translates for 320 ms at each switch. »** The rule is `[data-window-buttons-ready]:not([data-rail])` ([app/globals.css:1802-1806](app/globals.css)) and `data-rail` is set as soon as the bar is in rail or zen mode ([components/app-sidebar.tsx:888](components/app-sidebar.tsx)): on the secondary bar pages, the transition is **disabled**.
- **Anything that relies on the header being 68 px.** `HeaderWindowButtonsSlot` only renders something **under** 1200 px ([components/desktop-window-buttons.tsx:110-112](components/desktop-window-buttons.tsx), [lib/use-window-buttons.ts:213](lib/use-window-buttons.ts)). The default window is 1280 ([desktop/src/main.ts:228](desktop/src/main.ts)). On this post, this path is dead.
- **“The rail would close twice in a row due to loss of focus. »** As long as `focusWithin` is true, `collapsed` is false ([components/app-sidebar.tsx:753](components/app-sidebar.tsx)): the oscillation described is not achievable. B2's reassembly is real, its loop is not.
- **“Add a `pointerdown` to `document` to disarm the rail spotter. »** The fires are **native**: clicking on them does not emit any `pointerdown` in the page ([components/app-sidebar.tsx:705-711](components/app-sidebar.tsx) itself says so), and a `pointerdown` elsewhere is always preceded by a `pointermove`. The earpiece adds nothing.

### True, but **constant** — therefore out of scope here

All these defects exist, all deserve their correction, **none** can explain a rare symptom: they are paid for with each gesture or each frame, and the testimony says that the permanent mode is identical to the browser.

- **The global `no-drag` dig** ([app/globals.css:1710-1731](app/globals.css)) — the main thesis of the first pass. A cost proportional to the number of elements, paid at each layout: it would be felt all the time. Only his **freshness** (B1) remains in the race, and it's a different mechanism.
- **The 20 Radix dropdowns left in `modal`** (C1): `body{pointer-events:none}` at each opening *and* closing. Reproduces 100%, on demand.
- **The board not memorized** (P2), **`updateActiveColumn`** (C5), **the three contexts not memorized** (C6), **the sails `backdrop-filter`** (P3), **the mask on the scrollers** (P7), **the loop of the lasso** (P8), **`spellcheck: true`** (P6). Amplifiers, not triggers.
- **`applyWindowButtons` which resets the buttons without comparing** (C3, [desktop/src/main.ts:71-78](desktop/src/main.ts)): expensive each time the rail is hovered, therefore reproducible at will. To be corrected, but that's not it.

### True, native, but too rare for this symptom

- **The auto-updater** ([desktop/src/updater.ts:51](desktop/src/updater.ts), `autoDownload = true`, checks every six hours): the check is a YAML GET, negligible; the download would block the browser process, but the shell moves “twice a year” ([:9-10](desktop/src/updater.ts)). A frequency of the order of a year does not produce “frequent enough to be inconvenient to use”.
- **`setBadgeCount`** ([lib/use-desktop-notifications.ts:48-51](lib/use-desktop-notifications.ts)): an AppKit call on the UI thread of the browser process, but kept by `[unreadCount]`, so only when the number actually changes.
