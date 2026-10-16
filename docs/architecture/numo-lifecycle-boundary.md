# Numo lifecycle boundary

Numo owns every new user-initiated or background operation. The page and FAB
share the same conversation controller, project context, selected chat model,
reasoning choice, and durable turn. Since MIN-721 Numo has no code capability:
it organizes and tracks work and never launches a code worker.

## Entry-point inventory

Voluntary UI actions use `openIntent`. Comment mentions, automation actions,
routine occurrences, and pull-request callbacks use `startNumoIntent`. Both
contracts persist the source and action before execution begins. No production
code launches a code worker; `lib/server/numo/lifecycle-boundary.test.ts` keeps
this inventory, and the absence of launchers, executable.

The explicit next-cycle action remains a Numo tool operation.

## Historical adapters

Historical assistant conversations stay readable through the unified Numo
history and resolver documented in [numo-persistence.md](numo-persistence.md).
Worker histories from before MIN-721 remain in their original tables as dormant
retained data. The retired `/agents` page is a compatibility redirect: old
`?run=` links open the Numo panel instead of a 404. The `/api/agent-runs`,
`/api/issues/:id/agent` and desktop-local diff surfaces have been removed.

## Compatibility and recovery

Conversation identity mappings are additive and preserve the legacy source as
the write authority. The database acceptance fixture records four assistant
mappings, six worker mappings, and ten total mappings after a current Numo
conversation is inserted. It repeats the same request and event IDs to verify
that refresh or interrupted delivery creates one durable turn and one replay
event. Existing worker journals, PR links, attachments, artifacts, pin/read
state (retained after MIN-721), private/project visibility, and routine provenance remain unchanged.

Durable turn recovery reclaims stale orchestration leases and reconciles
ambiguous mutations. Included usage and routine caps are reserved at the
operation boundary, preventing a continuation from charging the same operation
twice.

Migrations are forward-only. During rollout, old application code must not be
pointed at the new schema unless the release compatibility notes allow it. A
rollback restores application code, PostgreSQL, storage, and configuration from
one matching backup set; it does not delete mappings or reinterpret historical
messages in place.
