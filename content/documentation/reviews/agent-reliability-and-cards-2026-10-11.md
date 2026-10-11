# Delegated worker reliability and card controls

Date: 2026-10-11. Reviewer: agent:/root. This is an agent source, interface and
language review, not human acceptance or a provider rehearsal.

## Brief and scope

Members need to follow delegated code work, stop it, copy its branch and open its
PR without leaving Minddy. Affected article: `code-work` revision 8 in all six
locales, workflows `N03` and `N04`. Applicable version: 0.11.1 candidate on this
branch. Existing hosted native authentication restrictions remain in the guide.

## Evidence and behavior

PR #406 / MIN-678 showed a native implementation ending without its PR, followed
by a separate publishing run. Its `validate_changes` request failed after the
180-second bridge deadline while repository tests continued until their longer
timeout. The PR already contained its Numo footer on GitHub; Minddy's description
renderer deliberately removed that final line. The recorded final Numo turn
completed after the worker, so this example does not independently reproduce a
premature final parent response.

The shared card and panel now separate state/timer, harness/model, branch and
actions. Stop uses a destructive menu item. The PR button uses the former gray
outline style above the primary View work button; it routes to Minddy's PR view.
The branch copy icon has the localized existing tooltip. The timer accumulates
execution intervals, ignores subagent summaries and excludes input waits.
Incomplete native responses receive bounded repairs. Nonterminal or superseded
terminal snapshots cannot trigger a parent continuation. Authorized implementation
requires PR delivery; missing publication remains an explicit failure.

Explicit validation shares a 150-second shell budget, runs expensive checks in
sequence, limits Vitest/Jest to two workers and sets test environment explicitly.
The installed compatible TypeScript compiler can be used when the default
compiler cannot start under native isolation. Compiler heap is capped. Runtime
installation reuses verified pinned private CLI packages on resumed snapshots.
Startup heartbeat and visible preparation stages cover native bootstrap.

## Language and figures

Reviewed equivalent control and delivery wording in `en`, `fr`, `de`, `es`, `it`
and `pt-BR`. The updated `delegate-code-work-workflow` screenshots use the actual
card component with localized demonstration data and a fixed fixture clock.
Data hooks, navigation transport and the activity feed are isolated; screenshots
do not claim a real provider execution, publication or passing CI. Model logos,
menus, tooltips, buttons and responsive panel primitives are real components.
The existing PR Changes illustration remains accurate and retains its original
capture date. Capture details and checks are recorded below after inspection.

Inspected all six light-mode figures at 568 × 379 CSS pixels, captured at 2×
scale with 24-pixel outer padding. The Italian timer translation was corrected
after the visual review. Also inspected the real copy tooltip and activity panel
in Italian, and the destructive Stop menu at a 390-pixel French dark-mode viewport.
No horizontal overflow was observed. The browser console contained only a missing
fixture favicon; no component errors occurred. These checks used one static fixture
server and one browser session at a time, with the browser closed before compilation.

## Verification

- The targeted 12-file suite passed all 238 tests, including native startup
  heartbeat, incomplete completion repair, required PR delivery, timer intervals,
  destructive cancellation, clipboard copy and internal PR navigation.
- A subsequent 47-test delivery subset passed with the additional regression
  proving that the initial Git probe consumes the shared validation wall budget.
- Typecheck, focused source/test lint, both worker bundle builds and
  `git diff --check` passed.
- `check:documentation`, `check:documentation:release`, `check:knowledge` and
  `check:owned-english` passed. Updated article ID: `code-work`; workflows: `N03`
  and `N04`; updated figure ID: `delegate-code-work-workflow` in all six locales.

No production deployment or paid native provider run was performed. The exact
reported premature Numo wake-up and cold-start provider latency still require
operational confirmation; protective behavior is covered by regression tests.

## Follow-up: parent authority and native cold bootstrap

A read-only audit of the three MIN-678 worker executions found approximately
2, 38 and 74 seconds between creation and claim, followed by 24–25 seconds before
`sandbox_ready` and another 17–19 seconds before the first tool. The two delayed
claims coincide with scheduled drain ticks; this is evidence of queue latency,
not a measurement of how much any individual maintenance step contributed.
The parent final responses followed their workers by approximately 9–10 seconds.
No intermediate parent response in these recorded executions proves the reported
premature wake-up.

Two concrete completion races were corrected. The worker-result RPC now locks
parent then worker, checks terminal state and event type, and compares the
application's observed `started_at` and `rest_claimed_at` generation before
queuing a continuation. This closes the race between the application read and
worker resumption. Codex notifications are accepted only for the active thread
and turn; a delayed completion from an earlier repair cannot finish the new turn.
A completion arriving before its `turn/start` response no longer restores a stale
turn identifier. These identifiers are mandatory in the pinned upstream
[turn completion protocol](https://raw.githubusercontent.com/openai/codex/rust-v0.162.1/codex-rs/app-server-protocol/schema/typescript/v2/TurnCompletedNotification.ts).

Launch and resume now schedule the particular eligible worker without putting
unrelated watchdog, reaper and allocation cleanup ahead of bootstrap. Deployment
scope, local-execution exclusion, due time, atomic claim and sandbox admission
remain enforced; scheduled recovery still performs maintenance. On fresh native
sandboxes the pinned CLI installs alongside repository cloning, before credentials
are imported. Both tasks settle before a failing allocation can be retired.
The supervisor verifies and reuses the installed runtime, then performs the same
isolation, authentication and guarded MCP negotiation. Account inspection no
longer requests an extra proactive OAuth refresh on every cold start, matching the
upstream [account-read contract](https://raw.githubusercontent.com/openai/codex/rust-v0.162.1/codex-rs/app-server-protocol/schema/typescript/v2/GetAccountParams.ts).

Apply migration `20270109200041` before the updated server. The new optional
argument preserves earlier four-argument callers during rollout. The focused
PostgreSQL 16 probe applies the actual migration in a disposable container with
minimal synthetic tables and no network or application database URL. It covers
active workers, superseded generations, result types, duplicate delivery, legacy
call compatibility and delivery racing an uncommitted worker resumption. This is
not a full Supabase replay. The SQL definition and service-only permissions were
introspected and reconciled into the retained encryption inventories. The server
consumer inventory also includes the terminal metadata read missing from the
initial PR check.

These changes affect internal scheduling and completion authority. The six
`code-work` revision 8 guides and their figures still describe the same controls,
wait states and delivery behavior, so no further public article edit is required.
Regression results are recorded below. No production migration, deployment or paid
native model run was performed; actual post-deployment startup timings and the
original reported wake-up remain subject to operational confirmation.

Follow-up verification: all 154 targeted tests across 12 suites passed, plus both
opt-in PostgreSQL concurrency/semantics probes. Typecheck, focused lint, both
worker bundle builds, encryption access/schema checks, owned-English check,
documentation/release checks, knowledge check and `git diff --check` passed.

The built VM bundle's `--prepare-native-cli codex` entry point also passed a real
Linux ARM64 smoke probe in a disposable Node 24 container. It installed and
verified pinned Codex 0.162.1 in 4,579 ms, then verified the retained installation
in 51 ms. The container mounted only the built bundle and received no application
environment, job, authentication profile or model request. These are isolated
bootstrap timings, not measurements of hosted sandbox or provider latency.

After integrating main's PR #406, CI exposed a PR-filter test that asserted the
new link's visible section after network completion but before React Query's
batched observer notification. The test now waits for the same visible state,
flushing React updates between attempts; its assertions and application behavior
are unchanged. All eight tests in that file pass. This test-only synchronization
has no public documentation impact.


## Independent Numo Stop

The owner requested that Stop Numo leave delegated workers running. The request
stop path, all three executor stop paths and SQL stale-stop recovery now stop
only the parent. Admitted queued/running workers, queued messages and pending
questions remain intact. New worker admission still requires a live parent;
individual worker Stop remains scoped to that worker and suppresses parent
continuation. No automatic worker result can revive a stopped Numo turn.

Affected public article: `numo` revision 11 in `en`, `fr`, `de`, `es`, `it` and
`pt-BR`, workflows `N01`, `N02`, `T05`, `N08` and `N05`; this branch's 0.11.1
candidate requires migration `20270109200042`. Each locale now explains the
separate Stop controls, preserved queued work and suppression of automatic
continuation. Existing conversation, permissions, execution-model and MCP
figures show no parent-stop cascade and remain accurate; original capture dates
and evidence are retained. Worker-card screenshots in `code-work` are unchanged.
Internal durable-turn and assistant knowledge references were corrected too.

Application regressions cover request cancellation, concurrent worker launch,
revoked tool checkpoint authority, provider failure while stopping and steering
submission races. The disposable PostgreSQL probe verifies the actual migration,
recovery, owner isolation, late completion and individually scoped worker Stop.
SQL/encryption audit scope and rollout are recorded in
`docs/security/encryption/README.md`. This is source, agent language and focused
runtime review; no hosted UI or production execution is claimed.

Independent Stop verification: 90 focused application tests across six suites and
five opt-in PostgreSQL tests passed, including the updated encrypted stale-stop
SQL regression. Typecheck, focused lint, documentation (92/92 workflows in all
six languages), knowledge, owned-English, encryption schema/access checks and
`git diff --check` passed. No unrelated source, locale runtime strings, production
configuration or existing migration was changed.
