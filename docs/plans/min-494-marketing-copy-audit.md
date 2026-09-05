# MIN-494 marketing copy audit

The visual redesign is approved. This follow-up rewrites the marketing journey for someone who has never used Minddy, on the existing PR #133 branch.

## Editorial approach

- Introduce Minddy through the work people can do: organize tasks, document decisions, collect suggestions and collaborate with AI agents.
- Name the person taking an action and the result. Replace unexplained internal terms such as tracker, board, run, core, intake and context with concrete descriptions.
- Explain necessary technical terms where they matter. MCP connects an AI assistant to applications; a provider API key selects who supplies and bills compatible AI calls.
- Keep concise labels that already work. Keep technical examples, release history, source links, installation commands and legal policies accurate.
- Use consistent local registers: respectful French address and informal address in German, Spanish, Italian and Brazilian Portuguese.

## Coverage and findings

| Surface | Main corrections |
| --- | --- |
| Landing, navigation, footer and card details | Explain the product in the hero. Introduce each feature by use. Describe feedback as a public suggestions page where visitors propose and vote, and the team chooses what becomes a task. Explain Numo and code agents without implying they already know everything. |
| Pricing and shared plan cards | Explain the monthly AI budget and model cost multipliers. Replace the untranslated provider-key label. Explain public feedback, project views, cycles, incoming issue review and API connections in row hints. |
| Download hub and mobile guide | Include phones and tablets in the introduction. Explain browser installation without requiring familiarity with PWA terminology. Replace desktop-window metaphors with concrete behavior and distinguish update channels. |
| MCP | Explain what a connected assistant can read and change, how authorization works and what to try first. Make repository access a separate prerequisite for code-aware plans. |
| Self-hosting and installation wizard | Explain hosting responsibilities, local versus shared installation and Supabase's role. Clarify import behavior and configuration choices. Repair misleading Italian and Spanish translations of technical names and instructions. |
| Linear, Jira and Notion comparisons | Replace insider language in introductions, feature explanations and recommendations. Keep the sourced competitor details, prices and source review date. |
| Changelog | Review page guidance and entry descriptions for unexplained product terms while preserving the chronology and historical release facts. |
| Cookie consent and legal links | Existing consent actions and policy links remain understandable. Legal policy text is outside this editorial rewrite. |

Supporting landing and setup findings are recorded in [the landing audit](min-494-copy-landing.md) and [the setup audit](min-494-copy-setup.md).

## Product facts checked in the repository

- `lib/billing-plans.ts`: Free includes two projects, 300 issues per project and three guests per project. Go and Pro have unlimited projects, issues and guests. Prices and numerical limits still come from the billing model.
- `lib/ai-surfaces.ts` and `lib/server/ai-runtime.ts`: provider keys can cover the code agent, assistant, automations, voice and feedback. Selection and compatible provider/model support determine which calls use the key.
- `lib/server/usage.ts` and agent execution accounting: provider AI calls and cloud execution are distinct costs. A personal key does not make all cloud execution unmetered.
- `lib/server/agent/model-plan.ts`: the model multiplier is a cost comparison with the default model, not an unexplained quality score. Provider-key mode bypasses that plan model limit.
- `lib/desktop/update-platform.ts` and `desktop/src/updater.ts`: macOS and AppImage support in-app updates, Windows uses Microsoft Store, and .deb/.rpm packages require installing a newer package.
- Account data settings provide self-service export and deletion. The landing FAQ should not imply that email is the only route.
- The self-hosting installer enables the managed forge connection relay by default. Self-hosting copy must not promise that every deployment makes no requests to Minddy infrastructure.
- Diagnostics redact specific credential patterns; copy must not promise that every secret is automatically removed.

## Content delivery

All six catalogs are updated without renaming message keys or changing interpolation arguments. Only the publicly reused plan-card strings and general metadata description change outside marketing namespaces.

The negotiated Markdown landing now includes project documentation, feedback, notes, voice, agent execution, review, Numo and hosting choices from the same catalog keys as the visible page. Pricing Markdown includes the shared plan feature labels and current provider-key explanation. Download Markdown includes actual update behavior and links to mobile installation instructions instead of referring to a button absent from the text page.

The approved layouts, screenshot assets, installation flows, billing values, comparison sources and historical release dates are preserved. Public-route modification dates are refreshed where this audit changes current content.

## Verification

- 2,983 changed strings across six locales, with unchanged keys and ICU arguments compared against the pre-audit commit. The larger German count includes a complete consistency pass on visitor address.
- 119 tests passed across eight suites: locale catalogs, translated messages, client-message boundaries, SEO metadata, public routes, billing plans and plan cards, and download behavior.
- TypeScript, focused Oxlint, owned-English and `git diff --check` passed. The SEO positioning expectation was updated to match the explicit project-management description.
- 60 negotiated Markdown responses passed across six locales. Checks include the current landing features, guest limits, provider-key explanation and platform update instructions.
- Browser geometry checked 120 locale/page/viewport configurations at 320 and 1440 px. Two German pages exposed long-word overflow; shorter headings corrected it. A further 32 configurations passed, covering all German pages and the changelog in every locale.
- Visually reviewed the French workspace, expanded feedback card and mobile pricing. The feedback detail region scrolls to the final paragraph with Tab and End and has no horizontal overflow; the provider-key hint fits a 320 px viewport.
- Source, styles, billing amounts, screenshot files, generated installer commands, legal policies and historical release dates were checked for unintended changes. Runtime source changes are limited to public Markdown content assembly and content modification dates; the other TypeScript edits correct comments or the existing SEO assertion.
- All 15 existing non-merge commits in the PR have author-matching DCO trailers. The copy update uses the same signed contribution workflow.

German and Spanish Safari labels were checked against [Apple's German guide](https://support.apple.com/de-de/guide/iphone/iphea86e5236/ios) and [Spanish guide](https://support.apple.com/es-es/guide/iphone/iphea86e5236/ios).

This is an editorial and implementation review, not a comprehension study with first-time users. No live installation, production deployment or third-party assistant authorization was performed during this audit.
