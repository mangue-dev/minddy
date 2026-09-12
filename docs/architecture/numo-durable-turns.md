# Durable Numo turns

Numo turns are durable jobs. An HTTP request may create or observe a turn, and
SSE may project its activity, but neither owns execution. The authoritative
state is `numo_assistant_turns`; activity is replayed from
`numo_turn_events`.

## State model

A new intent enters `queued`, then a compare-and-swap claim moves it to
`running`. A turn can finish as `completed`, suspend as `waiting_input` or
`waiting_work`, or stop through `stopping` and `stopped`. Infrastructure
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
If a stop races a known worker launch, recording the tool result also attaches
the run to its parent so the execution-side stop can interrupt it. Stopping a
waiting parent marks its active worker for interruption in the same transaction;
stale-stop recovery covers a launch that completed after the stop request.

The checkpoint records the safe round boundary and any worker event used to
continue. It contains no credentials. Live-only tool secrets are not written to
the activity journal and remain subject to the existing message redaction.

## Worker continuation

A successful code-worker launch moves the parent to `waiting_work` with the run
ID it is waiting for. The existing terminal run transition emits a deterministic
parent event. `resume_numo_turn_from_worker` appends that event and queues the
parent in one transaction only when the run is still current.

Duplicate event IDs return `duplicate`. Late or reordered events for an old run
return `ignored`. Therefore they cannot replay a completed mutation or create a
second task. Recovery also joins waiting parents to durable terminal worker
rows, covering both an interrupted post-commit callback and a worker that
finished before its parent entered `waiting_work`.

## Recovery and projections

The Numo drain resumes queued worker continuations without a browser. It also
moves stale initial work to the explicit retry path rather than leaving the
conversation generating forever. An interrupted worker-result continuation is
safe to return to the queue because background continuations cannot invoke
tools. A reconnect reads persisted messages and events after its last sequence;
SSE is only the lower-latency projection of the same activity.
