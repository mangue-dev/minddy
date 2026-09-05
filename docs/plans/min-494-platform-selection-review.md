# MIN-494: Platform selection review

- [x] Replace native architecture selects with the application's `mangue-ui` Select.
- [x] Unify all five platforms and place the detected device first in a larger full-width card. Preserve state when card order changes; leave unsupported devices unfeatured.
- [x] Remove the plan footnote and desktop guide links. Keep inline mobile tutorials with a dedicated guide fallback.
- [x] Retire desktop guide pages and their sitemap, structured-data, and Markdown discovery entries; redirect former localized URLs to the download hub.
- [x] Verify platform detection, Select keyboard behavior, installer links, mobile prompts/guides, redirects, responsive themes, focused tests, lint, type checking, and the signed PR.

- [x] Replace the Windows logo with the upright four-square Windows 11 mark.

## Verification

88 tests passed across download interactions, public routes, SEO, and client translation boundaries. Focused lint, TypeScript, owned-English checks, and diff checks passed.

Browser checks covered mouse and keyboard Select changes, all five detected platforms plus an unsupported device across four widths, and six locales across three widths in both themes. No overflow was found. The detected platform occupies the full first row, without duplicating its card. Inline mobile guides remain functional.

All 18 former canonical desktop guide URLs returned permanent redirects to their localized download hub. Tests also cover all 15 former locale aliases. Removed routes are absent from public discovery and the sitemap; package download endpoints are unchanged.

## Cookie banner refinement

- [x] Apply the shared butter pastel surface, larger spacing, and equally prominent consent buttons in `components/cookie-banner.tsx`.
- [x] Preserve consent storage, analytics notification, desktop suppression, and the absolute localized policy URL.
- [x] Verify 36 viewport/locale/theme combinations, keyboard refusal, acceptance, dismissal, and persistence after reload. All three existing consent tests passed (91 targeted tests total for this review).
