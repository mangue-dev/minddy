# Numo lifecycle boundary

Numo owns every new user-initiated or background operation. The page and FAB
share the same conversation controller, project context, selected chat model,
reasoning choice, durable turn, and worker mediation. A code worker is not a
second product conversation: it is work linked to the parent Numo turn.

## Entry-point inventory

Voluntary UI actions use `openIntent`. Comment mentions, automation actions,
routine occurrences, and pull-request callbacks use `startNumoIntent`. Both
contracts persist the source and action before execution begins. The only
production call that may invoke `launchAgentRun` with a new delegation is the
`launch_code_agent` implementation in `lib/server/assistant/execute-tool.ts`.
`lib/server/numo/lifecycle-boundary.test.ts` keeps this inventory executable.

The explicit next-cycle action remains a Numo tool operation. It does not open a
worker unless Numo separately decides that repository work is required.

## Historical adapters

Historical assistant conversations stay readable through the unified Numo
history and resolver documented in [numo-persistence.md](numo-persistence.md).
Standalone worker histories remain available through `/agents?run=…` and
`/agents?issue=…`; their event feed, pull-request link, visibility, archive,
read, pin, and desktop-local diff artifacts keep their original source records.

`GET /api/agent-runs` and `GET /api/issues/:id/agent` are read adapters for
those standalone histories. Numo-owned workers are excluded because they appear
only in their parent conversation. The corresponding `POST` endpoints are 410
tombstones with the `numoRequired` code, so stale clients cannot create a new
standalone conversation. The former Agents launch composer, draft store, branch
pickers, and branch-list endpoints have been removed.

## Compatibility and recovery

Conversation identity mappings are additive and preserve the legacy source as
the write authority. The database acceptance fixture records four assistant
mappings, six worker mappings, and ten total mappings after a current Numo
conversation is inserted. It repeats the same request and event IDs to verify
that refresh or interrupted delivery creates one durable turn and one replay
event. Existing worker journals, PR links, attachments, artifacts, pin/read
state, private/project visibility, and routine provenance remain unchanged.

Durable turn recovery reclaims stale orchestration leases, reconciles ambiguous
mutations, resumes terminal worker results once, and mediates worker questions
through the parent conversation. Included usage and routine caps are reserved at
the operation boundary and shared with delegated work, preventing a continuation
from charging the same operation twice.

Migrations are forward-only. During rollout, old application code must not be
pointed at the new schema unless the release compatibility notes allow it. A
rollback restores application code, PostgreSQL, storage, and configuration from
one matching backup set; it does not delete mappings or reinterpret historical
messages in place.
