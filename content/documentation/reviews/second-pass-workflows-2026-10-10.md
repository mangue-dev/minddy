# Second lightweight review of product workflows

Date: 2026-10-10. Reviewer: `agent:/root/second_workflows`.

## Scope and method

This is the owner's requested second reading pass before merging PR #397,
following the corrections committed in `6c62fa7b4`. The repository agent rules,
manual maintenance contract and editorial guide were read before this review.
All bodies, headings, examples, image alternative text, captions and structured
diagram definitions were read in these 14 guides in each of `en`, `fr`, `de`,
`es`, `it` and `pt-BR` (84 complete locale articles):

- `first-project` (`S01`).
- `projects` (`S05`, `S06`).
- `issues` (`W01`, `W03`, `W02`, `W08`, `W05`, `W06`, `W07`, `W09`, `W04`,
  `A06`, `A11`).
- `objectives` (`W10`, `W11`).
- `pages` (`P01`–`P07`).
- `databases` (`P08`–`P11`).
- `navigation` (`S04`, `W15`).
- `views` (`W13`, `W14`).
- `personal-cycle` (`W12`).
- `personal-statistics` (`W18`).
- `task-notebook` (`W17`).
- `trash-and-recovery` (`W19`).
- `permissions-and-public-links` (`T02`).
- `glossary-and-data-model` (`T01`).

Reads were split into bounded batches; portions affected by output truncation
were read again. Suspicious claims were checked against repository source.
This is an agent factual, language and illustration review. It does not provide
new human reader acceptance or independently repeat prior operational evidence.

## Corrections

`databases#import-a-database` (`P11`) omitted the enforced maximum of 100 imported
attachments from its archive-limit paragraph in every locale. The paragraph now
states that limit alongside the existing compressed, expanded and page-count
limits. `lib/database-import/types.ts:13` defines `MAX_IMPORT_FILES = 100`;
`lib/database-import/archive.ts:280` checks the native archive's file list and
`lib/server/database-import.ts:283` checks referenced imported files. This is an
existing application limit; no application behavior changes.

Italian and Brazilian Portuguese `first-project#first-project` (`S01`) placed
the invitation alternative at the end of step 1, after the complete project
creation procedure. The existing sentence now precedes the numbered steps,
matching the other four locales, so a reader sees the existing-team alternative
before creating a duplicate project. No instruction or meaning was removed.

All six `databases` variants advance to revision 7 and English source revision 7.
The changed Italian and Brazilian Portuguese `first-project` variants advance
to revision 7 while retaining English source revision 6. The changed variants
record this actual review date and agent reviewer. Shared evidence references
are synchronized across both six-locale guide sets, including unchanged
`first-project` variants. Updating those private references does not establish
a new operational review or alter their public prose.

The reviewed figure revisions advance with changed articles. Figure IDs are
`first-project-steps`, `create-a-database-steps`,
`database-cells-and-entries-steps`, `change-a-database-schema-steps` and
`import-a-database-steps`. Existing screenshot bytes and original capture dates
are retained. Related articles, workflow destinations, section IDs, aliases,
commands and code examples are preserved.

## Focused factual checks

The remaining reviewed claims did not reveal another essential contradiction:

- Project page favorites are shared, as described in `pages`; the update logic
  and explanatory comment are in `lib/server/pages.ts:829`, with corresponding
  coverage in `lib/server/pages.test.ts` and page-tree behavior in
  `components/pages/page-tree.tsx`.
- Owner-only project and routine recovery/purge boundaries agree with
  `lib/server/trash.ts`; membership checks remain distinct from owner checks.
- Smart Triage tiering, objective grouping, scoring and tie breaking agree with
  `lib/smart-triage.ts`. Cycle assignment and carryover descriptions agree with
  `lib/server/cycle-issues.ts` and `lib/server/cycles.ts`.
- Implementation-plan open questions use the literal supported heading forms
  in `lib/plan.ts`, including the documented `Questions` heading. The localized
  caveats correctly preserve this literal where required.
- Objective momentum and forecast conditions agree with
  `lib/objective-momentum.ts`.
- Public-page file URLs use the stated 24-hour lifetime and publication scope
  in `lib/server/page-publication.ts:74` and its `publishedIds` projection.
- Database option, property and text limits agree with `lib/page-databases.ts`.
  The documented archive byte, page and attachment limits agree with
  `lib/database-import/types.ts` and the import parser/server checks above.

## Visual coverage and limitations

All 216 figure references were reviewed across the six locales: 34 PNGs and two
SVG fallbacks per locale. All 204 PNGs were inspected in 18 freshly generated
diagnostic contact sheets. The French database type-conversion warning was
also inspected at full size. The 12 SVG fallback label sets were compared with
their structured definitions, then rasterized and visually inspected together.
The `permissions-and-public-links-flow` and `glossary-and-data-model-flow`
fallbacks agree with their localized definitions; wrapped text fits the panels
and the collection layouts correctly omit arrows and dots.

The illustrations support the described controls and outcomes. Some existing
page-creation, activity and conversion-dialog captures retain small background
slivers or underlying interface text; the essential controls and warning remain
readable. The completed first-project demonstration explicitly identifies the
application reading check used for the example. These observations do not
require new captures for this reading pass.

Contact sheets provide broad inspection, not pixel-level review of every PNG
or new responsive-rendering acceptance. No Docker, server, application build,
provider call, fresh UI capture, installation or live application write was
performed. Minor pronoun/register variation in some German and Spanish sections
does not change meaning and was left alone to avoid cosmetic churn. Existing
procedural, release and compatibility evidence keeps its original qualifications.

## Validation handoff

This reviewer checked the source limits and retained invitation sentences after
editing. A comparison against `HEAD` passes for all 12 article records: revision
and source-revision coherence, figure revision/capture metadata, identical
six-locale evidence lists, and unchanged workflows, aliases, related articles,
required figure IDs, section IDs and fenced examples. Scoped `git diff --check`
also passes. The coordinator runs
the repository-wide documentation, release, knowledge, owned-English and diff
checks after all agents' corrections are consolidated. Their outcomes and CI
status belong in the coordinator's second-pass record; this record does not
claim those checks have already passed or that the pull request is merged.

## Independent static review of logical recovery

At the coordinator's request, this reviewer also read the updated logical
backup/recovery commands in English `backups-and-restoration` (`H11`, `H12`,
`H14`) and `docs/self-hosting-logical-operations.md`. Source comparison used
the local saved Supabase checkout at commit
`549db119c44c25167461812041ba198bde2b31a4`, specifically `docker/run.sh` and
`docker/docker-compose.yml`.

The new order restores the complete saved `db-config` archive, including
ownership, permissions, ACLs and extended attributes, into a new guarded volume
before database startup. The pinned Compose file mounts that volume at
`/etc/postgresql-custom`. Persisting the override through `run.sh config add`
writes the Compose file list to `.env`, so later Compose operations retain the
key-volume choice. The saved-upstream commit and initialization-file checks
are consistent with the pinned checkout; the configuration archive excludes
`volumes/` and therefore requires those original static files separately.

This independent pass identified the recurring-recovery case: a saved
configuration can already contain `docker-compose.restore-keys.yml` and its
Compose file-list entry. A new restore must append a unique override last,
rather than fail on or reuse that old volume mapping. `run.sh` accepts a
`docker-compose.restore-keys.XXXXXX.yml` filename through its normal override
pattern. A config-only diagnostic copied the pinned script into an isolated
temporary directory with a dummy environment containing the base file, a
PostgreSQL override and an earlier key override. Adding
`docker-compose.restore-keys.A1b2C3.yml` succeeded, appended it last and preserved
the previous entries. The temporary directory was removed. No real environment
or running instance was touched.

The pinned backend always mounts `db-config`; its recovery procedure must
require the saved key-volume archive and stop if it is absent, rather than
start a new root-key volume. Both observations were reported to the coordinator
and operations reviewer for correction. All 12 English Bash blocks and all 12
internal runbook Bash blocks passed `bash -n` during this independent review.
This establishes syntax and source agreement only: no Docker command,
database restoration, application startup or operational recovery was executed.
