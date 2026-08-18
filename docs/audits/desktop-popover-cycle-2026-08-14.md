# Third pass — the popover that opens, closes and opens

minddy desktop app (Electron 43 / macOS). Treat ONLY this symptom.
Complete `docs/audits/desktop-perf-2026-08-14.md` and `docs/audits/desktop-perf-intermittent-2026-08-14.md`.

**Verdict, in mind: I don't have a complete chain.** What this pass brings, and which was not in either of the previous two:

1. **The clock is not a repository constant.** Since `@radix-ui/react-popover@1.1.19`, closing a popover by outside click has been MOVED from `pointerdown` to `click` — so it falls on release, not on press. The deviation measured by the user, "barely 100 ms", is its own press duration, and it is the only clock in the system that is both within the correct range and **variable**.
2. This move creates a verifiable **order reversal**, whose repository has a named victim: surfaces whose `open` lives in a single-slot state.
3. A **new takedown mechanism, with a real trigger** — the previous two passes had only found loaded rifles without a trigger.
4. The missing link, named: **no repository path sets `open` to true within 100 ms.** The two families below close; none reopen on their own.

---

## 1. The least incomplete chain

**The gesture.** A field picker is open. We click on the button in the next field without having closed the first one.

**Link 1 — exterior closure is delayed until released.**
`@radix-ui/react-popover@1.1.19` passes `deferPointerDownOutside: true` to its forwarding layer (`…/react-popover/dist/index.mjs:239`). Its pinned dependency is `@radix-ui/react-dismissable-layer@1.1.15` (`react-popover/package.json:19`), which implements the option like this (`…/react-dismissable-layer/dist/index.mjs:260-267`): left button → we no longer emit `pointerDownOutside` when pressed, we register a single-use `click` listener on `document`. **The popover therefore only closes at `click`.**

**Link 2 — React dispatches BEFORE Radix, and it is verifiable.**
Next mounts the application on the entire document: `const appElement = document` (`node_modules/next/dist/client/app-index.js:33`, `hydrateRoot(appElement, …)` :302). The React delegate listeners are therefore placed on `document` **on hydration**. Radix's is placed on `document` **at `pointerdown`**, so later. At `click`, React goes first.

**Link 3 — the second pellet opens.**
`PopoverTrigger` dials `onOpenToggle` on its `onClick` (`react-popover/dist/index.mjs:96`). In the creation dialog, the opening is a SINGLE slot: `const [openPicker, setOpenPicker] = useState<ShortcutField | null>(null)` (`components/create-issue-dialog.tsx:158`), read by seven pickers (`:671-734`). The toggle therefore calls `onOpenChange(true)` → `setOpenPicker("priority")` (`:683`). **B is open, committed.**

**Link 4 — then the first closes, and it takes away the second.**
Radix's `click` listener follows. The `PopoverContentNonModal` guardrail only protects the trigger OF THE SAME popover: `const targetIsTrigger = context.triggerRef.current?.contains(target); if (targetIsTrigger) event.preventDefault();` (`react-popover/dist/index.mjs:193-195`). Target is B's trigger, not A's → no `preventDefault` → `onDismiss()` → A's `onOpenChange(false)` → **`setOpenPicker(null)` (`create-issue-dialog.tsx:672`) — B closes.**

**What closes**: the delayed return of A, who writes in the shared slot that B had just occupied.
**What reopens**: ⚠️ **the user's second click, and nothing else.** This is the missing link. Both mutations fall into the same `click` task; the browser doesn't paint between the two, so the appearance of B is probably **invisible**, and what the user then sees is not a blink but "it doesn't open". If his testimony describes three VISIBLE states, this channel is not his — and the recipe below says it in thirty seconds.

**What it fails**: It is identical in Chrome. The “it didn’t exist in the browser” filter is not crossed.

---

## 2. The reproduction recipe

Three gestures. The first gives the standard, the other two discriminate. Nothing to compile.

### A. The signature standard (10 s) — do FIRST

1. Open any picker (card status sticker).
2. Close it with `Escape`. **Look at the output**: the surface shrinks and fades over 100 ms (`duration-100 … data-closed:animate-out`, `node_modules/mangue-ui/src/components/ui/popover.tsx:39`).
3. Compare from memory to the observed blinking.

- **Output visible in the flashing** → CLOSE family: a `open` toggles. → gesture B.
- **Dry erase, no shrinkage, then fade in** → family DISASSEMBLY: the root `Popover` was destroyed, Radix's `Presence` with it. → gesture C.

This distinction eliminates half the field in ten seconds, and neither of the previous two passes had put it in the user's hands.

### B. Trigger the chain in §1 (20 s)

1. `⌘N` — “New ticket” dialog.
2. Click the **Status** button: the list opens.
3. **Without closing anything**, click the **Priority** button next to it.

- **If the channel is correct**: nothing remains open. You have to click Priority again to get it.
- **Otherwise**: the status list closes, the priority list remains open. Normal behavior, chain removed.

4. **The gesture that proves the clock**: repeat step 3 by **holding the button pressed for half a second** before releasing on the Priority pad. If the status list only disappears on **release**, `deferPointerDownOutside` is active and the default clock is the press duration — not a code constant. This is the only test in the report that measures something without an instrument.

### C. Trigger disassembly (§3, chain A)

1. On a board, launch an agent on a ticket: the animated halo appears on his card.
2. Open a field picker **on this card** (click on the status badge, or `S` hovering over it).
3. Do not touch anything, and wait for the halo to go out (end of the run, or a failed survey — it falls every 4 s).

- **If the channel is correct**: at the exact moment when the halo goes out, the picker **disappears suddenly**, without exit animation.
- **Otherwise**: the picker remains open while the halo goes out.

### D. The probe to let run (the fault does not come when called)

Exit the app (`⌘Q`), relaunch it from the Terminal — the single instance lock means that a flag added to an already open app is of no use:

```
/Applications/Minddy.app/Contents/MacOS/Minddy --remote-debugging-port=9222
```

then `http://localhost:9222` in Chrome, and in the renderer console:

```js
window.__log = []; const t0 = performance.now();
const log = (s) => { const l = `${(performance.now()-t0).toFixed(0)} ${s}`; window.__log.push(l); console.log(l); };
// CLOSE family: data-state toggles, the node does NOT leave the DOM
new MutationObserver(rs => { for (const r of rs) { const el = r.target;
  if (!(el instanceof Element)) continue;
  const slot = el.getAttribute("data-slot");
  if (!slot || !slot.endsWith("-content")) continue;
  log(`state ${slot} ${r.oldValue}→${el.getAttribute("data-state")}`);
}}).observe(document.body, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ["data-state"] });
// UNMOUNT family: the popper disappears without ever writing "closed"
new MutationObserver(rs => { for (const r of rs) {
  for (const n of r.removedNodes) if (n.nodeType === 1 && n.matches?.("[data-radix-popper-content-wrapper]")) log("popper −");
  for (const n of r.addedNodes)   if (n.nodeType === 1 && n.matches?.("[data-radix-popper-content-wrapper]")) log("popper +");
}}).observe(document.body, { childList: true });
```

When flashing: `copy(window.__log.slice(-40).join("\n"))`.
`open→closed→open` on the same `data-slot`, less than 100 ms apart = CLOSE family. `popper −` then `popper +` **without** line `state` = DISMONTAGE family.

⚠️ **Instrument fix, load-bearing.** Pass 2 observer (`§3.1 (c)`) listens to `childList` alone. However, Radix's `Presence` keeps the node UP during the 100 ms exit animation: closing followed by reopening in this window produces **no** `surface−`/`surface+`. He would have remained silent all day about exactly the fault he was looking for. The two observers are complementary, not substitutable — and `attributeOldValue` is mandatory, otherwise two transitions delivered in the same batch are both read at their final value.

---

## 3. The other channels retained

**HAS. `AgentBeam` without `keepMounted` on the ticket card — the only depot takedown that has a REAL trigger.**
`components/agent-beam.tsx:51` changes the TYPE of its root: `if (!active && !keepMounted) return <>{children}</>;` then `return <BorderBeam …>{children}</BorderBeam>` (`:52-62`). React disassembles and reassembles. Nine out of ten call sites pass `keepMounted` — `assistant-fab.tsx:85` (with the comment `:82-84`: "otherwise its entry animation would replay on each toggle"), `chat-input.tsx:790`, `scratchpad-editor.tsx:550`. **The tenth does not pass, and it is the one which envelops the largest subtree of the app**: `components/issue-card.tsx:1427`, which contains `IssueCardBody` (`:640`) and its six pickers (`:172, :212, :259, :372, :435, :494`). The prop doc documents the bug (`agent-beam.tsx:41-46`), and the calling site ignores it.
Detent: `agentActive` (`issue-card.tsx:950`) → `useContext(AgentActivityContext).working.has(id)` (`agent-activity-context.tsx:105-107`), powered by a poll at 4 s / 15 s (`:67-74`) **of which the `queryFn` swallows the errors**: `if (!res.ok) return { workingIssueIds: [], … }` (`:49-50`). A failed response is stored as a success with empty lists → all halos go out → all affected cards go up → the next poll restores → they go up again.
Firm: yes, dry, without exit animation. **Reopens: no** — `usePickerShell` (`components/search-select.tsx:151-158`) lives IN `IssueCardBody`.
Repro: gesture C.

**B. Root type switches to `tooltip` — loaded guns, no trigger (confirmed).**
`components/search-menu.tsx:169-178` (`if (!tooltip) return popover; return <Tooltip>{popover}…`), `components/date-time-picker.tsx:508-517`, plus `SidebarRow` (`app-sidebar.tsx:303`, read pass 2) and `FooterRow` (`app-sidebar.tsx:555`, missed by pass 2). Those of `search-menu` and `date-time-picker` are the only ones whose open state survives above (`usePickerShell` lives in `SearchSelect`, PARENT of `SearchMenu`): they would close AND reopen. But no repository caller varies `tooltip` at runtime. To be corrected for hygiene purposes, not as a cause.
Repro: none without making the trigger. Don't make a lead out of it.

**C. `AnimatePresence mode="wait"` on the bar nav (`app-sidebar.tsx:902-913`, `transitions.fade` = 150 ms) — noted by pass 3, not reopened here.**
Closes (150ms gap where neither nav exists), doesn't reopen anything. It is the repository constant closest to the testimony after `duration-100`, and the only one that describes a HOLE. If what's flashing is in the BAR and not a popover, that's where you should look first.
Repro: from the home page, hover over a nav line to activate its tooltip, then go to a project by `⌘K`. The nav is absent for 150 ms and the tooltip does not return.

---

## 4. Fixes

### Good anyway (stable structure, hoisted condition)

```tsx
// components/issue-card.tsx:1427 — the only AgentBeam in the repository without keepMounted.
- <AgentBeam active={agentActive} className="rounded-xl shadow-sm">
+ <AgentBeam active={agentActive} keepMounted className="rounded-xl shadow-sm">
```

```ts
// components/agent/agent-activity-context.tsx:49-50 — an error is not
// “no agent is working.” Propagate it: react-query then keeps the previous
// data instead of clearing all halos.
- if (!res.ok) return { workingIssueIds: [], sessionIssueIds: [], pullRequests: {} };
+ if (!res.ok) throw new Error(`agent-activity ${res.status}`);
```

```tsx
// components/search-menu.tsx:169-178 — one tree, one root type.
- if (!tooltip) return popover;
- return (<Tooltip>{popover}<TooltipContent …>…</TooltipContent></Tooltip>);
+ return (
+   <Tooltip open={tooltip ? undefined : false}>
+     {popover}
+     {tooltip && <TooltipContent className="flex items-center gap-1.5">{tooltip}{shortcutHint && <Kbd size="sm">{shortcutHint}</Kbd>}</TooltipContent>}
+   </Tooltip>
+ );
```
Same gesture on `components/date-time-picker.tsx:508-517` and on `FooterRow` (`app-sidebar.tsx:555-563`), with the form that pass 2 already prescribes for `SidebarRow` (`:303`) — a single pattern to learn in the repository. Do nothing on `components/issue-field-shortcuts.tsx:242-257`: the two branches never coexist (`if (!state) return null`, `:229`).

### Which are only justified if the chain of §1 is demonstrated

The unique slot `openPicker` (`create-issue-dialog.tsx:158`) must refuse to be handed over to `null` by a popover that is no longer the one that is open:

```tsx
// An onOpenChange(false) that arrives AFTER another picker has taken the slot
// is an echo, not a request. It is produced by the React → Radix ordering.
const setPickerOpen = (field: ShortcutField) => (o: boolean) =>
  setOpenPicker((cur) => (o ? field : cur === field ? null : cur));
…
onOpenChange={setPickerOpen("status")}   // :672, et les six autres
```

The general gesture applies to any single slot in the repository: **a closure only closes what it names.**

---

## 5. What was eliminated, and why

| Discarded | Reason, in one line |
| --- | --- |
| A lost frame, a tearing, a painting artifact | 100 ms = 12 frames at 120 Hz. It's a state cycle, not a frame. |
| **Window drag strip** (`app/globals.css:1681-1694`, `app/layout.tsx:167`) eating popover clicks | The Radix content carries `tabindex="-1"` (`@radix-ui/react-focus-scope/dist/index.mjs:127`), it therefore matches `[tabindex]` of the global digging (`app/globals.css:1711-1732`): its entire surface is `no-drag`. |
| A key duplicated by the shell | `desktop/src/main.ts` has neither `globalShortcut`, nor `before-input-event`, nor `sendInputEvent`; `lib/desktop/bridge.ts` only exposes four members, none input. |
| A refetch when the window returns pushing `agentActive` | `refetchOnWindowFocus: false` globally (`lib/query-provider.tsx:134`); and `["agent-active-issues"]` is neither in `USER_SCOPE_KEYS` (`lib/realtime-provider.tsx:481-491`) nor in `projectScopeKeys` (`:492-512`) — the catch-up does not affect it. Only the `refetchInterval` returns to visibility. |
| `TOOLTIP_DELAY_MS = 600`, `skipDelayDuration = 300`, `RAIL_CLOSE_DELAY_MS = 150`, `INVALIDATE_COALESCE_MS = 200`, `transitions.shell = 320 ms`, `DISCARD_DELAY_MS = 60`, `CLOSE_DELAY_MS = 140` (landing) | Outside window, or outside perimeter. Noted and discarded by pass 3, cross-checked here. None are worth 100. |
| `duration-100` as CAUSE | It is the clock of animation, not a mechanism: it explains the form and the duration, never what is based `open`. |
| The double `rAF` and IPC round trip of `use-window-buttons` | 8 to 10 ms, two orders of magnitude below target; and the rendering they cause does not descend into any floating surface carrier. |
| `ActionsPopover` (`lib/command-palette/components/ActionsPopover.tsx:247`, the only `setTimeout(…, 100)` client) | Complete cycle but non-existent trigger: `setPosition(null)` is only written when `isOpen` falls. Actual fault (hard delay as guard), not the symptom. |

---

## What is missing to know

Only one thing, and it's called precisely: **a path that writes `open = true` without a user gesture, within 100 ms of a close.** I looked for it in the only three possible sources — `onOpenToggle` from Radix (requires an actual `click` on the trigger), the `keydown` listeners (`components/create-issue-dialog.tsx:302-311`, `components/issue-field-shortcuts.tsx:150-154`, all guarded by a test target `INPUT`), and context menu entries (`openField`, `issue-field-shortcuts.tsx:176-180`). None leaves without an entry event.

There therefore remain two possibilities, and **it is probe §2.D which decides between them** — not one more reading:

- either the popover never CLOSES and it is a **reassembly** which replays the entry animation: the probe prints `popper −` / `popper +` without any line `state`, and you then have to look for which node was dismantled above (family B, today without a trigger, would therefore have acquired its own);
- either the cycle is real and the `true` comes from an input event that I was not able to model: the probe prints `open→closed→open`, and the line which precedes the `closed` names the surface, which is enough to go back to the bearer.

Without this trace, the next pass would start like this: reading just code, one file at a time.
