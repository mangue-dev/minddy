# MIN-494 — Landing page redesign

The current landing repeats large feature sections, pairs serif and sans-serif
headlines, and places an illustration beside the hero. Replace it with a quieter,
product-led layout: a full-width header, a real localized screenshot below the
headline, and colored cards with progressive disclosure.

References reviewed: [OpenBot](https://openbot.run/) for the generous hero and
product preview; [Linear](https://linear.app/) for the restrained typography,
section hierarchy, and expandable feature details. Keep Minddy's own colors,
product screenshots, and Cloud/open-source positioning.

- [x] Inspect the marketing components, translations, screenshot catalog, and references; create `codex/min-494-landing-redesign` from refreshed `origin/main`.
- [x] Rebuild `Hero` in `components/marketing/hero.tsx` around `ScreenshotSlot`, and replace the floating header in `components/marketing/marketing-nav.tsx`; update the shared layout's obsolete comments.
- [x] Add `components/marketing/feature-disclosure.tsx` and `section-workspace.tsx` for colored, accessible product cards; reorganize `app/(marketing)/page.tsx` around the product tour, agents, speed, and hosting choice.
- [x] Simplify `section-agents.tsx`, `section-speed.tsx`, `section-more.tsx`, and the closing CTA; preserve navigation anchors, translated content, real screenshots, agent compatibility, and the voice demo.
- [x] Verify desktop/mobile layouts, light/dark screenshots, keyboard disclosure and mobile navigation, localized links, and reduced-motion behavior. Run focused lint, type checking, relevant tests, the owned-English check, and `git diff --check`.
- [x] Review the scoped diff and prepare the DCO-signed pull request handoff.

The completed plan and verification outcome are also synchronized to MIN-494
through the Minddy MCP tools. PR #133 is linked, and the issue is in review.

## Verification outcome

- Focused Oxlint checks and `npm run typecheck` passed.
- `npm run check:owned-english` and `git diff --check` passed.
- 98 tests passed across public routes, locale parity, translated messages,
  public client message boundaries, SEO, and download/screenshot rendering.
- Browser checks covered English, French, German, Spanish, Italian, and Brazilian
  Portuguese at 320, 768, 1024, and 1440 px, with no horizontal overflow.
- French desktop and mobile previews were inspected in light and dark themes;
  the hero and product cards loaded their matching localized screenshot variants.
- Enter and Space toggle the native disclosures, including without JavaScript.
  Mobile navigation closes after following a localized section link. All 14
  existing section anchors remain unique and present. The voice demo remains
  available from its disclosure. Reduced-motion logo navigation returns to the
  top immediately.
- Shared navigation was smoke-tested on French pricing and legal pages.
  The final browser sweep reported no uncaught page errors.
- Changes are limited to marketing components/layouts, one translated disclosure
  label per catalog, and this plan. Application logic, migrations, deployment
  configuration, and excluded paths are unchanged.

Delivery uses `git commit --signoff` and `npm run work:pr`. Merge and production
release remain separate from this implementation.
