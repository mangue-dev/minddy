# Database date and option controls review

Date: 2026-10-12. Reviewer: Codex `agent:/root`. This is an agent source,
component, isolated PostgreSQL and localized-passage review, not human reader
acceptance or a deployed release test. Application and desktop versions are unchanged.

## Scope and sources

Article: `databases`, revision 11, in `en`, `fr`, `de`, `es`, `it`, `pt-BR`.
Workflows: `P09` and `P10`, plus date import behavior under `P11`.
Knowledge: `content/knowledge/pages.md`.
Figures: `database-options-preview` and `database-date-time-preview`, all six locales.
Existing figures depict unaffected setup, property types, entry content, conversion
warnings and import review. Their original capture evidence is retained.

- `components/pages/page-database-properties.tsx` uses the shared date picker with
  calendar-date preservation and keeps it open during changes. The picker distinguishes
  a date without time from an explicit midnight timestamp, displays local time and
  uses the exact previous cell value for consecutive writes.
- `lib/page-databases.ts` validates calendar dates and ISO timestamps with explicit
  offsets, sorts untimed dates at local midnight and matches date filters to the
  displayed calendar day. The import mapper consumes this same validator.
- `lib/server/page-database-conversion-protected.ts` accepts these timestamps in
  text-to-date conversion. Created-at conversion retains its previous date-only behavior.
- `20270109200044_page_database_date_times.sql` updates the legacy trigger and
  conversion helper while preserving their encryption, type-change and lifecycle guards.
  Existing calendar values are not rewritten. This migration is included for the next
  authorized deployment and has not been applied to a production database.
- Both option creation paths use `pickFreeCategoryColor`. Existing colors, including
  uppercase hexadecimal strings, are excluded until the ten-color palette is exhausted.
- The options dialog changes its draft with up/down and trash buttons. Save uses
  the existing revision-aware schema save; Cancel leaves the stored schema intact.
  Names, colors, order and deletions are saved together. The deletion hint states
  its consequences before saving.
- `lib/server/page-databases.ts` removes deleted options from live and trashed
  protected entries in the same content batch. The unchanged legacy SQL cleanup
  and optimistic cache cleanup follow the same rules. Other multiple selections
  and unrelated properties remain intact.

## Browser and visual evidence

The real options dialog, property cell, selection menu and date picker were rendered
with the current stylesheet and loaded Inter font in a local component fixture.
Only persistence, membership and unrelated assistant integrations were mocked;
no account writes or signed-in end-to-end behavior is claimed. Demonstration
status names are localized in all six languages. Captions explicitly identify
component previews.

Playwright checks passed in all six locales: saved order after reopening,
option deletion, cancellation, unused colors in both creation paths, explicit
midnight after reopening, returning to a date without time, 14:30 local-time
storage and consecutive cell preconditions. The 390 × 844 mobile fixture also
passed 44-pixel action targets, no dialog overflow, keyboard reordering for
Multi-select, deletion of all options and midnight in a negative UTC offset.
Time-zone checks used `Europe/Paris` and `America/Los_Angeles`.

The final light-mode captures use native device scale 2, grayscale text rendering,
sRGB PNG output and 24 CSS pixels of transparent padding. Complete controls,
including dialog footers and rounded corners, are retained. The options figures
are 560 × 448 CSS pixels; date figures are 324 × 444. A visual-only recapture
initially left the options modal open and timed out before reaching the date
control. Closing that modal fixed the capture sequence; the complete six-locale
recapture then passed. Final images were inspected for complete controls,
localized content, legibility and unselected text. Local capture/check scripts
and intermediate output remain under `output/playwright/database-date-options/`.

## Language and verification

Changed passages, accessible action labels, example status names, alternatives
and captions were self-reviewed against the English delta in all six locales.
Existing reader procedures and stable section IDs are retained. These are
explicit agent reviews under the documentation contract, not human approvals.

Validation covers date parsing, chronological sorting, local-day filtering,
random colors, import preservation, guarded API writes and protected schema
batches. The Docker PostgreSQL test runs the actual migration in a disposable
container with no network or account data. It checks valid and invalid dates,
time preservation, offsets, midnight, clearing values, text conversion and the
retained type-change guard. Final check results are recorded in the PR.

## CI migration audit follow-up

PR #412 initially reused the enriched-routines migration version and omitted its
encryption migration manifest entry. The date migration now uses the unique
version `20270109200044`; the integration test and this source reference follow
that filename. Its SQL is unchanged.

An isolated PostgreSQL 17 replay first reproduced the previously inventoried
definitions of `validate_page_database()` and
`convert_database_cell(jsonb,text,jsonb)`, then applied the date migration.
Only their definition hashes changed in the SQL inventory. Security-definer
flags, empty search paths, ACLs, relation references and encryption guards remain
unchanged; no table, column, view, trigger or database access path is added.
The migration manifest now pins the reviewed SQL. Reader procedures and figures
remain accurate.

Follow-up validation passed: the 20 schema guardrail and encryption-policy tests,
the isolated date-migration integration test, `check:encryption-schema`,
`check:owned-english`, `check:documentation`, `check:knowledge` and
`git diff --check`.
