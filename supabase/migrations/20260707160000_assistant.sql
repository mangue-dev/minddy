-- minddy — chantier « Numo » (assistant IA)
-- Conversations + messages de l'assistant (protocole OpenAI-chat, façon AutoKap)
-- et table app_config (clé/valeur, service-role only) pour le modèle IA.
-- project_id NULL sur une conversation = mode global (hors projet).
-- Idempotent — safe to re-run.

create table if not exists public.conversations (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid references public.projects(id) on delete cascade, -- NULL = global
  user_id       uuid not null references auth.users(id) on delete cascade,
  title         text,
  status        text not null default 'idle' check (status in ('idle', 'generating', 'error')),
  error_message text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_conversations_project on public.conversations(project_id);
create index if not exists idx_conversations_user on public.conversations(user_id);

create table if not exists public.assistant_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role            text not null check (role in ('user', 'assistant', 'system', 'tool')),
  content         text,
  tool_calls      jsonb,          -- [{id, type:'function', function:{name, arguments}}]
  tool_call_id    text,           -- set on role='tool' rows
  tool_name       text,
  metadata        jsonb not null default '{}'::jsonb,
  context         jsonb,          -- page context of the originating user message
  created_at      timestamptz not null default now()
);

create index if not exists idx_assistant_messages_conversation
  on public.assistant_messages(conversation_id);

alter table public.conversations enable row level security;
alter table public.assistant_messages enable row level security;

-- Conversations are strictly personal (user_id = auth.uid()).
drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations for select
  using (user_id = auth.uid());

drop policy if exists conversations_insert on public.conversations;
create policy conversations_insert on public.conversations for insert
  with check (user_id = auth.uid());

drop policy if exists conversations_update on public.conversations;
create policy conversations_update on public.conversations for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists conversations_delete on public.conversations;
create policy conversations_delete on public.conversations for delete
  using (user_id = auth.uid());

-- Messages follow the ownership of their conversation.
drop policy if exists assistant_messages_select on public.assistant_messages;
create policy assistant_messages_select on public.assistant_messages for select
  using (exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.user_id = auth.uid()
  ));

drop policy if exists assistant_messages_insert on public.assistant_messages;
create policy assistant_messages_insert on public.assistant_messages for insert
  with check (exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.user_id = auth.uid()
  ));

drop trigger if exists conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

-- App-wide key/value configuration (AI models…). RLS on with no user policies:
-- only the service role reads/writes it.
create table if not exists public.app_config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_config enable row level security;

insert into public.app_config (key, value)
values ('assistant_model', 'deepseek/deepseek-v4-flash')
on conflict (key) do nothing;

insert into public.app_config (key, value)
values ('fallback_model', 'deepseek/deepseek-v4-flash')
on conflict (key) do nothing;
