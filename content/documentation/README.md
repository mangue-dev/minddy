# Official documentation

This directory owns the versioned public manual for MIN-664. Only its explicit
`en`, `fr`, `de`, `es`, `it`, and `pt-BR` article directories are loadable.
`docs/`, review records, plans, audits and internal assistant instructions never
become public through recursive discovery.

## Article contract

Use a stable ASCII article ID as the filename in every locale. Explicit locale
roots translate the URL; article IDs remain stable across languages. Every
heading is level two or three and ends with a semantic ID, for example
`## Restore access {#recover-access}`. Use the same IDs and order in every locale.
The page supplies the title, so do not repeat a level-one heading in its body.
Do not use arbitrary HTML or executable MDX in the manual.

Frontmatter is a JSON object between `---` lines. Required fields are `id`,
`locale`, `title`, `summary`, `topic`, `type`, `audiences`, `workflows`,
`visibility`, `status`, `revision`, `sourceRevision`, `owner`, `updatedAt`,
`compatibility`, `review`, `related`, `aliases`, `tags`, `figures` and
`requiredFigures`. Types are defined in `lib/documentation.ts`. Compatibility
identifies edition, release/profile and private factual evidence paths. Review
records identify the actual factual and language reviewer and date at the
article revision. Never invent approval or update dates on each build.

Drafts and internal articles stay out of public HTML, search, sitemap and Numo. All six
variants must be published, current and reviewed before any one variant becomes
public. Required figures must exist in each locale with current revision,
capture date, viewport, theme, alt text, caption and an explicit review result.
This gate checks recorded evidence, not its truth or editorial usefulness.

For local review, run `MINDDY_DOCUMENTATION_PREVIEW=1 npm run dev`.
The development-only preview displays public drafts with an explicit warning
and `noindex, nofollow`. It never changes sitemap or Numo retrieval, and the
flag has no effect in production. Preview checks do not establish published
coverage. Cross-language links use document navigation to refresh the root
translation provider while preserving semantic section IDs.

`coverage.json` mirrors the 90 accepted matrix rows. Each row names the article
and stable section containing its outcome. The checker rejects ledger drift.
It also reports pending release coverage even when draft validation passes.
Do not treat a passing draft check as completion of the ticket.

## Write, review and publish

1. Read `docs/documentation-editorial-guide.md` and the workflow brief in the
   coverage ledger. Inspect the exact control, permission and released behavior.
2. Write the complete English task, explanation or reference. Record its
   evidence and unresolved facts in `reviews/`; unresolved essential facts keep
   the article in draft. Keep private evidence out of the article itself.
3. Translate the full meaning in all five other locales, including conditions,
   recovery steps, meaningful examples, alt text and captions. Preserve commands
   and identifiers. Increment `revision` when the locale changes and record the
   matching English `sourceRevision`.
4. Capture only demonstration data using the existing guarded capture tools.
   Inspect every required locale image, including visible conversations and
   data. Publish approved images under `public/documentation/<locale>/`.
5. Record factual and language review with reviewer identity, revision and
   date. The owner authorized agent language review on 2026-10-08 and offered
   personal French review. Label agent reviews explicitly; they are not human
   reader acceptance. Keep actual reader/operational evidence separately.
6. Run `npm run check:documentation`, `npm run check:knowledge`,
   `npm run check:owned-english` and relevant tests. Use
   `npm run check:documentation:release` before calling the manual complete.
7. Publish the coherent six-locale release set through the normal reviewed PR.
   Slug changes need redirects. Do not deploy during ticket implementation.

## Source migration

The installation overview and wizard keep their existing public URLs. They
link to canonical articles for detailed procedures; do not duplicate operations
commands in marketing copy. Tagged runbooks remain immutable release references.

Numo and FAQ resolve published articles from this catalog, preserving legacy
knowledge topic IDs as aliases. During migration, legacy topics remain available
only until their published replacement exists. A replacement displaces the
legacy source rather than creating two authoritative copies. Remove the old
product article after its consumers and tests use the replacement. Internal
agent behavior belongs in assistant instructions, never in public articles.
FAQ retrieval selects bounded relevant excerpts; the complete manual never
rides in a single prompt. Existing model, disablement and cost guards remain.

## Release maintenance

`@mangue-dev` is responsible for the manual until another maintainer is named.
Feature PRs list affected workflow, article and figure IDs. Update the English
facts, full translations, screenshots, compatibility and glossary together.
Review source changes against the shipped UI and configuration at release time.
Operators rehearse installation, backup, update and blank-target restore for
each supported profile, checking Auth, encrypted content, Storage bytes and
scheduled work. Preserve the actual sanitized outcomes and failed checks.

Readers report errors from each article using its ID, locale and revision.
Reports must not include keys, account data or private object URLs. Reproduce
the report, correct the source, update every affected locale and rerun the
checks before publishing the revised set.
