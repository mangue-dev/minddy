# Production release changelog

The changelog announces one version at a time. Small updates use compact text;
substantial releases use an illustrated Masonry bento. Its plus controls replace
each card’s illustration and title with the feature details, using the same
native disclosure as the landing.
The public page, in-app dialog, menu preview, RSS, Markdown, and sitemap read the
same confirmed publication index.
The public history starts at version 0.11.0, including when a remote catalog
still contains older announcements.

## Content and budgets

`content/changelog/drafts/<version>.json` contains a prepared release:

- `version`: stable SemVer without `v`;
- `layout`: `compact` or `bento`, selected by the substance of the update;
- `copy`: one `{ title, summary }` object for each of `en`, `fr`, `de`, `pt-BR`,
  `it`, and `es`;
- `features`: stable `id`, `illustration`, and localized `{ title, summary,
  details: string[] }` copy;
- `evidence`: full shipped `commits` and resolved `issues` identifiers.

Illustrations use `{ kind: "code", name }`, `{ kind: "icon", name }`, or
`{ kind: "image", url, width, height }`. Code/icon names are `shield`, `board`,
`assistant`, `pages`, `connections`, `activity`, and `desktop`. All figures
share the same small renderer. Images require external HTTPS, real dimensions,
and optimized assets up to 1600 px per side. Aim for at most 80 KiB per image.
The browser loads them lazily and keeps the tile text if an image fails.

The validator caps a complete six-locale release at 192 KiB, 64 features,
90-character titles, 320-character summaries, and six 1200-character detail
paragraphs. Historical content lives in server files; it is never imported into
a client bundle. `/api/changelog` returns one locale and at most four releases
per page, with a 48 KiB JSON budget. Each page includes its locale's feature
details, rendered inside native disclosures before opening. Opening a loaded
tile requires no network request or translation loading. API and catalog caches
refresh within 60 seconds; publication index replacement uses a 60-second cache.
RSS and Markdown include the latest 50 versions and their feature details.

Prepare and preview with the existing skill at
[`.claude/skills/changelog/SKILL.md`](../.claude/skills/changelog/SKILL.md):

```bash
node scripts/changelog-add.mjs --file /path/to/release.json --dry-run
node scripts/changelog-add.mjs --file /path/to/release.json
npm run test:changelog
```

The writer verifies all locales, budgets, stable feature IDs, and commit
ancestry. Drafts cannot claim publication timestamps. The dry run prints the
ordered bento tiles and full content; saving only creates a draft. Include the
draft in the release preparation commit. It can be authored before bumping
`package.json`; production promotion requires it to match the selected version.

## Confirmed publication

The promotion workflow runs `scripts/changelog-publish.mjs --check <sha>` before
fast-forwarding production. A new version without its reviewed draft or storage
configuration fails this check. After GitHub records a successful Vercel
`Production` deployment for the exact SHA, the workflow invokes the publisher
again. It derives the publication time from that deployment's successful status,
uploads the release JSON, and only then replaces the public index. Failed
uploads leave the previous index visible. Reruns verify partial immutable
uploads; an already published version retains its original content and date.
Marketing-only deployments of the same version add no entry.

Set these secrets in the existing `cloud-production` GitHub environment before
publishing the first new version:

- `MINDDY_PUBLIC_SUPABASE_URL`: the production Supabase origin;
- `SUPABASE_SERVICE_ROLE_KEY`: the production storage publisher credential.

The server already receives the Supabase origin. The publisher creates a public
`changelog` storage bucket restricted to JSON; credentials stay in the protected
workflow. It seeds the verified historical releases on first publication. No
account data, encryption keys, or encrypted-table migrations are involved.
The bucket is intentionally public and must contain product announcements only.

Runtime reads `<supabase-origin>/storage/v1/object/public/changelog`. Set
`MINDDY_CHANGELOG_URL` to a different catalog base URL for a CDN or self-hosted
instance that should follow the Cloud announcements. The base must serve
`index.json` and `releases/<version>.json`; it is an operator-controlled server
setting. A missing or unavailable catalog falls back to the checked-in verified
history, never to drafts. Self-hosted operators may serve that same catalog from
their own storage. No publisher is invoked by a build, ordinary commit, or test.

## Historical backfill

`legacy.json` preserves all 63 displayed features and their six translations.
`backfill-evidence.json` records successful production deployments and the
implementation commits associated with them. Equivalent patches were checked
across rewritten histories; the mapped commits were verified as ancestors of the recorded production SHA.
The evidence freezes that verification and both stable patch fingerprints.
Fingerprints use `git show --format= --first-parent --full-index --no-color`
followed by `git patch-id --stable`. Full index IDs keep binary fingerprints
independent of clone size and `core.abbrev` settings.
Reruns validate those records and recheck any Git objects still available. This
keeps the migration reproducible in fresh clones after history rewrites, without
fetching vanished commits. Use `--verify-git` with the audited history archive to
require a complete live ancestry and patch recheck.

```bash
node scripts/changelog-backfill.mjs --dry-run
node scripts/changelog-backfill.mjs
node scripts/changelog-backfill.mjs --dry-run
```

The deterministic backfill verifies all 63 archived mappings, then publishes
only versions from 0.11.0 onward. It retains 13 features in the current release
and excludes the 50 earlier features. It writes the release files, a small index,
sitemap fallback metadata, and `backfill-report.json`, and removes generated
release files below the cutoff. The final dry run must report zero changed files.
Retained features keep their full original translated bodies in the details.

Thirty early features can only be mapped to the first surviving confirmed
version, 0.9.5. Earlier deployment SHAs are unavailable after history rewrites;
the source archive retains their implementation dates and marks these mappings
as uncertain. They are excluded from the public changelog.
The 44 unresolved deployment IDs are recorded for future investigation. Tag
commit dates are not substituted for production dates.

The new RSS GUID is `minddy:release:<version>`. Feed readers see the migrated
history once as release announcements. Retained feature anchors remain usable:
opening `#<feature-id>` opens its details, loading its release first if needed.
Version anchors use `#v0-11-0`; versions below the cutoff are not served.
