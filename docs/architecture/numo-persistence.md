# Numo conversation persistence

The product presents one Numo experience: the full page, floating panel,
contextual actions, and scheduled requests all open or continue conversations.
People choose a conversation model and reasoning level in the composer.

Until MIN-721, a compatibility layer (MIN-514) merged two stores: assistant chats
and the conversations of the code agent, with the code worker's runs shown as
delegated work. MIN-721 removed the code capability, and migration
`20270109200049_drop_code_agent_schema.sql` dropped the agent store. Numo history
is now backed by assistant conversations only.

## Identity and access

`numo_conversation_ids` maps each assistant conversation (`conversations`) to the
durable UUID used by the API. The two values are equal for every chat; a trigger
registers each new conversation.

`numo_conversation_history`, `numo_user_conversation_history`, `numo_messages`,
`numo_actions`, and `numo_turns` are security-invoker views over
`conversations`, `assistant_messages`, `numo_conversation_state` and
`numo_assistant_turns`. They use the caller's row policies: a chat is owner-only,
even when it has project context. Project context is a nullable field and never
implies membership. The history views keep `source = 'assistant'` and the
`legacy_id` of the underlying chat, so routes that key on them are unchanged.

## API and writes

`/api/numo/conversations` lists the history, ordered by `updated_at DESC, id ASC`.
POST creates an owner-only chat with optional project context. Detail GET returns
messages, actions and turns. Each collection has a deterministic timestamp and ID
tie-breaker. PATCH updates title, archive, personal pin, read state, model and
reasoning level through the server-only `update_numo_conversation` RPC, with the
authenticated actor and transactional access checks. Read cursors advance
monotonically.

The active-conversation table references the common identity and checks current
access. Retired `/agents?run=` links open the Numo panel on the live thread; they
no longer resolve to a conversation.

## Verification

Run `supabase test db supabase/tests/numo_conversations.test.sql` against a local
Supabase database after applying migrations. The fixture uses a transaction and
rolls back its data. API tests in `lib/server/numo/conversations.test.ts` cover
authentication, validation and deterministic reads.
