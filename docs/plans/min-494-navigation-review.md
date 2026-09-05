# MIN-494: Navigation and screenshot review

Refine the established landing style. The remaining marketing pages will receive their own design review later.

Reference: [Linear product navigation](https://linear.app/), inspected on September 5, 2026. Use its spacious text columns, restrained dividers, and resource strip as structural inspiration, with Minddy's pastel palette and destinations.

- [x] Remove the thumbnail expansion badge and display original screenshots in a frameless lightbox (`screenshot-preview.tsx`). Preserve Escape, focus restoration, and backdrop dismissal.
- [x] Rebuild `nav-product-menu.tsx` with grouped text links, concise descriptions in six catalogs, responsive positioning, and keyboard/hover interactions.
- [x] Route hero and desktop/mobile navbar primary actions to localized downloads; preserve account access. Point the overview link to `section-workspace.tsx`.
- [x] Verify responsive menus, localized links, lightbox appearance and keyboard behavior, focused lint, type checking, relevant tests, and the signed PR.

## Verification

- Focused Oxlint, TypeScript, owned-English checks, and `git diff --check` passed.
- 93 tests passed across public client messages, localized links, translation contracts/catalogs, public routes, and download platform actions.
- Six locales at 320, 768, 1024, 1280, and 1440 px passed overflow and localized destination checks; all ten menu destinations remain available.
- Desktop checks cover hover entry/crossing/exit, mouse click, outside dismissal, Enter, ArrowDown, Tab, Escape, and keyboard focus retention. Reduced motion and dark screenshots were checked.
- Lightboxes preserve image proportions, center on mobile, have transparent chrome, dismiss by backdrop/close/Escape, and return focus to the thumbnail. The light/dark original asset follows the system theme.
- Mobile drawers passed all six locales at 320 px: download and sign-in remain visible, the overview closes the drawer, and text does not overflow.
