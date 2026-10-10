# PR #397 second lightweight pre-merge review

Date: 2026-10-10. Coordinator: `agent:/root`.

The owner requested another complete reading before merging, followed by waiting
for all GitHub checks to pass. The existing work branch is reused. This review
remains a reading, source and illustration check without Docker, application
startup, installation or recovery execution. Existing operational evidence keeps
its original release, profile and limitations.

## Independent coverage

Three agents divide the complete 42-guide catalog by subject, with all six
locales in each assignment. This changes the review boundaries from the first
pass's language pairs and allows direct comparison of translated procedures.

- [`agent:/root/second_workflows`](second-pass-workflows-2026-10-10.md): 14 workflow guides, including onboarding,
  projects, issues, pages, databases, navigation, views, permissions and recovery.
- [`agent:/root/second_ai_integrations`](second-pass-ai-integrations-2026-10-10.md): 14 assistant and integration guides,
  including MCP, Git, routines, feedback, APIs, accounts and notifications.
- [`agent:/root/second_operations`](premerge-second-operations-2026-10-10.md): 14 instance and operations guides, including
  installation, authentication, encryption, storage, backup and restoration.
  `agent:/root/second_ai_integrations` also reads the Italian and Brazilian
  Portuguese operations prose and captions.

The domain records identify the individual guides, sources and visual checks.
Agent review is not human reader acceptance or a new operational rehearsal.
All 252 locale bodies are read in full, with truncated reads recovered. Across
the three assignments, all 414 referenced PNGs are visually inspected through
contact sheets, and all 126 SVG fallbacks are checked against their localized
structured labels. The workflow subset is also rasterized for a fresh visual
check. The records state each method's limits and retained minor observations.

## Consolidated corrections

- `databases#import-a-database` (`P11`): include the enforced 100-attachment
  maximum alongside existing byte and page limits in every locale. Sources:
  `lib/database-import/types.ts`, `lib/database-import/archive.ts` and
  `lib/server/database-import.ts`.
- `first-project#first-project` (`S01`): place the existing-project invitation
  alternative before project-creation steps in Italian and Brazilian Portuguese,
  matching the other four languages.
- `installation#managed-or-source-installation` (`H04`): distinguish configuration
  generation from successful installation of the unchanged v0.11.0 managed OCI
  profile. Its runner uses the same image with the missing helper already
  disclosed for the full profile. Preserve the requirement for a corrected
  release/tooling combination and profile-specific acceptance.
- `backups-and-restoration` (`H12`, `H14`): save the complete database configuration/key volume
  in the operator-controlled logical backup and restore it to a new target volume
  before the first database startup. Preserve filesystem ownership and metadata;
  do not assume a PostgreSQL UID or recreate a different Vault root key. Update
  the internal logical runbook alongside the six public translations.
  Require the saved upstream checkout and its static initialization files, stop
  on failed Bash checks, and append a unique persistent key override so future
  backups of a recovered instance can be restored again. The internal installer
  reference also places the existing v0.11.0 blocker before its examples.
- `integration-troubleshooting` (`T08`): scope the public HTTPS destination requirement
  and 30-second/1 MiB/64 KB limits to Numo's personal outbound MCP connections.
  Incoming minddy MCP uses a separate handler and supports the instance access
  described in `minddy-mcp#network-access`. Sources: `lib/server/mcp-http.ts`,
  `lib/server/safe-fetch.ts` and `app/api/mcp/route.ts`.

The coordinator checks the consolidated changes against their sources and the
existing pinned upstream Compose layout. Changes to instructions are static
corrections and do not establish a freshly rehearsed logical restore or managed
installation. Required illustrations retain their capture dates and bytes;
article and figure revisions advance together where text changes.

## Verification

After consolidating the corrections, these local checks pass:

- `npm run check:documentation`: 252 locale articles, all 92 workflows published.
- `npm run check:documentation:release`: the same complete six-language set.
- `npm run check:knowledge`.
- `npm run check:owned-english`.
- Metadata comparison of all five affected six-locale guide sets: identical
  compatibility, current English source revisions and matching review/figure
  revisions, preserving actual screenshot dates.
- `bash -n` for 31 English installation/recovery and internal logical-runbook
  blocks, with byte-identical public operations examples in all six locales.
- Static parsing of six Compose YAML payloads, including expected nested volume
  mappings and the existing appended Storage fragment.

The workflow reviewer also exercises only the pinned `run.sh config add` helper
against temporary dummy files, confirming that a unique restoration override
appends after existing entries. No Docker command or real environment is used.
Only public article text/metadata, private review records and the two affected
internal technical references change. Application source, configuration,
translations outside the manual, coverage mappings and illustration bytes are
untouched. `git diff --cached --check` passes for the complete staged correction,
including all new review records.

GitHub completed all checks on the previous review head. The corrected commit
must independently pass the complete GitHub check set before merging. No
deployment is part of this request.
