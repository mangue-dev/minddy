# MIN-676 private hosted worker selection documentation review

Date: 2026-10-10. Reviewer: agent:/root/native_hosting_terms. This is an agent
source and UI-test review, not human reader acceptance or a paid Claude Code
rehearsal.

## Scope and evidence

All six locales update `ai-settings-and-usage` (revision 9), `numo` (revision 6)
and `code-work` (revision 4), retaining their existing workflow IDs. The change
extends the `native-agent-preview`, `models`, `numo-permissions-and-approvals`,
`numo-execution-model` and `delegate-code-work` sections. The knowledge references
`agents-and-mcp` and `settings-and-data` now distinguish native CLI defaults from
OpenCode API model settings.

Evidence: `components/settings/native-agent-connections.tsx`, its focused UI
tests, `components/settings/account-ai-keys-section.tsx`,
`lib/agent-keys-api.ts`, `lib/agent-engine-preference-api.test.ts`,
`lib/use-agent-preferences-query.ts` and the six message sets. The account
preference endpoint supplies the engine and server eligibility flag; native
login and connection states remain separate ephemeral client state. The native
card preserves a selected unavailable or disconnected native engine and offers
an explicit OpenCode choice. Connected and busy stored profiles permit native
selection; connection failure does not choose another engine automatically.

The guides describe private hosted worker selection, CLI-managed native model
and reasoning defaults, owner settings for routines, native Minddy tools,
reconnection, explicit recovery and retained settings on existing workers.
Native subscriptions fund native inference; Numo conversation calls and hosted
compute still follow Minddy budget and usage rules. Paid Claude Code execution
is explicitly unvalidated. Existing login and two-sandbox diagnostic procedures
are retained; a successful diagnostic does not prove renewal or a complete
implementation run.

All six additions were reviewed for equivalent complete meaning, exact code
agent names and localized controls, private eligibility, fail-closed recovery,
CLI defaults and the distinction between subscription inference and Minddy
usage. Prior procedures and operational evidence are retained without a rerun.
No provider sign-in or hosted inference was performed for this review.

Existing figure assets, framing, alt text and capture dates remain unchanged;
revision markers advance with their articles. The model-default figure caption
now explicitly applies to OpenCode. Its original screenshot remains accurate
for OpenCode; the private native selection is explained in text rather than
presented as an authenticated screenshot or a public feature announcement.

## Verification

The focused native UI, native API client and engine-preference client suites
pass: 13 tests. New coverage proves connected/busy selection eligibility,
retention of an unavailable or disconnected native default, explicit OpenCode
recovery, sanitized selection errors and a partial no-store preference write.
Targeted lint and `git diff --check` pass. No test claims provider renewal or
paid Claude Code execution.

Documentation checks validate 252 locale articles and 92/92 published workflows.
Knowledge and owned-English checks pass. The prior Spanish `numo` source revision
was aligned with the equivalent complete six-locale native-worker additions.
The parent task verifies runtime dispatch and repeats combined checks before
completion; this review records UI/client and documentation evidence only.

## Numo capability mediation

The six account and Numo guides also describe the implemented adapter boundary:
guarded Minddy MCP tools are available; provider-native built-ins, image input
and subagents are unavailable. Numo reads safe account metadata and interprets
questions with the actual frozen worker capabilities. Missing decisions require
user input; unrelated unsupported operations do not gain authorization.

Further evidence: `lib/server/account-settings.ts`,
`lib/server/assistant/worker-harness-context.ts`, the delegation tool results,
`lib/server/assistant/prompt.ts` and `lib/server/numo/turns.ts`. Seven focused
suites pass, 123 tests including account metadata privacy, engine mutation
refusal, owner-bound partial preferences, private eligibility, native connection
requirements, frozen native capability reporting and background worker
mediation. The durable result test uses a Claude capability fixture; it does not
execute paid Claude Code. Targeted lint and whitespace checks pass.

Native admission regression evidence now also includes
`lib/server/agent/pr-lineage.test.ts`: both engines and all five worker intents
freeze subscription funding and connection generation without resolving an API
model, reading BYOK or applying an API model-plan check. Automation/routine
triggers, unavailable connections, explicit continuation of a frozen native
worker after account selection changes, and replaced-generation refusal are
covered. These are mocked admission/metadata tests, not hosted provider runs.
That suite and the account-metadata suite pass, 49 tests; targeted lint,
owned-English and whitespace checks pass after these additions.


## Internal lifecycle documentation and resume budgets

`docs/security/encryption/agent-ephemeral-storage.md` and
`docs/validation/min-676-private-native-prototype.md` now describe the actual
private worker selection contract, protocol 4, SDK-only auth profile handoff,
encrypted allocation-bound forge refresh, portable history, lease/physical
fences, isolated guarded commands and subscription compute admission. They
retain the distinction between implemented checks and pending live acceptance.

The focused `byok-quota` and `numo/worker-mediation` suites pass, 30 tests. New
coverage checks subscription admission against the full account ledger despite
an unrelated validated BYOK key, billing-window reservations for answered
worker questions and relaunches, refusal of missing or exhausted compute
reservations, frozen history/connection metadata and deterministic steering
replay. This is mocked billing and resume evidence, not an SDK or provider run.
Targeted lint, documentation, knowledge, owned-English and whitespace checks
pass after the additions. The parent task owns the separate hosted execution
record and final combined verification.


Native watchdog regression coverage in `drain-native-watchdog.test.ts` adds ten
passing tests. The drain cannot begin credential invalidation or physical
cleanup after losing its atomic stale-snapshot recovery claim. It retains
recovery on uncertain cleanup or a failed terminal stamp, retries revoked
processes still reported alive, avoids replacement allocations, and preserves
the OpenCode watchdog path. The separate SQL recovery RPC and control-plane
fence regressions are outside this review's verification scope; these mocked
drain tests do not establish a live provider cleanup rehearsal.


Native completion authority now has eleven focused tests in
`vm-rest-native-authority.test.ts`; together with the existing completion suite,
53 tests pass. All four terminal paths, provider retry requeue and the
checkpoint-free fallback retain the original rest timestamp and allocation
predicates. A superseded callback cannot publish completion, and missing
authority or two persistence failures cannot report successful landing. The
internal lifecycle guides describe the twenty-minute abandoned-rest recovery
and the separate sixty-second hosted route bound. SQL takeover validation is
owned by the storage agent; this entry records application test evidence only.


The operator guide now requires migration
`20270109200037_abandoned_native_completion.sql` alongside the original recovery
migration. The storage agent reports successful local Docker regressions for
fresh completion protection, twenty-minute abandoned completion takeover,
rest-timestamp rotation and rejection of the old callback after recovery clears
its reap claim. This agent inspected the final RPC/application contract; the
local SQL execution itself belongs to that separate verification record.

The parent task's paid Codex SDK-relayed worker acceptance is documented in the
probe log. The operator guide distinguishes that real supervisor/owner-handler/
vault fixture from UI-to-PR or deployed HTTPS control-plane acceptance. Local
SDK connection diagnostics do not establish ordinary Numo HTTP reachability.
Paid Claude execution and public rollout are still explicitly unvalidated.
