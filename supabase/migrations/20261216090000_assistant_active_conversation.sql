-- minddy — la conversation VIVANTE de Numo est un fait de serveur.
--
-- Les conversations et leurs messages sont en base depuis le premier jour ; ce
-- qui ne l'était pas, c'est le POINTEUR : « laquelle est ouverte ». Il vivait
-- dans localStorage, une clé par portée (`assistant-active-conv-<projet>`), et
-- c'est lui qui cassait. Une navigation changeait la portée, donc la clé lue,
-- donc la conversation affichée : le fil disparaissait de l'écran alors qu'il
-- n'avait jamais quitté la base. Un rechargement dans un autre onglet, un autre
-- navigateur ou l'app de bureau repartait, lui, de rien.
--
-- Une ligne par utilisateur, pas une par portée : depuis MIN-353 la conversation
-- porte SA portée (son `project_id`) et ne change plus avec l'URL. Il n'y a donc
-- qu'une seule conversation ouverte à la fois, où qu'on soit dans l'app.
--
-- `on delete cascade` sur `conversation_id` : supprimer une conversation efface
-- le pointeur qui la désigne, sans code pour s'en occuper — c'est la base qui
-- garantit qu'on ne restaure jamais un fil disparu.
--
-- Idempotent — safe to re-run.

create table if not exists public.assistant_active_conversation (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  updated_at      timestamptz not null default now()
);

comment on table public.assistant_active_conversation is
  'La conversation Numo ouverte pour cet utilisateur (MIN-353). Une ligne par utilisateur : la portée (projet ou global) est portée par la conversation elle-même, pas par ce pointeur. Absence de ligne = aucune conversation ouverte (le panneau part d''un écran vide).';

create index if not exists idx_assistant_active_conversation_conversation
  on public.assistant_active_conversation(conversation_id);

alter table public.assistant_active_conversation enable row level security;

-- Strictement personnel, comme les conversations qu'il désigne.
drop policy if exists assistant_active_conversation_select
  on public.assistant_active_conversation;
create policy assistant_active_conversation_select
  on public.assistant_active_conversation for select
  using (user_id = auth.uid());

drop policy if exists assistant_active_conversation_insert
  on public.assistant_active_conversation;
create policy assistant_active_conversation_insert
  on public.assistant_active_conversation for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

drop policy if exists assistant_active_conversation_update
  on public.assistant_active_conversation;
create policy assistant_active_conversation_update
  on public.assistant_active_conversation for update
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

drop policy if exists assistant_active_conversation_delete
  on public.assistant_active_conversation;
create policy assistant_active_conversation_delete
  on public.assistant_active_conversation for delete
  using (user_id = auth.uid());

drop trigger if exists assistant_active_conversation_set_updated_at
  on public.assistant_active_conversation;
create trigger assistant_active_conversation_set_updated_at
  before update on public.assistant_active_conversation
  for each row execute function public.set_updated_at();
