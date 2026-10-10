# Pastel documentation article navigation

Previous article links use the existing sky tone from `CARD_TONES`; next article links use the mint tone. Each direction keeps its fixed color on every documentation article, without random selection. Both retain their pastel surface on hover, with a stronger border to indicate interaction. Direction labels inherit the card's text color at 80% opacity. Both tones also supply the existing dark-mode surface and text colors.

Light-mode captures of the French first-project article on the local development instance:

- [Desktop](desktop.png): 1280 × 720 viewport; the two links sit side by side.
- [Mobile](mobile.png): 390 × 844 viewport; the two links stack vertically.

Browser inspection confirmed the previous link's background is `rgb(230, 237, 245)` with text `rgb(41, 61, 86)`, and the next link's background is `rgb(224, 239, 232)` with text `rgb(30, 68, 54)`. Visual verification confirmed the distinct colors on desktop and mobile. Targeted oxlint, `npm run check:owned-english` and `git diff --check` pass.
