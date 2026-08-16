-- Les conversations épinglées sont une préférence personnelle : une conversation
-- visible par toute l'équipe ne doit pas être déplacée pour les autres membres.

create table if not exists public.agent_conversation_pins (
  user_id         uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.agent_conversations(id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (user_id, conversation_id)
);

create index if not exists idx_agent_conversation_pins_conversation
  on public.agent_conversation_pins(conversation_id);

alter table public.agent_conversation_pins enable row level security;

drop policy if exists agent_conversation_pins_select on public.agent_conversation_pins;
create policy agent_conversation_pins_select on public.agent_conversation_pins
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists agent_conversation_pins_insert on public.agent_conversation_pins;
create policy agent_conversation_pins_insert on public.agent_conversation_pins
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.agent_conversations c
      where c.id = conversation_id
        and public.can_access_project(c.project_id)
        and (c.visibility = 'project' or c.owner_id = (select auth.uid()))
    )
  );

drop policy if exists agent_conversation_pins_delete on public.agent_conversation_pins;
create policy agent_conversation_pins_delete on public.agent_conversation_pins
  for delete to authenticated
  using (user_id = (select auth.uid()));
