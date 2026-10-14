# MIN-683: bounded CI and admission pass, 2026-10-14

This pass resumes the clean existing branch and draft PR420 at `db15c6f8a`.
The root owns CI, integration and all UI measurements; three agents separately
review database/RLS, server bootstrap and preparation/authorized incident
traces. The CI gate precedes the only performance experiment. No merge,
deployment, production migration, index, account permission change, reseed or
shared DTO cache occurs. MIN-683 remains in progress.

## Delivered CI corrections

The two UI suites fail during import because their wholesale React Query mocks
omit the real `hashKey` now imported by the preparator. Partial mocks retain
real module exports and override only the hooks those UI fixtures require.

The autosave failures are exact-call mismatches, not lost saves: the current
hook passes a third `canDispatch` ownership callback. Both tests retain their
exact patch assertions, failure veto, retry and in-flight drain behavior. They
now assert exactly two writes and prove that the callback permits the live
surface but refuses dispatch after actual unmount. No production save behavior
or guarantee is weakened. All 18 cases in the three affected suites pass, and
the full pre-experiment suite passes 11,534 tests (127 intentionally skipped).

The five CI scanner matches are SQL-helper-definition SHA256 fingerprints in
`min-683-db-attribution-results.json`, not credentials or private data bodies.
All eight exported review hashes match the original auth-plan map and independently
recomputed `SHA256(pg_get_functiondef)` in the retained private catalog. The
exception uses only five exact values, their exact evidence path and the
`generic-api-key` rule. Counterexamples prove that changed values and copies in
another path are still detected. Four policy tests and the publishable-history
scan pass. A local `--all` scan also reaches unrelated private history-backup
refs; these are not GitHub/PR history and are not allowlisted or pushed. No
sensitive finding value is exported.

The previously unmentioned aggregate CodeQL check has three alerts in diagnostic
tooling: incomplete comment-marker normalization and two project-scope expression
construction sites. The normalizer now removes markers to a fixed point,
including unterminated markers. Diagnostic project identifiers must pass an
explicit bounded inert-character validation before expression construction.
Ten tooling regressions pass, including malformed/nested markers and attempted
executable/oversized identifiers. Remote CodeQL remains an exact-head check;
local regression success alone does not certify that remote check.

## Bootstrap decision

The [DB review](min-683-db-resume.md), [server design](min-683-bootstrap-resume.md)
and [admission review](min-683-preparation-resume.md) reuse existing attribution.
Complete project delivery was about 609 ms / 1.20 MB while objectives and
members were about 198/214 ms; each ordinary request independently authorizes
the live session. Those measurements support a bounded shared-authorization
bootstrap hypothesis, but summing seven authorization durations is not a gain
estimate under two transport slots.

Whole JSON delivery would block small readers behind collections. The current
`fetchClientRead` also buffers a stream to completion before its final account
check. Independently delivered bootstrap frames require a reviewed transport
and in-flight query coordinator with per-frame account checks, bounded parsing,
owner cancellation, invalidation generations and original optimistic read-start
provenance. That exceeds this small increment. Preserve the complete readers,
RLS, invitations/counts, realtime catch-up and fresh write basis; install no
cross-request TTL cache or unconsumed route. The exact next design is recorded
before source changes in plan task58 and the new bounded-pass section.

## One measured admission candidate, rejected

Plan task66 isolates an execution-only prefix: the first listed project's exact
complete issue read, the first listed Page body/tree, then the original order.
Canonical manifests, selected dependency indexes, the two-slot limit, selected
read handoff, cancellation settlement and forge Retry-After remain intact.
Three behavioral cases fail on the old order and pass on the candidate; 63
focused preparation/real-mounted-handoff cases pass. These tests establish the
proposed scheduling contract, not a speedup.

The retained control is `f5abefe201960ced3435eb3046d640602984f68e` /
`aByBbQwsVOkTw0_Zh99sx`. The candidate is signed source
`df0df1acc` / `42GBfxy2f9Sdm3r17tRLT`. Both actual product manifests and whole
build directories are retained. Their four environment hashes, current complete
source fingerprint, secondary manifest, target selection, collector source and
reader dependency hashes match. The candidate build passes production compilation
and types. Rejection commit `9a51543cb` restores the old source/test order and
the original control build; there is no retained production scheduling change.

Each destination is independently clicked at actual renderer ages 3,023–3,058 ms
with no earlier destination activation or hover. The exact existing excluded
`min683-excluded-independent-first-v2-prearmed-input` collector uses the same
source on both products. The CI normalizer correction changes its eight-file
dependency hash to `0a0e66d68bcbaa7d9a22340214ff1fd1e53ccf105bc52ff4087ffaadda526604`.
It is a new matched cohort; earlier v5 observations and failed focus-window runs
keep their original hashes/statuses. No ordinary focus collector is repaired
or retroactively relabeled.

| Independent first useful paint, ms; loading frames | Web control | Web candidate | Native control | Native candidate |
| --- | ---: | ---: | ---: | ---: |
| Complete project | 552.7 / 0 | 788.2 / 0 | 592.2 / 0 | 700.4 / 0 |
| Primary Page | 472.9 / 46 | 300.5 / 22 | 387.0 / 37 | 333.7 / 27 |
| Foreign Page | 380.6 / 35 | 435.6 / 40 | 413.1 / 38 | 386.3 / 36 |

Each cell is one observation, not a percentile. Primary Page improves while the
first project is slower on both clients, and foreign Page is mixed. Before the
project click both products still report missing scoped prerequisites at three
seconds; the raw transport boundaries do not establish that the prefix alone
causes every observed difference. The data do not justify retention or a general
performance claim. The candidate is rejected rather than widening the matrix or
installing an unvalidated trade-off.

Across the three isolated cases, complete All launch/refresh opportunities are
2,383–2,625 / 2,181–2,306 ms web control versus 2,404–2,555 / 2,056–2,228 ms
candidate; native 2,384–2,632 / 2,054–2,238 versus 2,466–2,563 / 2,239–2,254 ms.
These renderer clocks are not executable startup or all-tab readiness. In the
project phase sampled main-thread task time is 349→444 ms web and 365→410 ms
native; primary Page 210→259 and 228→209 ms; foreign Page 255→213 and 224→217 ms.
Task time includes driver/background work; script is a subset, and no thread
metric is added to useful paint. Whole-case finished/failed HTTP records are
382/399/397→358/398/390 web and 401/412/402→416/398/398 native. These include
prelude and passive work over differing elapsed windows, not fixed-window
admission counts. Complete loading, transport and thread records are archived.

Run labels are `min683-restored-{before,after}-anchored-page-web-1`,
`min683-restored-before-anchored-page-native-2` and
`min683-restored-after-anchored-page-native-1`. All four finish successfully as
excluded diagnostics, with exact content/version, complete issue and secondary
source, ten-tab/destination and Git-connection preservation, and no backoff.
The first native control remains failed: Electron resolution lacked the
already-documented `NODE_PATH=./desktop/node_modules`. A short isolated launcher
diagnostic identifies that prerequisite before the corrected run. It produces
no latency evidence; all of its preservation bookends still pass.

## Verification, publication and remaining work

No journaled content write follows or precedes these comparisons. Every collector
verifies Performance Tester identity and reads current Page versions, then checks
unchanged complete content and metadata. No version is reset. Existing v8 web/native
75-second absence, typing before fresh GET, nonoverlapping merge and held-save
departure proofs are reused: neither the rejected admission change nor these
CI/tool corrections alter their write contract.

The root generates the evidence index once after all five attempts: 119 retained
runs and 27 eligible historical paired navigation comparisons. All 114 earlier
run records remain semantically unchanged. The failed launch stays separate.
Final local validation passes the full 11,534-test suite, tooling tests, lint,
types, documentation/release documentation, knowledge, owned English, encrypted
access/schema and diff checks. The candidate production build passes. The
exact published head's remote CI status is recorded in the issue outcome. The existing PR title,
body and draft state are preserved by `npm run work:pr`; all commits have matching
DCO trailers. Internal performance/tooling documentation is the sole documentation
delta. Public controls, configuration, contributor behavior and release versions
remain accurate; no public article/workflow/figure or translated asset changes.

Full listed-tab readiness before first activation, common navigation below 300 ms,
majority below 100 ms, native Home independence, forced-quit drafts and daily feel
remain open. The private PR420 incident/quota also remains unknown: Tester404 is
expected and no new right or connection change is made. The missing trace is the
already-authorized affected principal's typed failure/body and Retry-After headers,
correlated with structured server/forge failure. It does not block other work.

Next action: implement the narrowly specified request-local bootstrap transport
and query lifecycle contract in a separate bounded pass, starting with complete
small readers delivered independently. Compare current identified products on
the unchanged data before extending it to large issues or Page write receipts.
