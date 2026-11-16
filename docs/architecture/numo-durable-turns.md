# Durable Numo turns

Numo turns are durable jobs. An HTTP request may create or observe a turn, and
SSE may project its activity, but neither owns execution. The authoritative
state is `numo_assistant_turns`; activity is replayed from
`numo_turn_events`.

## State model

A new intent enters `queued`, then a compare-and-swap claim moves it to
`running`. A turn can finish as `completed`, suspend as `waiting_input`, or stop
through `stopping` and `stopped`. Infrastructure
failure is `retryable`; a deterministic failure is `failed`.

No turn waits on a gesture nobody is asked to make (MIN-1011): every status
that is not terminal has a job working on it or a deadline that moves it.
`lib/server/numo/turn-lifecycle.ts` lists who moves each status and how soon,
and `turn-lifecycle.test.ts` checks that table against the recovery SQL and the
drain. `waiting_input` is the one status left open on purpose: an interactive
question never blocks its conversation (`begin_numo_turn` ignores it), a later
turn of the same conversation ends it `completed`, and a routine run still
waiting after seven days ends `stopped`. Routines, wakes and reminders can no
longer ask, so only runs that asked before that change wait there.

`reconciling` is what the previous release did with a mutating tool whose job
stopped before its result was recorded: it parked the turn. A turn still in
that state goes back to `retryable` on the next drain, and the resuming job
settles the call as described below.

Claims carry a random token and a timestamp. Only the holder may checkpoint or
finish the turn. A running claim becomes recoverable after six minutes, beyond
the request execution ceiling. Status transitions also project the compatible
`idle`, `generating`, or `error` value onto the historical conversation row.

## Idempotency and checkpoints

The client supplies one request UUID per user intent. `begin_numo_turn` commits
the turn and user message together and returns the existing turn when the same
request is delivered again.

Before a mutating tool runs, `numo_tool_operations` records its tool-call ID,
arguments, replay policy, and execution claim. A completed result is reused.
An unfinished read may be retried. An unfinished mutation is settled by the
job that resumes the turn: the claim, called with `p_resolve_ambiguous`,
reopens the operation under that job's claim and answers `resolve`, and the
turn stays `running`. An external MCP tool that declares `readOnlyHint` runs
again; any other call is never replayed: the model receives an explicit
"outcome unknown, check the state before calling it again" result, which the
ledger records, and the turn continues. Tool result messages are unique per
turn and tool-call ID.
The assistant tool-call message and the checkpoint that authorizes tool
execution commit atomically, so recovery cannot observe an orphaned call.
Stopping Numo retires its turn and execution claim. Stale-stop recovery has the
same scope.

The checkpoint records the safe round boundary used to continue. It contains no credentials. Live-only tool secrets are not written to
the activity journal and remain subject to the existing message redaction.

## Handoff between jobs

A turn is not bound to the function that runs it. Every route that executes a
turn has `maxDuration = 300`, and `lib/server/numo/job-deadline.ts` derives the
job's deadline from it. At the two durable boundaries of the loop, before a
generation and before a tool that has not run yet, `processChat` asks whether
the time left covers that step (105 s for a generation, 90 s for a tool). If
not, it returns a `handoff` suspension: the checkpoint written at that boundary
already describes the next step, so no tool is ever cut in the middle and no
mutation becomes `reconciling` because of the time limit. A job always runs at
least one step before it may hand off. Handoff is armed only on Vercel with
`CRON_SECRET` set, where a new job can take the turn over; a self-hosted server
keeps running the turn to the end in-process.

The executor then calls `hand_off_numo_turn`, which moves the turn from
`running` back to `queued`, due at once, clears the claim and returns the
attempt the claim took: changing jobs never counts toward the three-attempt
ceiling. The conversation stays `generating`. The job asks
`/api/cron/numo-turns?turn=<id>` (with `CRON_SECRET`) to run the turn in a new
invocation; the minute clock picks it up if that request is lost. The live
stream ends with `done { status: "queued", after }`, which the journal does not
record: the client follows the turn by polling the journal from `after`, the
last event it already showed. The journal records each tool result as the tool
message stores it, redacted (a result over 32,000 characters keeps only its
outcome), so a reader that follows the journal sees each tool finish rather
than waiting for the turn's end; the live-only copy, which may show a fresh
secret once, never enters it. Wake and reminder turns run under the background
consent guard in every job. The per-turn spend cap is read from the usage
ledger by turn ID, so it accumulates across jobs, and each model call of a turn
has its own ledger slot (`numoUsageSeq`) however many rounds it runs.

## Retired worker continuation

Until MIN-721, a successful code-worker launch moved the parent to a
`waiting_work` state until the worker finished. Numo no longer launches
workers. Migration `20270109200049_drop_code_agent_schema.sql` stopped the turns
still waiting, removed the state from the status check, and dropped the worker
tables, functions and columns.

## Recovery and projections

The Numo drain recovers pending routine occurrences and stale turns without a
browser. It moves stale initial work to the explicit retry path rather than
leaving the conversation generating forever. Each claim spends one of three
attempts (a handoff returns its own): the job that claims a turn past its last
attempt ends it `failed` with a readable message instead of resuming it again,
and a manual retry starts a fresh count. `recover_stale_numo_turns` returns
the turns it ends without a job (a stale stop, an expired or superseded
question), and the drain runs on them the hooks a job would have run: surface
projection, routine and reminder notifications. The drain then reports every
turn left more than 30 minutes in a status that has a deadline, as a
`NumoTurnStuckError`, so a new stranded case shows before a user notices. A reconnect reads persisted messages and events after its last sequence;
SSE is only the lower-latency projection of the same activity.
