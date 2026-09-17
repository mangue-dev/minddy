// ⇧P / ⇧A on a ticket SELECTION (MIN-539) outrank the per-card hover
// variants: while the selection pill is up, it is the current mode — the same
// precedence “@” follows (lib/ask-numo-context.tsx). The card and panel
// handlers (components/issue-field-shortcuts.tsx) consult
// `selectionKeysActive()` at keystroke time and stand down on Shift combos,
// so the ONE window listener of lib/use-bulk-selection-actions.ts owns the
// two combos wherever the pointer rests; with no selection, nothing changes.
//
// The gate is a counter rather than a boolean: two surfaces can coexist
// briefly during a route transition (the old board unmounting after the new
// one mounted), and each acquires for as long as ITS selection is non-empty —
// the gate stays up until every one of them released. Module state is the
// same trade hover-keys.ts already makes: the decision must happen at
// keystroke time, in the capture listener, not through a passive effect.

let owners = 0;

/** True while at least one surface holds a non-empty ticket selection. */
export function selectionKeysActive(): boolean {
  return owners > 0;
}

/**
 * Claims the ⇧P/⇧A ownership for one surface, for as long as its selection
 * is non-empty. Returns the release; calling it more than once is a no-op, so
 * a StrictMode double-effect cannot over-release.
 */
export function acquireSelectionKeys(): () => void {
  owners += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    owners -= 1;
  };
}
