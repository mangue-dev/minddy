-- minddy — la review d'une PR par Numo devient une SESSION, pas un toast.
--
-- Depuis MIN-141 la passe vivait entièrement dans une requête HTTP : un clic,
-- trois minutes de silence, un toast. Rien n'en restait — ni ce que Numo avait
-- lu, ni ce qu'il avait pensé, ni même le fait QU'il avait relu. D'où trois
-- manques qui se répondaient : aucune vue en direct possible (rien à regarder),
-- aucune reprise après un rechargement (rien à retrouver), et aucun moyen de
-- savoir qu'une PR avait DÉJÀ été relue sur ce diff-là (rien à comparer).
--
-- La session est donc écrite, comme un run d'agent :
--   • `pr_review_runs`   = la passe (modèle, statut, verdict, SHA relu) ;
--   • `pr_review_events` = son flux append-only (phases, points, synthèse),
--                          rejoué à l'ouverture, poussé en direct pendant.
--
-- `head_sha` porte le troisième manque : c'est le diff QUE Numo a lu. Tant que
-- la tête de la PR n'a pas bougé, relancer la passe repaierait un tour de modèle
-- pour le même code — l'UI grise l'entrée, et c'est cette colonne qui le lui dit.
--
-- Le direct passe par un topic privé `pr-review:{id}`, même dispositif que
-- `agent-run:{id}` (20260908090000) : seul l'écran ouvert s'y abonne.
--
-- Idempotent — safe to re-run.

-- ── La passe ────────────────────────────────────────────────────────────────
create table if not exists public.pr_review_runs (
  id                uuid primary key default gen_random_uuid(),
  pull_request_id   uuid not null references public.pull_requests(id) on delete cascade,
  -- Qui a cliqué : c'est lui qui paye (MIN-131), et c'est son choix de modèle.
  user_id           uuid not null references auth.users(id) on delete cascade,
  model             text not null,
  status            text not null default 'running'
                      check (status in ('running', 'done', 'failed')),
  -- Le SHA de tête AU MOMENT de la lecture. Null tant que la forge n'a pas
  -- répondu ; comparé ensuite à la tête courante pour savoir si le diff relu est
  -- encore celui de la PR.
  head_sha          text,
  verdict           text check (verdict in ('approve', 'request_changes', 'comment')),
  inline_comments   integer not null default 0,
  -- Le commentaire de fil qui PORTE la synthèse, chez la forge. C'est lui qui
  -- relie la session à sa trace visible : le fil de la passe (ce que Numo a lu,
  -- les points qu'il a posés) s'affiche rattaché à ce message-là, et non dans un
  -- panneau à côté. Nul si la publication n'a pas eu lieu.
  summary_comment_id bigint,
  -- Code d'échec (`noDiff`, `modelUnavailable`, `modelRefused`, `forge`), jamais
  -- un message : c'est l'UI qui le traduit, dans la langue du lecteur.
  error             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  finished_at       timestamptz
);

-- La dernière passe d'une PR, en tête : c'est la seule que l'écran lit.
create index if not exists idx_pr_review_runs_pr
  on public.pr_review_runs(pull_request_id, created_at desc);

alter table public.pr_review_runs enable row level security;

-- Lecture = quiconque accède à un projet qui lie le dépôt de la PR — exactement
-- la règle de `pull_requests` (une PR est un fait du dépôt, sa review aussi).
-- Écritures : service client uniquement, la passe est serveur de bout en bout.
drop policy if exists pr_review_runs_select on public.pr_review_runs;
create policy pr_review_runs_select on public.pr_review_runs for select
  to authenticated
  using (
    exists (
      select 1
      from public.pull_requests p
      join public.project_git_links l
        on l.provider = p.provider
       and l.repo_full_name = p.repo_full_name
      where p.id = pr_review_runs.pull_request_id
        and public.can_access_project(l.project_id)
    )
  );

drop trigger if exists pr_review_runs_set_updated_at on public.pr_review_runs;
create trigger pr_review_runs_set_updated_at
  before update on public.pr_review_runs
  for each row execute function public.set_updated_at();

-- ── Son flux ────────────────────────────────────────────────────────────────
-- `seq` monotone par passe : le rejeu à l'ouverture et le direct se recollent
-- dessus (un message perdu ne laisse pas de trou, il est déjà en base).
create table if not exists public.pr_review_events (
  id          uuid primary key default gen_random_uuid(),
  review_id   uuid not null references public.pr_review_runs(id) on delete cascade,
  seq         integer not null,
  type        text not null
                check (type in ('status', 'context', 'finding', 'summary', 'error')),
  payload     jsonb,
  created_at  timestamptz not null default now()
);

create unique index if not exists idx_pr_review_events_review_seq
  on public.pr_review_events(review_id, seq);

alter table public.pr_review_events enable row level security;

drop policy if exists pr_review_events_select on public.pr_review_events;
create policy pr_review_events_select on public.pr_review_events for select
  to authenticated
  using (exists (
    select 1 from public.pr_review_runs r
    where r.id = pr_review_events.review_id
      and exists (
        select 1
        from public.pull_requests p
        join public.project_git_links l
          on l.provider = p.provider
         and l.repo_full_name = p.repo_full_name
        where p.id = r.pull_request_id
          and public.can_access_project(l.project_id)
      )
  ));

-- ── Réception du direct ─────────────────────────────────────────────────────
-- Le topic ne porte que l'id de la passe : on remonte à la PR, puis aux projets
-- qui lient son dépôt. En plpgsql pour qu'un topic malformé réponde « non » au
-- lieu de faire échouer l'évaluation de la policy (même précaution que
-- `can_watch_agent_run`).
create or replace function public.can_watch_pr_review(topic text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  rid uuid;
  prid uuid;
begin
  begin
    rid := split_part(topic, ':', 2)::uuid;
  exception when others then
    return false;
  end;
  select pull_request_id into prid from public.pr_review_runs where id = rid;
  if prid is null then
    return false;
  end if;
  return exists (
    select 1
    from public.pull_requests p
    join public.project_git_links l
      on l.provider = p.provider
     and l.repo_full_name = p.repo_full_name
    where p.id = prid
      and public.can_access_project(l.project_id)
  );
end;
$$;

-- Policy REMPLACÉE en entier (il n'y en a qu'une pour toute la réception
-- broadcast) : les quatre branches existantes sont reprises à l'identique, la
-- cinquième est nouvelle.
drop policy if exists members_receive_broadcasts on realtime.messages;
create policy members_receive_broadcasts on realtime.messages
for select to authenticated
using (
  extension = 'broadcast' and (
    (
      realtime.topic() like 'project:%'
      and public.can_access_project(split_part(realtime.topic(), ':', 2)::uuid)
    )
    or (
      realtime.topic() like 'user:%'
      and split_part(realtime.topic(), ':', 2) = (select auth.uid()::text)
    )
    or (
      realtime.topic() like 'agent-run:%'
      and public.can_watch_agent_run(realtime.topic())
    )
    or (
      realtime.topic() like 'numo-comment:%'
      and public.can_watch_numo_comment(realtime.topic())
    )
    or (
      realtime.topic() like 'pr-review:%'
      and public.can_watch_pr_review(realtime.topic())
    )
  )
);

-- ── Le modèle de review, choisi par la personne ─────────────────────────────
-- Le réglage admin `pr_review_model` reste le défaut de l'instance ; cette
-- colonne garde le DERNIER choix du compte, pour que « faire vérifier par Numo »
-- reparte de ce qu'on avait pris la fois d'avant plutôt que du défaut.
alter table public.user_agent_preferences
  add column if not exists pr_review_model text;
