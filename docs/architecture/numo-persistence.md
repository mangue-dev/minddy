# Numo conversation persistence

MIN-514 adds a compatibility layer over the two historical stores. It does not
copy messages, rehydrate worker journals, or reinterpret worker summaries as
new assistant replies. The legacy tables remain the write authority during this
incremental rollout; database triggers register every new conversation.

## Identity and access

`numo_conversation_ids` maps each source conversation to a durable UUID. Assistant
UUIDs remain unchanged. Agent conversations receive a separate UUID, preserving
both source IDs even if the two stores contain the same UUID. A run never creates
an identity: all runs reference their existing agent conversation.

`numo_conversation_history`, `numo_messages`, `numo_actions`, and `numo_work`
are security-invoker views. They use the caller's original row policies, including
project membership for private agent work. Project context is a nullable field;
access scope is a separate field. An assistant chat remains owner-only even when
it has project context. No membership is inferred from attached context.

The source foreign keys preserve existing deletion semantics. Soft-deleted project
work is omitted from history; physical source deletion removes its mapping and
active pointer. Projectless chats remain supported without a repository.

## Linked work and historical provenance

A successful persisted `launch_code_agent` tool result is explicit evidence of a
chat launching work. `numo_work_origins` adapts that evidence, checking that the
run was created by the chat owner. It never infers lineage from titles, issue IDs,
or similar prompts. For callers who can read the parent chat, its worker history
is folded into that chat's work references. Other project members continue to see
the original shared work conversation and cannot read the private parent ID.

Worker messages keep their source, original ID, timestamp, turn ID, run ID, and
legacy queue/event references. Their `kind` is `worker_message`, even when their
historical role is `assistant`. Assistant tool results are actions, with their
original tool call identifiers. Attachments and page context remain in the original
message payload. Run journals, checkpoints, resources and PR records are untouched.

## API and writes

`/api/numo/conversations` lists both histories, ordered by `updated_at DESC, id ASC`.
POST creates an owner-only chat with optional project context. Detail GET returns
messages, actions, work, contexts, original artifacts and turns. Each collection has a deterministic timestamp
and ID tie-breaker. PATCH updates title, archive, personal pin and read state through
a server-only RPC with the authenticated actor and transactional access checks. Read cursors advance monotonically.

`/api/numo/resolve?source=assistant|agent|run&id=...` resolves namespaced historical
links to the visible conversation and optional work detail. Unknown/inaccessible
references return 404. Assistant conversation endpoints use the same history;
legacy worker entries open the existing work detail UI until MIN-523 supplies the
shared renderer. Worker messages are never passed to the assistant renderer or loop.

The existing active-conversation table now references the common identity and
checks current access. Its assistant endpoint accepts either history and returns a
work-detail destination when appropriate. Existing assistant writers keep their
UUIDs and automatically populate the common identity through a trigger.

Pins/read cursors for agent histories remain in their existing tables, so old
clients and the common API see the same state. Assistant state uses the new common
state table. Archive/title writes update the source. The compatibility layer does
not change a conversation's project or visibility.

## Restart and verification

The transactional migration registers sources with conflict-safe inserts, installs
triggers before backfill, and uses replaceable views. Rerunning it preserves IDs,
state and message counts. The adapter reads current source values, so concurrent
and later legacy writes need no asynchronous dual-write repair. Launch links are
adapted from persisted tool results, including results arriving after rollout.

Run `supabase test db supabase/tests/numo_conversations.test.sql` against a local
Supabase database after applying migrations. The fixture uses a transaction and
rolls back its data.

SQL fixtures cover both access scopes, different users/projects, UUID collisions,
multiple runs, linked work, attachments, state, deleted projects, and repeat
execution. API tests cover authentication, validation, deterministic reads and
legacy resolution. No deployment or production migration is part of this change.
