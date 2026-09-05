# MIN-494 — Final visual refinements

Continue on the existing branch and PR #133. This checklist tracks the second
visual review; the implementation tasks are also recorded on MIN-494.

- [x] Add 64 px of whitespace above the hero heading.
- [x] Restore uncropped, full screenshots across both bentos.
- [x] Make screenshots open a larger preview with close, Escape, focus return, and mobile support.
- [x] Fade both card faces in and out, preserving card height and reduced-motion support.
- [x] Remove the redundant command-palette plus control.
- [x] Reduce embedded dictation to a centered, unfilled microphone and a ticket preview.
- [x] Remove both dictation eyebrows and sample controls in the bento; preserve recording and error feedback.
- [x] Describe dictation as available wherever text can be entered, in all six locales.
- [x] Align the Numo icon explicitly to the card's left edge.
- [x] Add four existing MCP provider identities inline with agent logos, ending with a Layers icon and “And more…” to clarify that this is an excerpt.
- [x] Explain Minddy as an MCP server and Numo as an MCP client in the compatibility details.
- [x] Soften the hosting section background while preserving the two pastel cards.
- [x] Redesign pricing cards, recommendation badge, and monthly/yearly controls with the same pastel style.
- [x] Move the comparison link beside the pricing controls; consolidate supporting notes without duplicating the hosting story.
- [x] Keep the i dot fully round by allowing its ink to extend beyond the negative letter spacing.
- [x] Color the footer wordmark with coordinated pastels, use the first d’s light blue for both d letters, and give the complete i dot its own color.
- [x] Verify images, dialogs, transitions, accessibility, dictation, billing, translations, responsive themes, and focused checks; update the signed PR and Minddy issue.


## Verification outcome

- 120 tests passed across nine suites covering billing data, locale parity,
  message boundaries, public routes, SEO, screenshots, and dictation. The three
  locale/message suites passed again after the final “And more…” copy update.
- Focused Oxlint, TypeScript, owned-English checks, and `git diff --check` passed.
- All six locales passed geometry checks at 320, 390, 768, 1024, and 1440 px in
  light and dark themes: no horizontal overflow, no disclosure layout shifts,
  full-image containment, and aligned hosting cards.
- Both directions of the 240 ms disclosure crossfade were sampled in the browser;
  front/detail opacity changed progressively while height stayed constant.
  Reduced-motion and no-JavaScript disclosure behavior also passed.
- Image previews displayed the original 2208 px assets. Escape and the close
  button restored focus; body scrolling was restored and mobile previews fit
  the viewport at 320 and 390 px.
- Monthly/yearly prices and annual totals matched the billing model on both the
  landing and the dedicated pricing page. The interval selection exposes its
  pressed state, and switching back restores the original prices.
- The minimal dictation surface passed microphone denial, recording, stop,
  result, and restart checks with simulated audio and mocked API responses.
  No live microphone or transcription service was used; media tracks stopped.
- Desktop/mobile previews confirmed the Numo alignment, provider excerpt,
  pastel pricing, and the complete, independently colored i dot.

The changes are limited to marketing UI, six locale catalogs, and this checklist.
The existing signed PR is updated through `npm run work:pr`; MIN-494 is in review.
