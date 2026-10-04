---
name: changelog
description: Prepare Minddy's version-based product changelog from shipped commits and resolved tickets, with illustrated bentos for substantial releases and compact text for small updates. Use for changelog preparation, release notes, or historical backfill. Implementation completion alone does not publish an announcement.
---

# Minddy release changelog

Produce one entry per production version. Reuse this skill rather than creating
another changelog workflow. Follow the repository's Git and DCO instructions;
preparing content does not authorize a production deployment.

## Establish what the version ships

Read `docs/changelog.md` for the content schema and publication workflow. Use
`content/changelog/index.json` and the live publication index, when configured,
to identify the preceding production version. Refresh Git references and inspect
the exact commit range between that production SHA and the release candidate.
Do not use the date of the last announcement or a `--since` filter as the boundary.

Discover Minddy tools by their `mcp__minddy__` prefix. Read the resolved tickets
referenced by the shipped commits and their plans/comments. Match each claimed
feature to commits present in the release candidate. A ticket marked done, a
merged pull request, or an implementation date alone is not publication evidence.
Inspect the implementation where a commit subject or ticket is ambiguous.

Keep user-visible capabilities and useful fixes. Explain maintenance releases
briefly even when there are no new features: every newly versioned production
release needs an entry. Do not expose private issue text, internal operational
information, provider keys, or exploit details in public copy.

## Choose the presentation and write the content

Use `compact` for a small change or isolated fixes. Use `bento` when several
meaningful additions benefit from separate illustrated tiles. Decide from the
substance, not just the SemVer component. A bento needs at least two tiles.

Write all six locales: English, French, German, Brazilian Portuguese, Italian,
and Spanish. Match the existing public-site tone. Use short, useful titles,
concrete summaries, and fuller feature details explaining what changed and how
to use it. New features should normally have at least two useful detail
paragraphs; do not pad a minor fix to meet that guideline. Keep historical copy
when evidence does not support an expansion. Avoid em dashes, emoji, internal
jargon, keyboard shortcut lists, or unsupported marketing claims.

Put the most useful feature first. Cards use a Masonry layout with varied
illustration proportions and the landing’s native in-card disclosure. Choose a
lightweight code illustration or icon from the supported names. External HTTPS
images are also supported: pre-optimize them to WebP/AVIF, at most 1600 px per
side and preferably below 80 KiB, store them outside the app build, and record
their actual dimensions. Do not add per-release bitmap assets to `public/` or
import images into application code. Check contrast, mobile layout, and the
readable fallback for a failed image.

Release and feature content lives in `content/changelog/drafts/<version>.json`,
not the translation catalogs or `lib/changelog.ts`. Stable feature slugs are
public detail anchors, so never rename them after publication. Use distinct
slugs for later improvements to the same capability. Record shipped full commit
SHAs and Minddy issue identifiers in `evidence`; they stay out of public API
responses. Drafts must not contain `publishedAt`, `sha`, or `deploymentId`.

## Preview, save, and verify

Construct the complete localized JSON draft, then preview it:

```bash
node scripts/changelog-add.mjs --file /path/to/release.json --dry-run
```

The preview prints the chosen layout, ordered tiles, illustration kinds, and
feature details in each language. Iterate on accuracy and usefulness. Save the
reviewable draft using the same command without `--dry-run`; it validates all
locales, budgets, and commit ancestry, and never publishes it.

Run the relevant changelog tests, `npm run check:owned-english`, and
`git diff --check`. Follow the authorized repository contribution workflow for
commits and the PR. No extra approval is needed for preparation already
requested by the user. Public deployment still requires their explicit request.

## Production publication and history

The protected production promotion workflow validates the draft before moving
production, waits for the exact SHA's successful Vercel Production deployment,
and then uploads immutable release content before updating the public index.
Only that index makes content visible. Retries keep the original entry, date,
and version; redeploying the same version creates no second announcement.

For historical backfill, use successful production deployment records, shipped
commits, and verified equivalent patches across rewritten histories. Run
`node scripts/changelog-backfill.mjs --dry-run`, review
`content/changelog/backfill-report.json`, then rerun without `--dry-run` when
authorized. Preserve every legacy feature and translation. Unrecoverable first
publication dates must remain explicit uncertainties; never turn implementation
or tag-commit dates into invented production dates.
