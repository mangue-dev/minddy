/**
 * Finger comfort for the primitives (MIN-284), active only under a coarse
 * pointer: the mouse layout does not move by a pixel.
 *
 * Apple's and Google's guidelines ask for 44 px targets, and the primitives are
 * 20 to 40 px tall. Making the controls bigger would reflow every toolbar of a
 * dense interface, so the TARGET grows instead of the drawing: a `::after`
 * centered on the control, `max()`-sized so a control already wider than 44 px
 * keeps its width. The element must be a containing block (`relative` or any
 * other positioning).
 *
 * The assumed counterpart: two tight neighbors see their targets overlap, and
 * the last one in DOM order takes the press. 44 px that overlap a little beat
 * 32 px that miss.
 */
export const COARSE_HIT_AREA =
  "pointer-coarse:after:absolute pointer-coarse:after:top-1/2 pointer-coarse:after:left-1/2 pointer-coarse:after:-translate-1/2 pointer-coarse:after:w-[max(100%,44px)] pointer-coarse:after:h-[max(100%,44px)]"

/**
 * The 300 ms tap delay: a touch browser waits after a press to see whether a
 * double-tap (zoom) follows. On a control that does not zoom, `manipulation`
 * drops that wait and keeps scrolling and pinching.
 */
export const COARSE_TOUCH_ACTION = "pointer-coarse:touch-manipulation"

/**
 * List rows (menu items, select options, command items) cannot overflow onto
 * their neighbor, so they grow for real to 44 px: a list scrolls, a few more
 * pixels per row cost nothing.
 */
export const COARSE_ROW = "pointer-coarse:min-h-11 pointer-coarse:touch-manipulation"

/**
 * The same three behaviors for `Button`, keyed on `data-slot="button"`. A
 * button rendered through another primitive's `asChild` (`TooltipTrigger`,
 * `SidePanelClose`, `PopoverTrigger`…) takes that primitive's `data-slot`
 * instead and keeps its plain geometry (the sidebar and panel-header buttons
 * wrapped in a tooltip, for instance). Inline links (`variant="link"`) take
 * the inset form below instead, which stays close to their text. `Button`
 * needs a containing block for the hit area: `[data-slot="button"] {
 * position: relative }` lives in the base layer of app/tokens.css so a
 * positioning utility (`absolute`, `sticky`…) passed by a call site still
 * wins.
 */
export const COARSE_BUTTON_HIT_AREA =
  "data-[slot=button]:not-data-[variant=link]:pointer-coarse:after:absolute data-[slot=button]:not-data-[variant=link]:pointer-coarse:after:top-1/2 data-[slot=button]:not-data-[variant=link]:pointer-coarse:after:left-1/2 data-[slot=button]:not-data-[variant=link]:pointer-coarse:after:-translate-1/2 data-[slot=button]:not-data-[variant=link]:pointer-coarse:after:w-[max(100%,44px)] data-[slot=button]:not-data-[variant=link]:pointer-coarse:after:h-[max(100%,44px)]"

/**
 * Press feedback under a coarse pointer: hovering does not exist with a finger,
 * so a pressed control otherwise answers nothing until the screen changes. A 3%
 * depression registers the gesture without being seen. `scale` (the property)
 * leaves the `transform` that other utilities write untouched. A control that
 * is `:disabled`, or rendered as a link with `aria-disabled`, does not move.
 */
export const COARSE_BUTTON_PRESS =
  "data-[slot=button]:not-data-[variant=link]:pointer-coarse:motion-safe:not-disabled:not-aria-disabled:active:[scale:0.97]"
export const COARSE_BUTTON_TOUCH_ACTION = "data-[slot=button]:pointer-coarse:touch-manipulation"

/**
 * The wider, inset-based variant (48 px): the target grows by the same margin
 * on every side of a control smaller than 48 px. Used by inline-link buttons,
 * select triggers and dialog-close controls; the button form is keyed on
 * `data-slot="button"` like the ones above.
 */
export const COARSE_INSET_HIT_AREA =
  "pointer-coarse:after:absolute pointer-coarse:after:inset-[min(0px,calc((100%_-_48px)*0.5))]"
export const COARSE_BUTTON_INSET_HIT_AREA =
  "data-[slot=button]:pointer-coarse:after:absolute data-[slot=button]:pointer-coarse:after:inset-[min(0px,calc((100%_-_48px)*0.5))]"
