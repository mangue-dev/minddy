# Premature worker and Numo completion

Investigated on 2026-10-02 using read-only production routine, turn, worker and
OpenCode journal records, followed by local transport and database replays.
Times below are UTC.

## Evidence and recurrence

The scheduled i18n review occurrence at 07:00 launched worker
`ae84da35-21fc-455e-a96b-8a5eabb8c5fd`. It ran from 07:01:50.980 to
07:12:43.159, or 10 minutes 52 seconds. Its parent turn was
`fd77d5e1-9222-48cb-9928-b45ea595a7e5`.

The worker ended with a normal model `stop`, followed by session idle. Its
final reply reported an untranslated key and announced that it was generating
diffs. It did not produce the promised edits or a PR. The continuation detector
only recognized a few announcements at the start of the reply; the observation
before the pending action bypassed it. The exact localized final reply is an
intentional fixture in `lib/ai-completion.test.ts` and the supervisor tests.

Numo subsequently announced a relaunch but serialized `launch_code_agent` and
its arguments as XML in ordinary content. Native tools are read from the
provider's `delta.tool_calls`, so no new worker launched. This response still
completed the parent turn. Hiding XML in the display does not repair the missing
action; it needs a new native tool round or an explicit failure.

Worker `0370812d-032d-48bb-a0ea-3b65bbc9a213` on October 1 stopped after
8 minutes 28 seconds with an observation followed by another pending action.
The observed durations do not establish a 9 minute 40 second timeout. Existing
limits for VM lifetime, turns, shell silence and provider inactivity also do not
explain these normal model stops.

Earlier MIN-203 safeguards lived in the retired house agent loop. That loop was
removed during the OpenCode migration in commit `c9286df2a`; its behavior was
not fully transferred to the current supervisor. The recent XML display filter
addresses rendering, rather than completion. Tests must exercise both current
execution paths to prevent another partial correction.

## Correction

- The shared completion detector recognizes pending actions after findings in
  English and French. It excludes quoted code/examples and conditional offers.
  This is a targeted heuristic, not a proof of arbitrary model task completion.
- OpenCode requires a parent `stop` with a nonempty valid reply and a parent idle
  event. Truncated or unknown finishes, empty replies, serialized tool text and
  pending announcements receive at most two corrective prompts. A stream closing
  before the parent confirms completion fails with `replyIncomplete`.
  Each new prompt clears the preceding completion signal, including steering
  and shell/permission recovery. EOF aborts the engine and confirms idle before
  export; a forced shutdown retains the last durable journal cursor.
- Incomplete workers retain their OpenCode journal and checkpoint. They emit no
  successful summary or final outcome, and the supervisor does not commit/push
  their partial checkout. Existing failure notification and localized error
  rendering use `replyIncomplete`; there is no automatic requeue loop.
  Persisted outcomes clear on incomplete resumed turns, so an earlier successful
  summary cannot override the current failure in the parent delegation.
- Numo validates terminal responses and native tool fragments before execution.
  It handles final SSE lines without trailing newlines. Invalid JSON, missing
  IDs/names, duplicate IDs, truncation, XML, missing terminal signals and pending
  actions trigger bounded correction. Serialized XML is never executed.
- Numo persists the correction count, pending instruction and exhaustion marker.
  Exhaustion explicitly fails the durable turn; a restarted drain cannot reset
  the counter. Stop, budget checks, usage accounting and the existing tool-round
  cap remain active during correction. A valid native launch executes once and
  transitions to the existing durable worker wait.
- Forward migration `20270109200024_numo_completion_repairs.sql` preserves
  `completionRepairs` from the locked preceding checkpoint in the plain native
  tool RPC. Message insertion and checkpoint replacement remain atomic, and
  pending/exhausted flags clear together. The protected RPC already accepts the
  complete encrypted checkpoint; its caller now includes the count. Existing
  ownership, claim/status predicates, empty search path and service-role-only
  grants are unchanged. Only the corresponding SQL and migration audit hashes
  change in the encryption inventory.

## Verification

Final validation: `npm test` passed 9,346 tests across 1,034 files, with 112 tests
in 19 files skipped by the existing suite. `npm run typecheck`, repository lint,
`npm run build:agent-vm`, owned-English, encrypted-access, encryption-schema and
`git diff --check` passed. The final follow-up changes also passed scoped lint.
Excluded localization/credit paths and lockfiles are untouched.

Both recorded worker replies are replayed through the actual supervisor and
OpenCode event translator. The tests require a corrective prompt, a subsequent
native tool result and only the genuine final summary. A separate Numo replay
requires split XML content to become one native worker launch and a durable wait.
Additional tests cover exhaustion, empty/truncated/unknown finishes, clean EOF,
malformed native calls, Stop, budget refusal, caps, empty steered rounds, EOF
quiescence/forced shutdown and durable resumption.

Mutation checks establish that the incident tests detect the original faults:

- Removing the supervisor's pending-action guard makes both recorded worker
  replay tests fail.
- Bypassing Numo's completion validation makes the XML-to-native-launch replay
  fail: no real worker is launched.
- The original checkpoint RPC fails the SQL fixture because it drops the repair
  count. Applying the actual forward migration passes all seven SQL assertions,
  including atomic message/checkpoint linkage, lost-claim fencing, Stop fencing,
  a zero default count and execution grants.
- The empty steered round and both EOF abort assertions fail before the final
  review fixes, then pass after completion signals reset and EOF is quiesced.

The SQL replay runs on PostgreSQL in PGlite with real turn/message definitions
extracted by `test/numo-completion-fixture.mjs`. The original function's
`pg_get_functiondef` hash matches the previously reviewed inventory. Unrelated
relations are stubs; this is not a full Supabase installation.

To repeat SQL verification on a disposable PostgreSQL database, emit that
fixture into `psql`, run `supabase/tests/numo_completion_checkpoint.test.sql`
(expected failure before the fix), apply the forward migration, then rerun the
test (expected success). Fixtures roll back. The test needs no pgTAP extension.

No production migration, routine relaunch or deployment was performed. The
transport tests use deterministic provider responses, not a new live GLM run.
