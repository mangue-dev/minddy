# Changelog illustration review (MIN-659)

These screenshots document the shared changelog cards, using the actual public
catalog for versions 0.11.0 and 0.11.1. They are PR evidence, not runtime assets.

- `changelog-release-light.webp`: all thirteen 0.11.0 cards in light mode.
- `changelog-release-dark.webp`: the same release in dark mode.
- `changelog-current-light.webp`: all eight 0.11.1 cards in light mode.
- `changelog-mobile-fr.webp`: the French public page at 390 × 844.

Desktop release crops come from a 1440 × 1100 browser. The sticky marketing
header and development overlay are hidden for the release crops so they do not
cover the cards. The mobile viewport keeps the real header. All WebP files are
lossless conversions of browser screenshots with reduced motion enabled.

Browser checks covered overflow in all six locales at 390 px, French at 320 px,
light/dark desktop artwork, and opening/closing native feature details by click
and keyboard. Published content, translations, and feature anchors remain
unchanged. No account or production database writes were needed for the review.
