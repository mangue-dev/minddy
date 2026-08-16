-- L'agent de code devient conversationnel : un ticket ou une pull request est
-- un CONTEXTE facultatif, pas l'identite de la conversation.
--
-- Cette migration est volontairement additive. `agent_runs` reste le moteur
-- d'execution pendant la transition, mais chaque run appartient desormais a une
-- conversation explicite. Les nouveaux ecrivains comme les anciens passent par
-- le trigger ci-dessous, ce qui rend le deploiement compatible dans les deux
-- sens (application avant/apres migration).

create table if not exists public.agent_conversations (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  owner_id    uuid references auth.users(id) on delete set null,
  title       text,
  visibility  text not null default 'private'
              check (visibility in ('private', 'project')),
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint agent_conversations_title_length
    check (title is null or char_length(title) <= 200)
);

comment on table public.agent_conversations is
  'Identite durable d une conversation avec l agent de code. Son contexte, ses executions et sa visibilite sont des dimensions independantes.';

create index if not exists idx_agent_conversations_project_updated
  on public.agent_conversations(project_id, updated_at desc);
create index if not exists idx_agent_conversations_owner_updated
  on public.agent_conversations(owner_id, updated_at desc);

-- Le titre et l'archivage sont ecrits directement sur la conversation. Sans ce
-- trigger, ces gestes ne remontent jamais `updated_at` et un tri/cache fonde sur
-- l'activite durable conserve une date anterieure au renommage.
drop trigger if exists agent_conversations_set_updated_at on public.agent_conversations;
create trigger agent_conversations_set_updated_at
  before update on public.agent_conversations
  for each row execute function public.set_updated_at();

create table if not exists public.agent_conversation_contexts (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.agent_conversations(id) on delete cascade,
  kind            text not null check (kind in ('issue', 'pull_request', 'page', 'feedback', 'resource')),
  resource_id     uuid not null,
  role            text not null default 'reference'
                  check (role in ('primary', 'reference')),
  snapshot        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  unique (conversation_id, kind, resource_id)
);

comment on table public.agent_conversation_contexts is
  'Ressources facultatives et multiples donnees en contexte. Aucune ne decide de la visibilite ni des capacites de l agent.';

create index if not exists idx_agent_conversation_contexts_resource
  on public.agent_conversation_contexts(kind, resource_id);

create table if not exists public.agent_conversation_reads (
  user_id         uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.agent_conversations(id) on delete cascade,
  last_read_at    timestamptz not null default now(),
  primary key (user_id, conversation_id)
);

create index if not exists idx_agent_conversation_reads_conversation
  on public.agent_conversation_reads(conversation_id);

-- Une fin d'agent peut maintenant renvoyer vers n'importe quelle conversation,
-- meme sans ticket. `issue_id` reste renseigne lorsqu'il existe pour conserver
-- les libelles historiques de l'inbox.
alter table public.notifications
  add column if not exists agent_conversation_id uuid
    references public.agent_conversations(id) on delete cascade;
create index if not exists idx_notifications_agent_conversation
  on public.notifications(agent_conversation_id)
  where agent_conversation_id is not null;

alter table public.agent_runs
  add column if not exists conversation_id uuid
    references public.agent_conversations(id) on delete cascade;

-- Une conversation par run historique. Garder le meme UUID preserve tous les
-- deep-links ; demain plusieurs runs/tours pourront partager une conversation.
insert into public.agent_conversations (
  id, project_id, owner_id, title, visibility, created_at, updated_at
)
select
  r.id,
  r.project_id,
  r.created_by,
  r.title,
  case
    when r.routine_id is not null
      or r.chain_id is not null
      or r.pull_request_id is not null then 'project'
    else 'private'
  end,
  r.created_at,
  r.updated_at
from public.agent_runs r
on conflict (id) do nothing;

update public.agent_runs
set conversation_id = id
where conversation_id is null;

-- La RLS des runs se fonde sur le projet de la CONVERSATION. Une simple FK sur
-- son id permettrait a un ecrivain service-role de rattacher par erreur le run
-- d'un projet B a une conversation du projet A, puis d'en donner la lecture aux
-- membres de A. La paire rend cet etat impossible plutot que de compter sur tous
-- les futurs producteurs.
create unique index if not exists idx_agent_conversations_id_project
  on public.agent_conversations(id, project_id);
alter table public.agent_runs
  drop constraint if exists agent_runs_conversation_id_fkey;
alter table public.agent_runs
  drop constraint if exists agent_runs_conversation_project_fkey;
alter table public.agent_runs
  add constraint agent_runs_conversation_project_fkey
  foreign key (conversation_id, project_id)
  references public.agent_conversations(id, project_id) on delete cascade;

-- Une notification d'agent porte elle aussi les deux dimensions. Sa cible et
-- le projet utilise pour revalider l'acces ne doivent jamais diverger.
alter table public.notifications
  drop constraint if exists notifications_agent_conversation_id_fkey;
alter table public.notifications
  drop constraint if exists notifications_agent_conversation_project_fkey;
alter table public.notifications
  add constraint notifications_agent_conversation_project_fkey
  foreign key (agent_conversation_id, project_id)
  references public.agent_conversations(id, project_id) on delete cascade;

alter table public.agent_runs
  alter column conversation_id set not null;

-- Deux conversations qui citent le meme ticket ont des workspaces et des
-- branches distincts. Le ticket ne constitue donc plus un verrou d'execution.
drop index if exists public.idx_agent_runs_active_issue;

-- L'ancien verrou par ticket protegeait indirectement une chaîne contre deux
-- etapes concurrentes. On conserve cet invariant sur la vraie identite de
-- l'automatisation, sans bloquer les autres conversations du ticket.
create unique index if not exists idx_agent_runs_active_chain
  on public.agent_runs(chain_id)
  where chain_id is not null and status in ('queued', 'running');

create index if not exists idx_agent_runs_conversation
  on public.agent_runs(conversation_id, created_at);

insert into public.agent_conversation_contexts (conversation_id, kind, resource_id, role)
select conversation_id, 'issue', issue_id, 'primary'
from public.agent_runs
where issue_id is not null
on conflict (conversation_id, kind, resource_id) do nothing;

insert into public.agent_conversation_contexts (conversation_id, kind, resource_id, role)
select conversation_id, 'pull_request', pull_request_id, 'primary'
from public.agent_runs
where pull_request_id is not null
on conflict (conversation_id, kind, resource_id) do nothing;

-- Etat de workspace et de moteur. Il n'a aucune policy cliente : checkpoint,
-- ids de sandbox et ids de cle restent du plan de controle service-role.
create table if not exists public.agent_runtime_sessions (
  conversation_id   uuid primary key references public.agent_conversations(id) on delete cascade,
  current_run_id    uuid references public.agent_runs(id) on delete set null,
  repo_link_id      uuid references public.project_git_links(id) on delete set null,
  connection_id     uuid references public.git_connections(id) on delete set null,
  base_branch       text,
  work_branch       text,
  sandbox_id        text,
  checkpoint        jsonb,
  engine            text,
  execution         text not null default 'cloud'
                    check (execution in ('cloud', 'local')),
  local_worktree    boolean not null default false,
  provider_key_id   text,
  last_activity_at  timestamptz,
  sandbox_stopped_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.agent_runtime_sessions is
  'Workspace et memoire technique durables d une conversation. Jamais utilises pour decider de sa visibilite ou de ses contextes.';

create table if not exists public.agent_artifacts (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.agent_conversations(id) on delete cascade,
  run_id          uuid references public.agent_runs(id) on delete set null,
  kind            text not null check (kind in ('branch', 'pull_request')),
  ref             text not null,
  url             text,
  state           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (conversation_id, kind, ref)
);

create index if not exists idx_agent_artifacts_conversation
  on public.agent_artifacts(conversation_id, created_at);

insert into public.agent_runtime_sessions (
  conversation_id, current_run_id, repo_link_id, connection_id, base_branch,
  work_branch, sandbox_id, checkpoint, engine, execution, local_worktree,
  provider_key_id, last_activity_at, sandbox_stopped_at, created_at, updated_at
)
select
  r.conversation_id, r.id, r.repo_link_id, r.connection_id, r.base_branch,
  r.branch_name, r.sandbox_id, r.checkpoint, r.agent_engine,
  case when r.local_exec then 'local' else 'cloud' end,
  r.local_worktree, r.provider_key_id, r.last_activity_at,
  r.sandbox_stopped_at, r.created_at, r.updated_at
from public.agent_runs r
on conflict (conversation_id) do update set
  current_run_id = excluded.current_run_id,
  updated_at = excluded.updated_at;

insert into public.agent_artifacts (conversation_id, run_id, kind, ref, url, state, created_at, updated_at)
select conversation_id, id, 'branch', branch_name, null, null, created_at, updated_at
from public.agent_runs where branch_name is not null
on conflict (conversation_id, kind, ref) do nothing;

insert into public.agent_artifacts (conversation_id, run_id, kind, ref, url, state, created_at, updated_at)
select conversation_id, id, 'pull_request', pr_number::text, pr_url, pr_state, created_at, updated_at
from public.agent_runs where pr_number is not null
on conflict (conversation_id, kind, ref) do update
set url = excluded.url, state = excluded.state, updated_at = excluded.updated_at;

create or replace function public.sync_agent_runtime_from_run()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.agent_runtime_sessions (
    conversation_id, current_run_id, repo_link_id, connection_id, base_branch,
    work_branch, sandbox_id, checkpoint, engine, execution, local_worktree,
    provider_key_id, last_activity_at, sandbox_stopped_at, created_at, updated_at
  ) values (
    new.conversation_id, new.id, new.repo_link_id, new.connection_id,
    new.base_branch, new.branch_name, new.sandbox_id, new.checkpoint,
    new.agent_engine, case when new.local_exec then 'local' else 'cloud' end,
    new.local_worktree, new.provider_key_id, new.last_activity_at,
    new.sandbox_stopped_at, new.created_at, new.updated_at
  ) on conflict (conversation_id) do update set
    current_run_id = excluded.current_run_id,
    repo_link_id = excluded.repo_link_id,
    connection_id = excluded.connection_id,
    base_branch = excluded.base_branch,
    work_branch = excluded.work_branch,
    sandbox_id = excluded.sandbox_id,
    checkpoint = excluded.checkpoint,
    engine = excluded.engine,
    execution = excluded.execution,
    local_worktree = excluded.local_worktree,
    provider_key_id = excluded.provider_key_id,
    last_activity_at = excluded.last_activity_at,
    sandbox_stopped_at = excluded.sandbox_stopped_at,
    updated_at = excluded.updated_at;

  if new.branch_name is not null then
    insert into public.agent_artifacts (
      conversation_id, run_id, kind, ref, created_at, updated_at
    ) values (
      new.conversation_id, new.id, 'branch', new.branch_name, new.created_at, new.updated_at
    ) on conflict (conversation_id, kind, ref) do update
      set run_id = excluded.run_id, updated_at = excluded.updated_at;
  end if;
  if new.pr_number is not null then
    insert into public.agent_artifacts (
      conversation_id, run_id, kind, ref, url, state, created_at, updated_at
    ) values (
      new.conversation_id, new.id, 'pull_request', new.pr_number::text,
      new.pr_url, new.pr_state, new.created_at, new.updated_at
    ) on conflict (conversation_id, kind, ref) do update
      set run_id = excluded.run_id, url = excluded.url,
          state = excluded.state, updated_at = excluded.updated_at;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_agent_run_runtime_sync on public.agent_runs;
create trigger trg_agent_run_runtime_sync
  after insert or update of repo_link_id, connection_id, base_branch, branch_name,
    sandbox_id, checkpoint, agent_engine, local_exec, local_worktree,
    provider_key_id, last_activity_at, sandbox_stopped_at, pr_number, pr_url,
    pr_state, updated_at
  on public.agent_runs
  for each row execute function public.sync_agent_runtime_from_run();

alter table public.agent_runtime_sessions enable row level security;
alter table public.agent_artifacts enable row level security;

drop policy if exists agent_artifacts_select on public.agent_artifacts;
create policy agent_artifacts_select on public.agent_artifacts for select to authenticated
  using (exists (
    select 1 from public.agent_conversations c
    where c.id = conversation_id
      and public.can_access_project(c.project_id)
      and (c.visibility = 'project' or c.owner_id = (select auth.uid()))
  ));

-- Tous les anciens points d'entree qui inserent encore directement un run
-- recoivent automatiquement leur enveloppe conversationnelle.
create or replace function public.ensure_agent_run_conversation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.conversation_id is null then
    insert into public.agent_conversations (
      id, project_id, owner_id, title, visibility, created_at, updated_at
    ) values (
      new.id,
      new.project_id,
      new.created_by,
      new.title,
      case
        when new.routine_id is not null
          or new.chain_id is not null
          or new.pull_request_id is not null then 'project'
        else 'private'
      end,
      new.created_at,
      new.updated_at
    );
    new.conversation_id := new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_agent_run_ensure_conversation on public.agent_runs;
create trigger trg_agent_run_ensure_conversation
  before insert on public.agent_runs
  for each row execute function public.ensure_agent_run_conversation();

create or replace function public.sync_agent_run_conversation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.agent_conversations
  set title = case
        when tg_op = 'INSERT' or new.title is distinct from old.title then new.title
        else title
      end,
      updated_at = greatest(updated_at, new.updated_at)
  where id = new.conversation_id;

  if new.issue_id is not null then
    insert into public.agent_conversation_contexts (conversation_id, kind, resource_id, role)
    values (new.conversation_id, 'issue', new.issue_id, 'primary')
    on conflict (conversation_id, kind, resource_id) do nothing;
  end if;
  if new.pull_request_id is not null then
    insert into public.agent_conversation_contexts (conversation_id, kind, resource_id, role)
    values (new.conversation_id, 'pull_request', new.pull_request_id, 'primary')
    on conflict (conversation_id, kind, resource_id) do nothing;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_agent_run_sync_conversation on public.agent_runs;
create trigger trg_agent_run_sync_conversation
  after insert or update of title, issue_id, pull_request_id, status, completed_at
  on public.agent_runs
  for each row execute function public.sync_agent_run_conversation();

-- Supprimer un ancien run par une tache de retention ne laisse pas d'enveloppe
-- orpheline. Lorsqu'une conversation est elle-meme supprimee, ce DELETE est un
-- no-op puisque la cascade a deja retire le parent.
create or replace function public.cleanup_agent_run_conversation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.agent_runs where conversation_id = old.conversation_id
  ) then
    delete from public.agent_conversations where id = old.conversation_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_agent_run_cleanup_conversation on public.agent_runs;
create trigger trg_agent_run_cleanup_conversation
  after delete on public.agent_runs
  for each row execute function public.cleanup_agent_run_conversation();

alter table public.agent_conversations enable row level security;
alter table public.agent_conversation_contexts enable row level security;
alter table public.agent_conversation_reads enable row level security;

drop policy if exists agent_conversations_select on public.agent_conversations;
create policy agent_conversations_select on public.agent_conversations for select to authenticated
  using (
    public.can_access_project(project_id)
    and (visibility = 'project' or owner_id = (select auth.uid()))
  );

drop policy if exists agent_conversation_contexts_select on public.agent_conversation_contexts;
create policy agent_conversation_contexts_select on public.agent_conversation_contexts for select to authenticated
  using (exists (
    select 1 from public.agent_conversations c
    where c.id = conversation_id
      and public.can_access_project(c.project_id)
      and (c.visibility = 'project' or c.owner_id = (select auth.uid()))
  ));

drop policy if exists agent_conversation_reads_select on public.agent_conversation_reads;
create policy agent_conversation_reads_select on public.agent_conversation_reads for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists agent_conversation_reads_insert on public.agent_conversation_reads;
create policy agent_conversation_reads_insert on public.agent_conversation_reads for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.agent_conversations c
      where c.id = conversation_id
        and public.can_access_project(c.project_id)
        and (c.visibility = 'project' or c.owner_id = (select auth.uid()))
    )
  );
drop policy if exists agent_conversation_reads_update on public.agent_conversation_reads;
create policy agent_conversation_reads_update on public.agent_conversation_reads for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
drop policy if exists agent_conversation_reads_delete on public.agent_conversation_reads;
create policy agent_conversation_reads_delete on public.agent_conversation_reads for delete to authenticated
  using (user_id = (select auth.uid()));

-- La visibilite explicite est maintenant la source de verite pour les runs et
-- leurs flux. Les ecritures restent reservees au service client.
drop policy if exists agent_runs_select on public.agent_runs;
create policy agent_runs_select on public.agent_runs for select to authenticated
  using (exists (
    select 1 from public.agent_conversations c
    where c.id = conversation_id
      and public.can_access_project(c.project_id)
      and (c.visibility = 'project' or c.owner_id = (select auth.uid()))
  ));

drop policy if exists agent_run_events_select on public.agent_run_events;
create policy agent_run_events_select on public.agent_run_events for select to authenticated
  using (exists (
    select 1
    from public.agent_runs r
    join public.agent_conversations c on c.id = r.conversation_id
    where r.id = run_id
      and public.can_access_project(c.project_id)
      and (c.visibility = 'project' or c.owner_id = (select auth.uid()))
  ));

drop policy if exists agent_run_messages_select on public.agent_run_messages;
create policy agent_run_messages_select on public.agent_run_messages for select to authenticated
  using (exists (
    select 1
    from public.agent_runs r
    join public.agent_conversations c on c.id = r.conversation_id
    where r.id = run_id
      and public.can_access_project(c.project_id)
      and (c.visibility = 'project' or c.owner_id = (select auth.uid()))
  ));

-- Ancien curseur ticket -> curseur de chaque conversation historique de ce
-- ticket. Il n'y a aucune perte d'etat a la bascule de l'interface.
insert into public.agent_conversation_reads (user_id, conversation_id, last_read_at)
select sr.user_id, r.conversation_id, sr.last_read_at
from public.agent_session_reads sr
join public.agent_runs r on r.issue_id = sr.issue_id
on conflict (user_id, conversation_id) do update
set last_read_at = greatest(
  public.agent_conversation_reads.last_read_at,
  excluded.last_read_at
);

-- ── Tours et historique canonique ─────────────────────────────────────────
-- Un tour est une demande naturelle. Les requeues techniques d'un meme travail
-- restent dans le tour ; reprendre une conversation au repos en ouvre un autre.
create table if not exists public.agent_turns (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.agent_conversations(id) on delete cascade,
  run_id          uuid not null references public.agent_runs(id) on delete cascade,
  status          text not null
                  check (status in ('queued', 'running', 'completed', 'failed', 'canceled')),
  model           text,
  reasoning_level text,
  initiated_by    uuid references auth.users(id) on delete set null,
  cost_usd        numeric not null default 0 check (cost_usd >= 0),
  outcome         text,
  error_message   text,
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_agent_turns_conversation_created
  on public.agent_turns(conversation_id, created_at);
create index if not exists idx_agent_turns_run_created
  on public.agent_turns(run_id, created_at);

create table if not exists public.agent_messages (
  id                      uuid primary key default gen_random_uuid(),
  conversation_id         uuid not null references public.agent_conversations(id) on delete cascade,
  turn_id                 uuid references public.agent_turns(id) on delete set null,
  run_id                  uuid references public.agent_runs(id) on delete cascade,
  role                    text not null check (role in ('user', 'assistant', 'system')),
  content                 text not null,
  created_by              uuid references auth.users(id) on delete set null,
  source                  text not null
                          check (source in ('initial_prompt', 'steering', 'assistant_summary', 'system')),
  legacy_queue_message_id uuid references public.agent_run_messages(id) on delete cascade,
  legacy_event_id         uuid references public.agent_run_events(id) on delete cascade,
  created_at              timestamptz not null default now(),
  constraint agent_messages_non_empty check (char_length(content) > 0)
);

create unique index if not exists idx_agent_messages_legacy_queue
  on public.agent_messages(legacy_queue_message_id)
  where legacy_queue_message_id is not null;
create unique index if not exists idx_agent_messages_legacy_event
  on public.agent_messages(legacy_event_id)
  where legacy_event_id is not null;
create index if not exists idx_agent_messages_conversation_created
  on public.agent_messages(conversation_id, created_at, id);

insert into public.agent_turns (
  id, conversation_id, run_id, status, model, reasoning_level, initiated_by,
  cost_usd, outcome, error_message, started_at, completed_at, created_at, updated_at
)
select
  r.id, r.conversation_id, r.id, r.status, r.model, r.reasoning_level,
  r.created_by, r.cost_usd, r.outcome, r.error_message, r.started_at,
  r.completed_at, r.created_at, r.updated_at
from public.agent_runs r
on conflict (id) do nothing;

insert into public.agent_messages (
  conversation_id, turn_id, run_id, role, content, created_by, source, created_at
)
select
  r.conversation_id, r.id, r.id, 'user', r.prompt, r.created_by,
  'initial_prompt', r.created_at
from public.agent_runs r
where nullif(btrim(r.prompt), '') is not null
  and not exists (
    select 1 from public.agent_messages m
    where m.turn_id = r.id and m.source = 'initial_prompt'
  );

insert into public.agent_messages (
  conversation_id, turn_id, run_id, role, content, created_by, source,
  legacy_queue_message_id, created_at
)
select
  r.conversation_id, r.id, r.id, 'user', m.content, m.created_by, 'steering',
  m.id, m.created_at
from public.agent_run_messages m
join public.agent_runs r on r.id = m.run_id
on conflict (legacy_queue_message_id) where legacy_queue_message_id is not null do nothing;

insert into public.agent_messages (
  conversation_id, turn_id, run_id, role, content, source,
  legacy_event_id, created_at
)
select
  r.conversation_id, r.id, r.id, 'assistant', e.payload->>'text',
  'assistant_summary', e.id, e.created_at
from public.agent_run_events e
join public.agent_runs r on r.id = e.run_id
where e.type = 'summary' and nullif(btrim(e.payload->>'text'), '') is not null
on conflict (legacy_event_id) where legacy_event_id is not null do nothing;

create or replace function public.create_agent_turn_for_run()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  turn_id uuid := gen_random_uuid();
begin
  insert into public.agent_turns (
    id, conversation_id, run_id, status, model, reasoning_level, initiated_by,
    cost_usd, outcome, error_message, started_at, completed_at, created_at, updated_at
  ) values (
    turn_id, new.conversation_id, new.id, new.status, new.model,
    new.reasoning_level, new.created_by, new.cost_usd, new.outcome,
    new.error_message, new.started_at, new.completed_at, new.created_at, new.updated_at
  );
  if nullif(btrim(new.prompt), '') is not null then
    insert into public.agent_messages (
      conversation_id, turn_id, run_id, role, content, created_by, source, created_at
    ) values (
      new.conversation_id, turn_id, new.id, 'user', new.prompt, new.created_by,
      'initial_prompt', new.created_at
    );
  end if;
  return null;
end;
$$;

drop trigger if exists trg_agent_run_create_turn on public.agent_runs;
create trigger trg_agent_run_create_turn
  after insert on public.agent_runs
  for each row execute function public.create_agent_turn_for_run();

create or replace function public.sync_agent_turn_from_run()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  turn_id uuid;
  new_turn_id uuid;
begin
  -- Se reveiller apres un etat terminal = nouvelle demande naturelle. Une
  -- requeue running -> queued reste un detail d'execution du tour courant.
  if old.status in ('completed', 'failed', 'canceled') and new.status = 'queued' then
    insert into public.agent_turns (
      conversation_id, run_id, status, model, reasoning_level, initiated_by,
      cost_usd, created_at, updated_at
    ) values (
      new.conversation_id, new.id, new.status, new.model, new.reasoning_level,
      new.created_by, 0, now(), now()
    ) returning id into new_turn_id;

    -- Course fin-de-tour : /steer peut inserer son message pendant que le run
    -- est encore `running`, puis constater `completed` et le re-queue. Le
    -- trigger de capture l'a alors provisoirement rattache au tour precedent.
    -- Tout message encore non consomme est precisement la demande qui doit
    -- ouvrir ce nouveau tour : on repare son rattachement dans la meme
    -- transaction que la transition terminale -> queued.
    update public.agent_messages am
    set turn_id = new_turn_id
    where am.run_id = new.id
      and am.legacy_queue_message_id in (
        select qm.id
        from public.agent_run_messages qm
        where qm.run_id = new.id and qm.consumed_at is null
      );
  else
    select t.id into turn_id
    from public.agent_turns t
    where t.run_id = new.id
    order by t.created_at desc, t.id desc
    limit 1;
    update public.agent_turns
    set status = new.status,
        model = new.model,
        reasoning_level = new.reasoning_level,
        cost_usd = agent_turns.cost_usd + greatest(0, new.cost_usd - old.cost_usd),
        outcome = new.outcome,
        error_message = new.error_message,
        started_at = coalesce(started_at, new.started_at),
        completed_at = new.completed_at,
        updated_at = new.updated_at
    where id = turn_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_agent_run_sync_turn on public.agent_runs;
create trigger trg_agent_run_sync_turn
  after update of status, model, reasoning_level, cost_usd, outcome,
    error_message, started_at, completed_at, updated_at
  on public.agent_runs
  for each row execute function public.sync_agent_turn_from_run();

create or replace function public.capture_agent_queue_message()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  r public.agent_runs;
  turn_id uuid;
begin
  select * into r from public.agent_runs where id = new.run_id;
  select t.id into turn_id
  from public.agent_turns t
  where t.run_id = new.run_id
  order by t.created_at desc, t.id desc
  limit 1;
  insert into public.agent_messages (
    conversation_id, turn_id, run_id, role, content, created_by, source,
    legacy_queue_message_id, created_at
  ) values (
    r.conversation_id, turn_id, new.run_id, 'user', new.content,
    new.created_by, 'steering', new.id, new.created_at
  ) on conflict (legacy_queue_message_id) where legacy_queue_message_id is not null do nothing;
  update public.agent_conversations
  set updated_at = greatest(updated_at, new.created_at)
  where id = r.conversation_id;
  return null;
end;
$$;

drop trigger if exists trg_agent_queue_message_capture on public.agent_run_messages;
create trigger trg_agent_queue_message_capture
  after insert on public.agent_run_messages
  for each row execute function public.capture_agent_queue_message();

create or replace function public.capture_agent_assistant_message()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  r public.agent_runs;
  turn_id uuid;
  content text;
begin
  if new.type <> 'summary' then return null; end if;
  content := nullif(btrim(new.payload->>'text'), '');
  if content is null then return null; end if;
  select * into r from public.agent_runs where id = new.run_id;
  select t.id into turn_id
  from public.agent_turns t
  where t.run_id = new.run_id
  order by t.created_at desc, t.id desc
  limit 1;
  insert into public.agent_messages (
    conversation_id, turn_id, run_id, role, content, source,
    legacy_event_id, created_at
  ) values (
    r.conversation_id, turn_id, new.run_id, 'assistant', content,
    'assistant_summary', new.id, new.created_at
  ) on conflict (legacy_event_id) where legacy_event_id is not null do nothing;
  update public.agent_conversations
  set updated_at = greatest(updated_at, new.created_at)
  where id = r.conversation_id;
  return null;
end;
$$;

drop trigger if exists trg_agent_assistant_message_capture on public.agent_run_events;
create trigger trg_agent_assistant_message_capture
  after insert on public.agent_run_events
  for each row execute function public.capture_agent_assistant_message();

alter table public.agent_turns enable row level security;
alter table public.agent_messages enable row level security;

drop policy if exists agent_turns_select on public.agent_turns;
create policy agent_turns_select on public.agent_turns for select to authenticated
  using (exists (
    select 1 from public.agent_conversations c
    where c.id = conversation_id
      and public.can_access_project(c.project_id)
      and (c.visibility = 'project' or c.owner_id = (select auth.uid()))
  ));

drop policy if exists agent_messages_select on public.agent_messages;
create policy agent_messages_select on public.agent_messages for select to authenticated
  using (exists (
    select 1 from public.agent_conversations c
    where c.id = conversation_id
      and public.can_access_project(c.project_id)
      and (c.visibility = 'project' or c.owner_id = (select auth.uid()))
  ));

-- Le temps reel suit la meme visibilite explicite. Aucune inference a partir
-- d'une routine, d'une PR ou d'un autre contexte ne subsiste ici.
create or replace function public.can_watch_agent_run(topic text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  rid uuid;
  c public.agent_conversations;
begin
  begin
    rid := split_part(topic, ':', 2)::uuid;
  exception when others then
    return false;
  end;
  select ac.* into c
  from public.agent_runs r
  join public.agent_conversations ac on ac.id = r.conversation_id
  where r.id = rid;
  if not found or not public.can_access_project(c.project_id) then return false; end if;
  return c.visibility = 'project' or c.owner_id = (select auth.uid());
end;
$$;
grant execute on function public.can_watch_agent_run(text) to authenticated;

create or replace function public.broadcast_agent_run_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  pid uuid;
  owner uuid;
  visibility text;
  topic text;
  rec jsonb := null;
  old_rec jsonb := null;
  cid uuid;
begin
  cid := case when tg_op = 'DELETE' then old.conversation_id else new.conversation_id end;
  select c.project_id, c.owner_id, c.visibility
    into pid, owner, visibility
  from public.agent_conversations c where c.id = cid;

  if tg_op <> 'DELETE' then
    rec := jsonb_build_object(
      'id', new.id,
      'conversation_id', new.conversation_id,
      'project_id', new.project_id,
      'issue_id', new.issue_id,
      'routine_id', new.routine_id,
      'status', new.status
    );
  end if;
  if tg_op <> 'INSERT' then
    old_rec := jsonb_build_object(
      'id', old.id,
      'conversation_id', old.conversation_id,
      'project_id', old.project_id,
      'issue_id', old.issue_id,
      'routine_id', old.routine_id,
      'status', old.status
    );
  end if;

  topic := case
    when visibility = 'project' and pid is not null then 'project:' || pid
    when visibility = 'private' and owner is not null then 'user:' || owner
  end;
  if topic is not null then
    perform realtime.send(
      jsonb_build_object(
        'operation', tg_op,
        'table', tg_table_name,
        'schema', tg_table_schema,
        'record', rec,
        'old_record', old_rec
      ),
      tg_op,
      topic,
      true
    );
  end if;
  return null;
exception when others then
  return null;
end;
$$;
