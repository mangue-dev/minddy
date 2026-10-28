# Minddy interface design guide

The single reference for anyone, person or agent, who changes Minddy's
interface: the visual direction, the tokens and components to build with, and
the rules every screen follows. Read it before an interface change and update
it in the same change when a rule moves.

Primitives live in `components/ui/` and design tokens in `app/tokens.css`
(imported by `app/globals.css`, with palettes in `app/theme-presets.css`). The
"UI components" section of `AGENTS.md` explains how to change a primitive. UI
mock-ups for the core surfaces are in `assets/figma/`; follow them closely
when redesigning those surfaces.

## Direction

- **Simplicity is the product.** Fewer controls, fewer words, one obvious way
  to do each thing. A new option, panel or badge has to earn its place against
  the calm of the screen around it.
- **Content first, chrome second.** Issues, pages and conversations sit on a
  white (or near-black) floating pane; navigation lives on the quieter
  sidebar chrome around it. Decoration never competes with the work.
- **Restraint in type and color.** Hierarchy comes from size, weight and
  spacing, not from color. The primary color is ink (near-black in light
  mode, near-white in dark mode); the brand blue (`brand`) marks identity and
  a few indicators, not every button.
- **Details never move the layout.** Hover states, loading and
  disclosures appear in place without shifting what the reader is looking at.
- **Every gesture has one home.** A command lives in the place where it acts,
  is reachable from the command palette, and shows its keyboard shortcut where
  it is offered.

## Tokens and color

Use semantic Tailwind utilities generated from the tokens; raw hex, `oklch()`
or Tailwind palette colors (`bg-blue-500`) belong only in the token files,
where `lib/theme-presets.test.ts` measures their contrast.

| Need | Use |
| --- | --- |
| Page and text | `bg-background`, `text-foreground`, `text-muted-foreground`, `text-tertiary` |
| Borderless controls (inputs, selects, outline buttons, chips) | `bg-control`, `hover:bg-control-hover` |
| Cards and raised or sunken areas | `bg-card`, `bg-surface-raised`, `bg-surface-sunken` |
| Status surfaces | `bg-surface-info`, `-success`, `-warning`, `-danger` |
| Identity accent | `bg-brand`, `text-brand`, `text-brand-foreground` |
| Danger | `text-destructive`, `bg-destructive-surface`, `bg-destructive-button` |
| Lines | `border-border`, `border-border-subtle` |
| Page and mention palettes | named attributes such as `data-page-text="blue"` |

- **Modes.** Light, dark or system, saved to the account and applied before
  first paint (`lib/account-theme.ts`, `components/theme-init-script.tsx`).
  Style dark mode with the `dark:` variant only when a token cannot express
  the difference.
- **Palettes.** Each mode has its own palette (`lib/theme-presets.ts`). Accent
  palettes change only `primary`, `ring` and the sidebar accent; full palettes
  (Solarized, Catppuccin, Nord) recolor neutrals, text, borders and primary.
  Status, priority, destructive, project and mention colors never change with
  the palette, so never encode meaning in a token a palette recolors.
- **High contrast** adds borders to controls, edges to floating surfaces and a
  forced focus ring. Check a new surface in it.
- **Transparency.** Menus, popovers and `[data-floating-surface]` elements are
  frosted glass by default; `html[data-transparency="off"]` (and high
  contrast) makes them opaque. Mark a new floating surface with
  `data-floating-surface` rather than styling its blur by hand.

## Type, shape and spacing

- **Fonts.** Inter for interface text (sans, mono and display all resolve to
  it); Instrument Serif for the rare editorial accent; `--font-kbd` for key
  caps. Extra sizes: `text-2xs` (10px), `text-3xs` (11px), `text-md` (13px).
  Settings page titles use `text-2xl font-display`.
- **Radius.** `--radius` is 1rem and the scale is relative to it (`rounded-sm`
  to `rounded-4xl`); note that `rounded-md` is 14px here, not Tailwind's 6px.
  Buttons are pills (`rounded-full`). The floating content pane and the modals
  that mirror it use `--app-pane-radius`. Nested shapes keep concentric radii
  (`components/entity-pill.tsx`).
- **Spacing tokens.** `h-header` (60px), `w-sidebar` (256px), `size-icon`
  (16px) and the dialog sizes `--spacing-dialog-w/h`. There are no custom
  shadow tokens: use `shadow-sm`, `shadow-md` or `shadow-lg`.
- **Cursor.** The default arrow everywhere, never the pointer hand (MIN-587);
  text fields, drag handles and disabled controls keep their own cursor.

## Layout and responsive surfaces

- **Two layouts, not widths.** App chrome follows `html[data-app-layout]`
  (`lib/app-layout.ts`): use the `app-mobile:` and `app-desktop:` variants.
  The choice weighs width (desktop from 1024px, 1200px in portrait), the
  shorter side of phones, touch and orientation. Plain width breakpoints
  (`desktop:` 1024px, `wide:` 1200px) are for content grids only.
- **Surfaces adapt, callers don't.** `Dialog`, `AlertDialog` and `SidePanel`
  become bottom sheets on phones; `ResponsivePopover` is a popover on desktop
  and a sheet on mobile; `DropdownMenu` submenus become inline accordions
  below 768px. Use plain `Popover` only for a surface that must stay anchored
  on mobile.
- **Touch.** Under a coarse pointer, controls get a 44px hit area through the
  helpers in `components/ui/touch-target.ts` without changing how they look.
  Rows use `COARSE_ROW`. Hover-only affordances must also be reachable on
  touch (shown permanently or through a menu).
- **Safe areas and the mobile nav.** Respect the device insets the shell
  already pads, and keep fixed content above the mobile nav with
  `--mobile-nav-clearance` or `.dock-above-nav`.

## Components

Build with `components/ui/` and the shared app components before writing a new
one; a variant with different behavior gets its own name.

| Need | Component |
| --- | --- |
| Action | `Button` (`default`, `outline`, `ghost`, `destructive`, `link`; sizes `sm`, `default`, `lg`, `icon-sm`, `icon`, `icon-lg`) |
| Icon-only action | `IconButton` (ghost, requires `aria-label`) or `Button` with an icon size |
| Primary action with options | `SplitButton` |
| Exclusive choice of two to four | `SegmentedControl` |
| Field picker (status, assignee, category…) | `SearchSelect` / `SearchMultiSelect` (`components/search-select.tsx`) |
| Searchable single choice in a toolbar | `Combobox` |
| Property row in a side panel | `PropertyRow` and the fields in `components/issue-property-fields.tsx` |
| Small form in a modal | `FormDialog` (`components/form-dialog.tsx`) |
| Confirmation of a destructive action | `ConfirmDeleteDialog` |
| Other decision that blocks | `AlertDialog` |
| Larger task in a modal | `Dialog` |
| Detail next to a list | `SidePanel` |
| Anchored menu | `DropdownMenu`; right-click and `⋯` menus on objects: `IssueContextMenu` / `IssueActionsMenu` |
| Settings layout | `SettingsGroup`, `SettingsRow`, `SettingsListRow`, `SettingsEmpty` (`components/settings/settings-ui.tsx`) |
| Status, priority, effort marks | `StatusIndicator`, `PriorityIndicator`, `EffortIndicator` (`components/issue-indicators.tsx`) |
| Category or option color | `Dot` (`components/ui/color-dot.tsx`) |
| Label or count | `Badge` |
| Tooltip | `AppTooltip` (see below) |
| Key cap | `Kbd`, `KbdSequence` |
| Empty screen | `EmptyState`; illustrated: `EmptyScene` (`page` or `compact`) |
| Loading screen | the matching skeleton in `components/route-skeletons.tsx` |
| Notification | `toast` from `sonner` |

## Icons

- Hugeicons (`HugeiconsIcon` with `@hugeicons/core-free-icons`) is the icon
  set; render a mix of sources through `AppIcon` (`components/icon.tsx`). A
  few Lucide icons remain while the migration ends; don't add new ones.
- Sizes: `size-4` by default (buttons size their icons for you), `size-3.5` in
  small buttons and dense rows, `size-3` inside chips. Keep the stroke width
  the set uses.
- An icon never carries meaning alone: it has a visible label or a tooltip.

## Labels, tooltips and shortcuts

Every control is named, and every name is reachable without guessing.

- **Icon-only controls always have a tooltip** that says what the click does
  ("Copy link", "Close panel"), not what the icon is. The tooltip is the
  control's label: the same text as its `aria-label`.
  - A `Button` (or `IconButton`) with an icon size shows its `aria-label` as
    its tooltip automatically. Pass `tooltip` to show richer content, or
    `tooltip={false}` only when visible text next to the button already names
    it.
  - Any other icon-only control (a raw `<button>`, a link, an avatar, a color
    dot) is wrapped in `AppTooltip`.
- **Text that can be cut has a tooltip with the full text.** When a title,
  name or path is truncated (`truncate`, `line-clamp-*`), use
  `TruncatedText` (`components/ui/truncated-text.tsx`), which shows the full
  text in a tooltip only when it is actually cut.
- **Shortcuts are shown where the action lives.** When a keyboard shortcut
  performs the same action, the tooltip includes it as key caps: pass
  `shortcut={["⌘", "K"]}` to `Button` or `AppTooltip` (resolve ⌘ or Ctrl with
  `useModKey()`). `Kbd` hides itself in the mobile layout.
- **Never use the native `title` attribute** for a tooltip: it is slow, can't
  show key caps, and ignores the theme. Use `AppTooltip`.
- The default close cross of `Dialog`, `Sheet` and `SidePanel` is
  `CloseButton` (`components/ui/close-button.tsx`): localized name, Esc in its
  tooltip. Reuse it for a custom close button rather than redrawing one.
- Tooltips open on hover and on keyboard focus only (`lib/tooltip-focus.ts`);
  they never hold essential information that a touch user can't reach
  another way.

## Destructive actions ask first

No gesture removes data, access or a working link in a single click. Every
action that moves something to the trash, deletes it, revokes it, unlinks it,
or takes someone out of a project opens a confirmation dialog before anything
is sent to the server.

- **One component.** Use `ConfirmDeleteDialog`
  (`components/ui/confirm-delete-dialog.tsx`). It is an alert dialog: a click
  outside does not dismiss it, the confirm button carries the destructive
  style, and both button labels are required so neither falls back to an
  untranslated default. Do not use `window.confirm` or a plain `Dialog`.
- **Name the target.** The title says what goes: `Move “{title}” to the
  trash?`, `Remove {name} from the project?`, `Delete 3 options from
  “Status”?`. Use a count when the action covers a selection.
- **Say whether it comes back.** The description states the outcome:
  - trash: restorable for `TRASH_RETENTION_DAYS` days, from the trash;
  - relink or re-invite: what stays and how to undo it;
  - permanent: "This can't be undone."
- **Confirm the action, not the entry point.** Context menus, `⋯` menus,
  command palette rows, bulk actions and settings buttons all reach the same
  dialog. A menu item or palette row only names the target; the mutation runs
  in the dialog's `onConfirm`. Keep that state in the shared hook or provider
  when several surfaces trigger the action (`usePageDocumentMenu`,
  `PrUnlinkConfirmationProvider`, `RoutineTrashDialog`).
- **Keyboard shortcuts** must not delete directly. If one is added, it opens
  the same dialog.
- **Errors keep the dialog honest.** For an action that can fail and is worth
  retrying, pass `closeOnConfirm={false}` and close the dialog only on
  success.

Exceptions, which need no dialog:

- edits inside a rich-text editor that `⌘Z` restores (removing a block that
  holds a sub-page or database still confirms, because it trashes real pages);
- removing something not yet saved or sent (a draft attachment, a wizard
  invitee before the project exists);
- reversible toggles and navigation state (closing a tab, turning the
  feedback board off, removing an issue from a cycle, showing a hidden
  project again);
- automatic clean-up with no user gesture (discarding an empty draft page).

## Feedback, loading and empty states

- **Optimistic first.** Edits apply at once and reconcile with the server
  (`lib/optimistic/`); a failure rolls back and says so in a toast.
- **Toasts are plain.** One short sentence, no action button and no "Undo":
  recovery lives where the object went (the trash, history). Use
  `toast.success` for a completed gesture that left the screen, `toast.error`
  with the server's message for a failure, and nothing for a change the user
  can already see.
- **Loading.** Show the matching route skeleton, shaped like the real layout,
  and read React Query's `isPending`, never `isLoading`, so an empty state
  never flashes before data arrives (`lib/query-loading.test.ts`). Use
  `Spinner` inside the control that is working.
- **Empty states** say what the area is for and offer the one action that
  fills it. Don't render an empty frame just to say it is empty.

## Interaction

- **Keyboard.** Shortcuts are declared once in `lib/keyboard/shortcuts.ts`
  (the cheat sheet reads them) and use the `mod` token for ⌘ or Ctrl. Hover
  shortcuts act on the item under the pointer (`lib/keyboard/hover-keys.ts`).
  Single-letter shortcuts never fire while typing (`isTypingTarget`). Submit
  and send keys go through `components/send-shortcut.tsx`.
- **Command palette.** ⌘K is the hub for navigation and actions, including
  bulk actions on a selection. A new object action belongs in the shared menu
  actions so the palette, the context menu and the `⋯` menu stay identical.
- **Overlays.** Escape closes the topmost layer only (`lib/overlay-layers.ts`);
  a dialog or side panel stays open while a nested popover is used
  (`keepOverlayOpenForPopper`).
- **Motion.** Short and functional, with the shared springs in
  `lib/motion.ts`. `prefers-reduced-motion` stops animations globally; never
  rely on motion to convey state.
- **Selection.** Interface text is not selectable by default; content is
  (`select-text`, inputs and code).

## Copy

- Interface copy goes through `next-intl` in all six catalogs (`en`, `fr`,
  `de`, `es`, `it`, `pt-BR`); see the i18n section of `AGENTS.md`.
- Sentence case, short, in the user's words. Name the object, not the
  implementation. Use typographic quotes around names: “{name}”.
- In English an item of work is an "issue"; in French a "ticket".
- Show people by their display name (`lib/display-name.ts`), never a raw
  email.
- Never show prices in dollars inside the app: AI usage is a percentage of the
  plan's budget. Dollars appear only on the admin finance view.
- Marketing pages keep blocks short (8 to 16 words) and never cite keyboard
  shortcuts.
- **A placeholder says what to enter, never a sample value.** Ask the question
  the field answers or name what goes in it ("Which tasks are assigned to
  {name}?", "Your email address", "Address of the MCP server"), not an
  example of an answer (`you@example.com`, `https://example.com`, "e.g. …",
  `sk-…`, `#xxxxxx`). A sample reads like a value already typed and vanishes
  on the first keystroke. When a format, a default or an example really
  helps, put it in the hint under the field or in the validation message.
  Placeholders come from the catalogs, like every other visible string.

## Accessibility

- Every control has an accessible name; icon-only controls carry it in
  `aria-label` (`IconButton` requires it).
- Focus is visible from the keyboard; high contrast forces a focus ring.
- Text keeps 4.5:1 contrast and focus rings 3:1 in every palette (7:1 for
  high-contrast text), as `lib/theme-presets.test.ts` checks.
- Don't convey state by color alone: pair it with an icon, a label or a
  shape (status indicators do).

## Checks that enforce this guide

- `lib/theme-presets.test.ts`: palette contrast and high-contrast boundaries.
- `lib/mobile-touch.test.ts`, `lib/mobile-nav-clearance.test.ts`,
  `components/ui/responsive-surfaces.test.tsx`: touch targets and adaptive
  surfaces.
- `components/ui/button.test.tsx`, `components/ui/close-button.test.tsx`:
  icon-only buttons label themselves, and dialog crosses are localized.
- `lib/tooltip-focus.test.ts`, `lib/overlay-layers.test.ts`: tooltip focus and
  Escape ownership.
- `lib/query-loading.test.ts`: no empty-state flash while loading.
- `lib/i18n-contract.test.ts`: catalog parity and placeholders.
- `lib/placeholder-copy.test.ts`: input placeholders hold no sample values
  and no hardcoded strings.
- `lib/ui-components-ownership.test.ts`: the primitives stay owned here.
