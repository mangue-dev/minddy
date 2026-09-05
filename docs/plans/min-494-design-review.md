# MIN-494 — Design review checklist

Refine the existing landing redesign on `codex/min-494-landing-redesign` and PR
#133. The review asks for a consistent pastel card system, stronger screenshot
presentation, fewer repeated sections, and details that never move the layout.

- [x] Remove the hero eyebrow and its dot.
- [x] Remove the signup footnote below the primary CTA.
- [x] Remove the numbered caption below the hero screenshot; keep its colored frame.
- [x] Remove the separator between the hero and workspace section.
- [x] Stack every section title above its subtitle.
- [x] Remove workspace card numbers and disclosure dividers/visible labels.
- [x] Enlarge the plus control; switch it to a close icon while details are open.
- [x] Replace the front of each card with its details without changing card height.
- [x] Give long details their own keyboard-accessible scroll area with edge fades.
- [x] Enlarge screenshot areas and use a denser, readable workspace bento.
- [x] Move the command palette, task notebook, and dictation into the workspace bento.
- [x] Remove the separate speed section while preserving its existing anchors.
- [x] Embed the actual microphone demo directly in the dictation card, with no disclosure prerequisite.
- [x] Rebuild the agents section as an illustrated pastel bento with a clear reading order.
- [x] Remove the numbered issue-to-PR stepper and reduce visible agent prose.
- [x] Make sharing/import/integrations a full section with colored cards.
- [x] Explain sharing of both board views and wiki pages.
- [x] Replace public-API copy with integrations that create issues and feedback; retain CSV import.
- [x] Merge Cloud/self-hosting and open source into one rewritten section on a colored background.
- [x] Match the height and alignment of the Cloud and self-hosting cards.
- [x] Make the final CTA taller, with left-aligned content centered vertically.
- [x] Verify card geometry, focus, scrolling, microphone/sample/error states, all locales, responsive themes, lint, TypeScript, tests, and owned-English checks; update the DCO-signed PR and Minddy issue.

Primary files: `hero.tsx`, `feature-disclosure.tsx`, `section-workspace.tsx`,
`voice-demo.tsx`, `voice-demo-player.tsx`, `section-agents.tsx`, `section-more.tsx`,
`section-editions.tsx`, `section-cta.tsx` in `components/marketing/`, the marketing
page, and the six locale catalogs. Shared card colors and section headings may
be factored into small marketing-only components.

## Verification outcome

- Focused Oxlint, TypeScript, owned-English checks, and `git diff --check` passed.
- 107 tests passed in seven suites covering public routes, SEO, localized
  catalogs, public client messages, screenshot/download rendering, and dictation.
- Browser geometry checks passed for all six locales at 320, 390, 768, 1024,
  and 1440 px in both themes (60 configurations): no horizontal overflow,
  no card-height or neighboring-position changes, and equal hosting-card heights.
- Native disclosures retain their fixed height, hide the front face, and keep
  their 48 px toggle in place. Keyboard focus reaches the detail region;
  disclosure controls also work with JavaScript disabled.
- The embedded voice demo was exercised with microphone denial, a sample result,
  a rate-limit response, recording/stop/result, and restart. Audio input and API
  responses were simulated locally; no live microphone or transcription service
  was used. Media tracks stopped correctly, and desktop/mobile card heights
  remained stable through those states.
- Existing navigation anchors, signup/pricing links, localized screenshots, and
  Cloud/self-hosting destinations remain part of the page. Changes stay within
  marketing components, the landing composition, locale copy, and plan files.
