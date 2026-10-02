# Parent issue actions (MIN-622)

The issue sidebar keeps the parent identifier before the current identifier on
one header row. Hover changes only the parent text from muted to foreground.
The parent menu provides navigation and an unlink action with confirmation.

- `out/parent-menu.png`: inline parent breadcrumb and its actions in light mode.
- `out/unlink-confirmation.png`: confirmation explains that both issues are kept.

Captured at 1440 × 1000 against the local development server using the Aurora
demo session. Browser response fixtures give AUR-2 a parent and intercept every
issue update; no demo issues are changed in the database.

Browser verification covered parent navigation, cancellation without a write,
disabled buttons during saving, failed-update retry, and successful unlinking
without closing the child sidebar. The 390 × 844 viewport was checked for an
inline breadcrumb, menu bounds, keyboard operation, and cancellation. Computed
styles confirmed that hover preserves the transparent background.
