# PR #289 integration review — 29 September 2026

This checkpoint records the integration review of
[PR #289](https://github.com/mangue-dev/minddy/pull/289) on the existing
`work/min-591-data-encryption` branch. It supplements the
[corrective review](review-2026-09-29.md); the earlier review's conflict status is
a historical observation, not the status of a later candidate.

## Integration scope

The reviewed starting branch commit is `90e7a31af`; the fetched integration base
is `ab6b770f7`. The current base adds individual Numo code-worker stopping and
stop cascades. Integration must preserve both that behavior and the branch's
encrypted turn hydration, tool-operation ledger, and content codecs. Both
lockfiles are synchronized with the explicit Pierre theme dependency retained.
Local conflict resolution is complete; final mergeability and required checks
must be read from GitHub after the candidate is pushed.

Iteration one also corrected the encrypted-compatible stop cascade for a late
stale worker and propagated Stop metadata helper errors rather than masking a
failed update. A duplicate migration version was resolved by renaming the
PR-only envelope registry migration from `20270107020000` to `20270107020001`,
preserving the existing base migration's Numo stop version. Operators who applied
the earlier draft must inspect and reconcile their local or staging migration
history before reapplying the renamed migration. This review performs no
operational migration.

Three specialized review roles cover core behavior, unresolved review threads,
and repository documentation. The review/correction/verification cycle is
bounded to three iterations. A persisting failure after the third iteration is
a documented blocker, not an implicit pass.

## Documentation review

`AGENTS.md` already provides the required language, Git, DCO, and issue-tool
policies. It remains unchanged. `CLAUDE.md` now describes the current source
layout and development conventions in English, including all six supported
locales, the pinned toolchain, lockfile synchronization, relevant test commands,
and encryption boundaries. Broken translations, outdated test totals, and
unsupported blanket claims about public-route wiring were removed. The exact
Git/DCO/Minddy-tool and generated Next.js instruction blocks were preserved.

The owned-English guard, documentation diff check, and referenced-source/link
path validation passed for this documentation change.

## Verification status

All migrations replayed on a rebuilt empty public schema in the isolated local
Supabase database `minddy_min591_pr289_20260929`. The empty template's platform
schemas were retained; three inherited Storage icon policies were removed before
the first replay. The resulting public schema matches the refreshed inventory:
199 tables, 1,785 columns, 173 targets, 558 functions, 10 views, and 491 triggers.
These counts validate inventory agreement, not production encryption closure.
The refreshed SQL inventory records the fresh replay's `postgres` migration owner;
ACL owner changes account for most metadata differences. It also captures the
existing billing patch's NULL-input guard, previously absent from its audit hash.

Frozen pnpm installation, 99 release-tooling tests, self-hosted and tools checks
(33 passing cases and one explicit opt-in skip), bootstrap/Compose checks, and
the desktop bundle passed. The first default-suite run passed 8,896 tests but
failed two migration guard tests, with 106 explicit skips. Iteration two passed
8,904 tests across 993 files, with the same 106 explicit skips. Lint, typecheck,
owned-English, encrypted-access, schema/consumer checks, publication guards, and
diff checks passed. All 99 executable SQL regressions passed; three historical
marker-replay scripts were not rerun in this integration review. The new stale-stop
fixture fails with the previous recovery definition and passes with the corrected
one on real PostgreSQL.

The six opt-in PostgreSQL files exercised 76 tests: 75 passed on the fully
replayed template, while the configuration-restore test initially rejected its
18 seeded defaults. Iteration three prepared a separate disposable clone, removed
only those defaults, verified empty users/keys/configuration scope, and reran the
unchanged test successfully. The original replay database was preserved. The
test still rejects a wrong root and a plaintext obsolete writer. No behavioral
assertion was weakened. The 106 default-suite skips remain reported separately.

All three previously open review threads were verified by 41 focused tests and
resolved. The Stop boundary changes passed a further 15 focused tests. All
pre-existing 102 non-merge commits have exact author-matching DCO trailers; the
integration commit also carries its author-matching sign-off.

The first pull-request CI run on `7fb956554` exposed high-severity Undici
advisories in the inherited desktop lockfile. The final iteration updates only
the two already-permitted transitive versions: `6.28.0` to `6.29.0` and `7.29.0`
to `7.30.0`. No override, manifest change, or audit suppression was added. The
desktop audit reports zero vulnerabilities; its bundle and 316 tests across
45 files pass.

Required GitHub checks on the pushed candidate must still be confirmed. The final
GitHub review records the exact SHA, check links, and mergeability after the runs
finish; the local results above do not substitute for those remote checks.

## Production activation boundary

Green code CI and conflict resolution do not establish global data closure.
The application readiness response still reports
`globalReadiness: "not_assessed"`. Keep production encryption flags disabled
until the inventory, verified migration, retained-copy retirement, actual
Storage-service restore, provider reconciliation, and representative staging
search/latency/load gates in the corrective review are satisfied.

No production deployment, data migration, flag change, or merge is authorized
by this review. Historical evidence in the closure matrix and prior checkpoints
remains unchanged. MIN-591 can remain in progress while code integration is
validated; only independently evidenced operational completion can close its
application-wide delivery requirements.
