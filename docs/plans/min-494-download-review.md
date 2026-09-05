# MIN-494: Download page expansion

The download page is the next step after the landing's desktop CTA. Extend the same sans-serif typography, stacked headings, spacious layout, and shared pastel card tones. Platform cards are inspired by the direct platform selection on [OpenBot](https://openbot.run/), inspected September 5, 2026.

- [x] Keep the landing hero actions below its subtitle at all widths.
- [x] Replace `download-platform-cta.tsx` with `download-platform-cards.tsx`: three desktop cards and two mobile cards, architecture selection, tracked package downloads, Windows Store access, and native mobile installation or a guide fallback.
- [x] Rebuild `app/(marketing)/download/page.tsx`: no eyebrow, serif accent, isometric art, or duplicate platform navigation; move release information and guide links into their platform cards and present app benefits in a screenshot bento.
- [x] Restyle `mobile-pwa-install-guide.tsx` and update six Download catalogs, preserving instructional content and platform behavior.
- [x] Update download interaction tests and verify package URLs, architecture changes, native prompt/fallback, localized guides, responsive themes, hero stacking, focused lint/typecheck/tests, owned English, and the signed PR.

## Verification

- 95 tests passed across download cards/mobile guides, public routes, localized links, catalog contracts, and public client messages. Installer tests cover both Mac architectures, all six Linux packages, Store access, one-shot Android prompting, and guide fallback.
- Focused Oxlint, TypeScript, owned-English checks, and `git diff --check` passed.
- Browser checks passed for six locales at 320, 390, 768, 1024, and 1440 px in both themes (60 configurations), without page or card-control overflow.
- Verified architecture-dependent URLs, inline iOS/Android guide switching, original screenshot presentation, and the landing hero's stacked actions at 390, 1440, and 1920 px.
- Android prompting was simulated in an Android browser context; no real installation was initiated. Server-rendered cards, default package links, and dedicated mobile guide fallbacks remain available without JavaScript.
- Release version and package size continue to come from cached feeds and now match the selected architecture. No installer, API, billing, or deployment configuration changed.
