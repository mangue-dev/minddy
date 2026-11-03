# Accessibility

minddy targets [WCAG 2.2](https://www.w3.org/TR/WCAG22/) level AA in the
signed-in app, the auth screens and the public pages. The interface rules live
in [DESIGN.md](../DESIGN.md#accessibility); this page says how they are
checked. Automated checks catch regressions of
known patterns. They do not prove conformance: a change to a shared surface
also needs the manual pass below.

## Automated checks

| Check | What it holds |
| --- | --- |
| `lib/accessibility-contract.test.ts` | Accessible names come from the catalogs, errors that appear on their own have a role, images have an `alt`, the keyboard focus rule stays unlayered, framer-motion follows reduced motion |
| `components/app-shell.test.tsx` | The skip link comes before the top bar and the sidebar, and moves focus to `<main>` without writing a hash |
| `lib/keyboard-modality.test.ts` | Tab marks keyboard navigation and a pointer press clears it; field shortcuts reach the focused card and anchor their picker on it |
| `components/editor/document-editor.test.tsx` | Editing surfaces are named multi-line text boxes; read-only ones are not |
| `lib/theme-presets.test.ts` | Text and focus contrast in every palette, high-contrast boundaries |
| `lib/mobile-touch.test.ts` | Touch targets on coarse pointers, zoom left enabled in the viewport |
| `components/ui/button.test.tsx`, `components/ui/close-button.test.tsx` | Icon-only buttons name themselves |
| `lib/i18n-contract.test.ts` | Every catalog has the accessible-name keys |
| `lib/board-drag.test.ts`, `components/use-board-reorder-actions.test.tsx` | A card's menu moves it up, down or to the top of its column under manual sort, with the position a drop would write |
| `components/app-shell.test.tsx` | A navigation from the sidebar or the palette moves focus to `<main>`; one started in the content leaves it there |
| `components/notification-badge.test.tsx` | The unread count is spoken by one status that stays mounted, not by the badge |
| `components/ui/segmented-control.test.tsx` | The segmented control is a named radio group with one Tab stop and arrow keys |
| `lib/use-document-title.test.ts` | An open page names the browser tab and gives the route's title back when it closes |

jsdom computes neither layout nor color, so contrast, reflow and focus
visibility are checked in a browser.

## Manual pass

Run it on the surfaces a change touches, in light and dark mode.

1. **Keyboard.** From the address bar, Tab once: **Skip to content** appears;
   Enter moves to the page. Tab through the sidebar, the view and an open
   panel: every stop shows the ring outline, none is skipped or trapped, and
   Escape closes only the top layer. On a board, Enter opens a focused card
   and S, P, E or A opens that card's picker. Shift+F10 opens the card's
   menu; under manual sort its **Reorder** entry moves the card without a
   drag. After choosing a sidebar or palette destination, the next Tab
   lands in the new view.
2. **Screen reader.** VoiceOver with Safari on macOS, NVDA with Firefox or
   Chrome on Windows. Check the landmarks rotor (main navigation, main),
   that pickers read their value (“Status: In progress”), that editors read
   their name and “edit text, multi-line”, that a failed sign-in is spoken,
   that a page save failure is announced, that a Numo reply is announced
   once when it ends rather than token by token, and that a new unread
   notification is spoken once.
3. **Zoom and reflow.** Browser zoom at 200 % and a 320 px wide window: no
   text cut off, no horizontal scroll outside boards and tables, nothing
   hidden behind the bottom navigation.
4. **Motion and contrast.** With “Reduce motion” on, panels and dialogs
   appear without sliding. On the landing, the pause button on a looping
   figure stops every figure where it is. With a high-contrast palette, and with Windows
   forced colors, controls keep a visible edge and focus.

## Known gaps

Gaps found by an audit are tracked as issues, each with its WCAG criterion
and priority, not in this file. When a fix ships, add the check that holds it
to the table above.
