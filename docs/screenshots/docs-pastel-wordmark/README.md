# Documentation header pastel wordmark

The Docs header link uses the same letter palette and CSS animation as the minddy wordmark in the public navigation. Both now render their letters through `WordmarkLetters`, keeping their colors and letter indices consistent. The existing hover, keyboard focus and reduced-motion rules are shared without modification.

[Keyboard-focus capture](keyboard-focus.png) shows the French documentation welcome page at 1280 × 720 in light mode. Browser inspection confirmed that Docs starts in the foreground color, then displays sky, sage, peach and mint letters with animation progress `1` when focused through the keyboard. The link retains its accessible name and navigates to the localized documentation welcome page.

The public navigation was also checked on the French pricing page: the minddy wordmark retains its six original pastel letters when focused.

Validation: targeted oxlint, `npm run check:owned-english` and `git diff --check` pass.
