# MIN-617: test suite review

Review date: 2026-10-06. Baseline: `461dad0c64d77e5253e0d211633b44a15a3034ba`.
MIN-614 was already complete when this work started.

## Review method and scope

The [per-file inventory](min-617/inventory.tsv) records every tracked test/spec
file, SQL regression script, and the standalone application-tab concurrency
runner, plus the newly consolidated navigation suite. The baseline contains
1,115 Vitest files (one undiscovered), 47 Node files and 31 SQL test files; there
are another 108 SQL regression scripts and one manual concurrency runner.

All TypeScript/JavaScript test files were screened through a TypeScript AST
inventory for test declarations, assertions, local production imports, module
mocking, duplicate callback bodies, source/artifact reads, and skip/only flags.
The runtime report supplies actual parameterized case counts. Static declaration
counts alone are misleading, including for oxlint's generated RuleTester cases.
The review then examined deletion candidates against their production targets,
retained regressions and fixture setup. This is a systematic suite audit with
focused semantic review; it is not a claim of exhaustive mutation coverage or
that every retained assertion independently proves correct behavior.

The complete baseline Vitest run passed: 9,895 executed cases and 111 skipped
cases across 1,114 files. Screening found 121 source/artifact-reading Vitest files
and 25 static-import/mock overlaps. The overlaps are dependency spies, partial
module mocks, or rendering scaffolds; none justified deleting a behavioral suite.
Only two Vitest files lack direct `expect`/`assert` calls: both use RuleTester and
execute real lint cases. No focused `.only` suite was found.

Four identical callback-body groups were reviewed. The working-diff pair repeats
exactly the same host replies and assertion, so one case was removed. The two
page write-path scanners use different analysis and protect history/announcement
and search projection separately. The assistant encryption callbacks execute
under different table/key cohorts. Those cases remain distinct despite identical
callback text.

## Cleanup decisions

Removed 25 existing cases and enabled two previously undiscovered cases; the
result has 9,872 executed cases and the same 111 skipped cases in 1,109 files.

| Files | Decision and retained coverage |
| --- | --- |
| `lib/import-source-logo.test.ts`, `lib/mcp-agent-logo.test.ts` | Remove seven source-string logo assertions. They lock component names without testing actual rendering or fallback behavior. |
| `lib/task-layout.test.ts` | Remove two source-slice assertions. A 400-character slice cannot establish text metrics. |
| `lib/board-loading-skeleton.test.ts` | Remove two JSX-name/order assertions. They do not exercise loading or measure layout. |
| `lib/app-content-header.test.ts`, `lib/primary-sidebar-chrome.test.ts`, `lib/markdown-link.test.ts` | Remove nine exact CSS/geometry/spelling assertions. Keep native-control visibility/dragging, route/wiring guards, and actual link routing, editing and failed-image behavior. |
| `lib/server/agent/local-surface-coverage.test.ts` | Remove the obsolete “pure tests only” premise and two rules requiring a test file for every desktop module. Keep sensitive route coverage and closed IPC contracts. |
| `lib/server/agent/working-diff.test.ts` | Remove one exact duplicate; keep merge-base resolution and shallow-clone fallback. |
| `lib/server/pages-projection-loadable.test.ts` | Remove its standalone jsdom load subprocess. `pages-md-bundle.test.ts` already requires jsdom under the same Vercel flag and validates a rich Markdown round-trip in that process. |
| `lib/admin-sections.test.ts`, `lib/settings-sections.test.ts` | Consolidate all four cases into `lib/navigation-sections.test.ts`, reading application rendering sites once. |
| `components/pages/blocks/escape.test.ts` | Fix discovery so existing Markdown escaping and active URL scheme rejection cases execute. Include both `.test.ts` and `.test.tsx` under the three test roots. |
| `lib/use-assistant-chat.test.ts` | Keep all 34 behavioral cases. Replace real polling sleeps with fake timeout advancement and restore the clock after unmounting. |

A source read is not by itself a reason to delete a test. Encryption access,
RLS/grant and race guards, redaction, deployed artifact checks, translation
contracts, and cross-file invariants remain. Real process timeout and process-tree
termination tests also remain: their elapsed deadlines exercise the behavior
being protected. Application source, translations, SQL migrations, SQL regression
fixtures, and vendored lint rules are untouched.

## CI cost and changes

The successful recent PR run [37514288954](https://github.com/mangue-dev/minddy/actions/runs/37514288954)
spent 252 s in Vitest, 15 s in typecheck, 157 s building/starting three editions,
25 s in public-repository checks and 33 s scanning Git history. Its checks job
lasted 557 s. The MIN-653 run [37503511840](https://github.com/mangue-dev/minddy/actions/runs/37503511840)
lasted 1,157 s, including an unusual **615 s checkout**; its tests took 260 s,
typecheck 15 s and edition builds 159 s. Test deletion cannot fix a checkout delay.

The workflow now runs two complete Vitest shards concurrently with validation.
Validation still typechecks the full project, bundles the desktop shell, checks
encryption/publication/secrets, runs tooling and egress contracts, evaluates all
seven edition fixtures, and builds/starts all three deployable editions on one
runner. The stable required check `Tests & typecheck` waits for both validation
and the entire test matrix. Its actual shell gate is tested against every pair
of success, failure, cancelled and skipped results. A cancelled or skipped
upstream job cannot silently turn the gate green. Dependency auditing remains a
separate job with unchanged permissions and checks.

`test:tooling` discovers all 36 deterministic Node test files under `scripts`
and `captures/lib`, replacing several overlapping hand-maintained CI lists. All
previously executed deterministic suites remain included. Contribution-workflow,
self-hosting local launcher, smoke-compose, performance fixture seed, and capture
auth-state cases also run now. Database integration files retain their individual
commands and prerequisites. Each Vitest shard builds its own projection artifact,
keeps file isolation, and uploads a JSON timing report for seven days. The cost is
two additional dependency installations and one small aggregation job; this trades
some runner overhead for a shorter critical path rather than reducing coverage.

There are no changed-file filters, disabled test isolation, test exclusions to
hide failures, typecheck exclusions, or removed deployment edition scenarios.
The workflow still uses `pull_request`, read-only permissions, no production
secrets, immutable action pins, and bounded artifact retention.

## Local measurements and verification

Node/Vitest versions are the installed repository versions. Local timings are
single observations on a developer machine, not promises about GitHub runners.

| Measurement | Before | After |
| --- | --- | --- |
| Default full Vitest run | 35.80 s; 9,895 passed, 111 skipped | 35.25 s; 9,872 passed, 111 skipped |
| `use-assistant-chat.test.ts` test execution | 5,390.5 ms | 104.2 ms; all 34 cases retained |
| Full typecheck | 1.03 s with the local incremental cache | Passed; all test and application types still checked |
| Deterministic Node suites | 217 cases available | 218 passed, including the new CI gate regression |

A two-worker threads experiment passed all 9,895 baseline cases in 112.15 s.
A two-worker default fork run during cleanup passed 9,872 cases in 122.65 s.
The file set and concurrent load differed, so this is insufficient evidence for
a pool change; the default fork pool and isolation are preserved.

Validation includes the complete final Vitest suite, full typecheck, lint,
`test:tooling`, all seven edition contract fixtures, encrypted-access/schema checks,
owned-English and immutable-workflow-pin checks, and `git diff --check`.
Both local shards passed with two workers each: 555 files in 61.08 s and
554 files in 65.13 s. Their file sets are disjoint, their union equals
all 1109 discovered files, and their passed/skipped/failed case totals match
the full final suite exactly. Shard runs used separate workers on the same local
machine; GitHub runner timing still needs the first PR run.

## Database and live-probe limits

The 111 default Vitest skips are 82 database cases, 24 live provider/binary
probes, and five edition cases. The edition cases are exercised separately for
all seven fixtures. Database or live prerequisites were not enabled implicitly.
All 31 SQL test files and 108 SQL regression scripts remain intact.

An exploratory run of every Node file executed the Docker-isolated Smart Triage,
routine usage and OAuth regressions, but the existing feedback-erasure concurrency
suite failed because its named Supabase fixture container was absent. Eight
other Node cases skipped their opt-in prerequisites. This is not a green database
validation claim; the deterministic tooling command excludes integration files
instead of pretending to run them against an unspecified database. No database
or live-probe failures were repaired by deleting their assertions.
