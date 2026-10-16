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

`reconciling` is deliberately separate from failure. It means a mutating tool
may have changed external state before its result was durably recorded. The
operation is never retried automatically. A later reconciliation must inspect
the target and make an explicit decision.

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
An unfinished read may be retried; an unfinished mutation becomes
`reconciling`. Tool result messages are unique per turn and tool-call ID.
The assistant tool-call message and the checkpoint that authorizes tool
execution commit atomically, so recovery cannot observe an orphaned call.
Stopping Numo retires its turn and execution claim. Stale-stop recovery has the
same scope.

The checkpoint records the safe round boundary used to continue. It contains no credentials. Live-only tool secrets are not written to
the activity journal and remain subject to the existing message redaction.

## Retired worker continuation

Until MIN-721, a successful code-worker launch moved the parent to a
`waiting_work` state until the worker finished. Numo no longer launches
workers. Migration `20270109200049_drop_code_agent_schema.sql` stopped the turns
still waiting, removed the state from the status check, and dropped the worker
tables, functions and columns.

## Recovery and projections

The Numo drain recovers pending routine occurrences and stale turns without a
browser. It moves stale initial work to the explicit retry path rather than
leaving the conversation generating forever. A reconnect reads persisted messages and events after its last sequence;
SSE is only the lower-latency projection of the same activity.
