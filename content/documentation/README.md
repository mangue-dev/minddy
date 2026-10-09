# Official documentation

This directory owns the versioned public manual for MIN-664. Only its explicit
`en`, `fr`, `de`, `es`, `it`, and `pt-BR` article directories are loadable.
`docs/`, review records, plans, audits and internal assistant instructions never
become public through recursive discovery.

## Article contract

Organize the entire manual into feature guides, including self-hosted operations
and technical subjects. Use a recognizable localized feature title, a useful
scope paragraph, and a hierarchical contents list with task headings and nested
checks/reference/recovery. Retain the complete task instructions and conditions.
The [feature-guide migration](../../docs/plans/min-664-feature-guides.md) explains
the change from the initial narrow task articles and the 42-guide catalog.

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

`coverage.json` mirrors the 90 original matrix rows and the two PR-review
additions for voice dictation and issue CSV export (92 outcomes). Each row names the article
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
   Slug changes need a legacy URL migration. Do not deploy during ticket implementation.

`legacy-routes.json` maps every original article and its section IDs to the
current feature guide. Retired article IDs also remain knowledge aliases. The
server renders the current published guide at an old URL, with its canonical
metadata and noindex on the legacy URL; only canonical guides enter the sitemap.
The browser then replaces the URL, retaining queries and resolving the original
fragment to its new section. A server-only redirect cannot inspect fragments.
Without JavaScript, the full guide remains readable at the legacy URL. Internal
links and welcome cards use canonical guide IDs directly. The documentation
checker verifies every mapped section and alias in all six locales. Preserve
this mapping when changing a section or guide again.

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
Review documentation impact for every code change. Documentation edits are
required only when documented behavior, controls, configuration or contributor
workflows change. Small fixes, refactors, formatting and test-only PRs that
leave documentation accurate need no documentation edit, new illustration or
article review record. Complete affected public guides, technical references
and internal instructions in the same PR. Add documentation for new
capabilities, correct changed behavior, and remove retired procedures, claims
and illustrations.
Reconcile related links, navigation, aliases, coverage mappings and glossary
entries when their meaning changes; preserve valid legacy URLs. Do not postpone
required documentation to another task or release.

When documentation changes, PRs list affected workflow, article and figure IDs,
evidence and checks. For a PR with no documentation impact, a brief note
suffices; article IDs and release-wide checks are unnecessary. Avoid cosmetic
edits. Update English facts and full `fr`, `de`, `es`,
`it`, and `pt-BR` translations together, including localized labels, examples,
captions and alternative text. Follow the editorial guide for writing and
illustrations: refresh screenshots of changed controls, update responsive
diagrams and their SVG fallback, add visuals where they help the reader, and
remove obsolete or redundant figures. Internal instructions remain English.
Keep article revisions, `sourceRevision`, compatibility and actual factual,
language and figure review evidence coherent; never fabricate approval dates.

Every release that changes the desktop version requires a documentation review
against the release delta and intended version before freezing the candidate.
Check all guides' applicability and compatibility, update affected content and
illustrations, and record verified compatibility or retained evidence for
unchanged guides. A version bump or changelog entry alone is not a manual
update. Include the reviewed documentation in the candidate through the normal
PR workflow. Do not change versioned documentation after freezing it; a
necessary correction requires a new candidate and rebuilt affected artifacts.

Run `npm run check:documentation`, `npm run check:knowledge`,
`npm run check:owned-english` and `git diff --check` after documentation edits.
Require `npm run check:documentation:release` before publishing a release.
Passing metadata checks does not establish factual, language or visual quality;
unresolved essential documentation or illustration gaps block completion.

Review source changes against the shipped UI and configuration at release time.
Operators rehearse installation, backup, update and blank-target restore for
each supported profile, checking Auth, encrypted content, Storage bytes and
scheduled work. Preserve the actual sanitized outcomes and failed checks.

Readers report errors from each article using its ID, locale and revision.
Reports must not include keys, account data or private object URLs. Reproduce
the report, correct the source, update every affected locale and rerun the
checks before publishing the revised set.
