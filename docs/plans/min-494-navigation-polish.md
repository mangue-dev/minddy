# MIN-494 navigation polish

Continue PR #133 on `codex/min-494-landing-redesign`.

- [x] Use lowercase minddy in the download H1 across all six locales.
- [x] Make the landing hero download action pill-shaped.
- [x] Keep the Product panel corners concentric: the outer radius is the inner
  radius plus 8 px padding and a 1 px border (29 px and 20 px with this theme).
- [x] Color the navbar wordmark using the footer palette, with one green i.
  A shared 350 ms CSS progress value drives 150 ms letter fades staggered by
  40 ms. Reversing hover preserves the current progress in either direction.
  Keyboard focus also activates the effect; reduced motion removes the delay.
- [x] Review Linear's mobile navigation at <https://linear.app/>. Replace the
  icon/description rows with spacious text links and a clear product group.
  The sidebar fills narrow screens and becomes 416 px wide on tablets. Keep
  its central navigation scrollable and its download/account actions fixed.
- [x] Use the Sheet trigger for dialog semantics and focus return, localize the
  close control, autofocus inside, preserve focus trapping and backdrop/Escape
  dismissal, and close/unlock the sidebar when resizing to desktop.

## Validation

- 91 tests passed across locale parity, translated messages, public client
  message boundaries, download interactions, and localized links.
- Focused Oxlint, TypeScript, owned-English, and `git diff --check` passed.
- Browser checks passed for six locales at 320, 390, and 768 px in both themes
  (36 configurations). Checked all 15 sidebar links, localized destinations,
  background scroll lock, focus entry/return, and fixed footer visibility.
- Verified all six localized download H1s, Escape/close/backdrop dismissal,
  keyboard focus trapping, anchor navigation, and desktop breakpoint cleanup.
- Checked partial wordmark fill, interruption while filling and fading,
  completion, persistent hover, complete fade-out, reduced motion, and exact
  footer RGB colors. Visually reviewed the wordmark and Product panel.
- Verified Product radii from computed geometry, ArrowDown/Escape navigation,
  and the hero pill radius. Reviewed the sidebar in dark mode and at 320×568,
  where the link list scrolls while the footer remains visible.
- Scope is limited to marketing components, their CSS, six locale catalogs,
  and this checklist. No generated artifacts, dependencies, migrations,
  deployment configuration, or excluded source paths are changed.
