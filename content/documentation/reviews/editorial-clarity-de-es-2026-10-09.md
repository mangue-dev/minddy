# German and Spanish editorial clarity review

Date: 2026-10-09. Reviewer: `agent:/root/editorial_de_es`.

The scope is the 42 public feature guides in each of `de` and `es` (84 locale
articles). Readers include project members, project owners, integration
developers and self-hosted operators. The review targets task orientation,
repetition, sentence clarity and retained meaning against the corresponding
English guides. It uses `docs/documentation-editorial-guide.md` and the UX
Writing skill. It does not establish new release compatibility or operational
evidence.

## Decisions

- Replace the 19 consolidated guides' repeated contents announcements with
  useful scope, decisions or conditions already explained in their procedures.
  Installation, backup, permissions and AI billing distinctions remain explicit.
- Use consistent informal address within the account guides. Keep MFA enrollment,
  single-use recovery codes, fresh authentication, avatar limits, consent behavior
  and irreversible account deletion intact.
- Consolidate API feedback field and moderation guidance under its existing
  ingestion anchor. Link there from the issue-input section and put issue field
  limits in a small reference table. Preserve the optional name field, boolean
  validation, visibility boundaries and executable examples.
- Present the four core glossary definitions as a reference table without
  shortening their ownership, scope or optional properties. Correct awkward
  German release/routine wording and Spanish routine phrasing.
- Split the tutorial's long project-creation step into three ordered steps.
  Place the existing-project invitation alternative before creating new work.
  Preserve every wizard choice, automation condition and completion check.
- Correct Spanish prose that called project feedback "comments" in navigation,
  project settings and trash. Actual UI labels remain intact. Clarify the parent
  object needed for restoration and the routine owner's AI budget.
- Retain detailed operational procedures and recovery guidance. Length alone
  does not justify removing key preservation, isolation, migration or restore
  conditions. Guides without a substantive clarity improvement remain unchanged.

## Changed guides

The following 21 guide IDs changed in both languages:

`accounts`, `ai-settings-and-usage`, `api-and-webhooks`, `applications`,
`backups-and-restoration`, `code-work`, `databases`, `feedback`, `first-project`,
`git`, `glossary-and-data-model`, `installation`, `instance-configuration`,
`issues`, `minddy-mcp`, `navigation`, `numo`, `objectives`, `pages`, `projects`,
and `views`.

Spanish also changes `scheduled-routines` and `trash-and-recovery`. In total,
21 German and 23 Spanish article bodies change. Titles and summaries remain
unchanged.

## Verification and limits

- `npm run check:owned-english` passed.
- `npm run check:documentation` passed: 252 locale articles and all 90 workflows
  published in all six languages.
- `git diff --check -- content/documentation/de content/documentation/es` passed.
- A before/after comparison across all 84 articles confirmed that frontmatter,
  explicit anchors, fenced examples and image Markdown remain unchanged. This
  also preserves workflow IDs, compatibility, revisions, review metadata and
  figure captions for the separate visual pass.
- Changed passages were checked against the corresponding English procedures.
  No executable examples, actual UI labels or technical limits were altered.
  The tutorial only relocates and splits existing instructions.

This is an agent editorial pass, not a new native-speaker acceptance study or
an operational rerun. Existing factual and procedural evidence is retained;
article review metadata is deliberately unchanged. Screenshot quality, figure
selection and renderer presentation are handled in the separate visual pass.

## Collection-diagram caption follow-up

A subsequent file-only pass shortened the ten collection-diagram captions in
each language. Each caption now explains one relationship, operational
consequence or decision instead of repeating the diagram's card titles.
The affected guides are `architecture-and-data-flows`,
`encryption-and-data-boundaries`, `glossary-and-data-model`, `install-locally`,
`installation`, `instance-configuration` (two captions),
`permissions-and-public-links`, `storage-and-attachments` and
`workspace-encryption`.

This follow-up changes only those 20 caption values and this review record.
All other article fields, bodies, revisions, image references and source
identifiers are preserved. No browser, server, Docker workflow, build or test
was run for this caption pass; the coordinating agent handles final checks.
