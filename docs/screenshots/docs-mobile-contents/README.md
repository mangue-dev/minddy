# Mobile documentation contents touch targets

The collapsible table of contents now gives every link a minimum height of 48 CSS pixels, matching its existing 48-pixel trigger. Wrapped titles can grow naturally. The fixed desktop list keeps its original padding and 28-pixel single-line links from the `xl` breakpoint onward.

The 48-pixel target exceeds the 44 × 44 CSS-pixel size in [WCAG 2.2 SC 2.5.5, Target Size (Enhanced)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced).

Light-mode captures of the French installation article on the local development instance:

- `mobile-390.png`: 390 × 844 viewport; all 13 links measure 48–64 pixels high and 340 pixels wide.
- `mobile-320.png`: 320 × 568 viewport; all 13 links measure 48–64 pixels high. The last link remains reachable by scrolling the menu.

Browser verification confirmed that choosing a link updates the fragment, navigates to the section and closes the menu. At 1440 × 900, the desktop “Verify the release” link remains 28 pixels high with 4 pixels of vertical padding on each side.

Validation: all three existing `documentation-contents.test.tsx` tests pass; targeted oxlint, `npm run check:owned-english` and `git diff --check` pass.
