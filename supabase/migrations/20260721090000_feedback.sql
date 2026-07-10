-- minddy — Feedback public (MIN-37)
-- Board public de votes type Canny, IA-native : les posts sont décomposés en
-- racines (le besoin) + facettes votables (contraintes d'exécution). Le texte
-- soumis est sacré (submitted_*, write-once) ; la couche canonique (title/body,
-- facettes) est dérivée et curée par l'équipe. Merge complet à la Canny avec
-- undo exact (feedback_merge_events.payload enregistre les identités déplacées),
-- mémoire anti-récidive (feedback_merge_rejections), passe IA horaire sur
-- préfiltre kNN pgvector (claim skip-locked + lease auto-guérissant).
-- Toutes les tables sont RLS deny-all : service-role uniquement, les checks
-- d'accès vivent dans lib/server/feedback/*.
-- Idempotent — safe to re-run.

create extension if not exists vector with schema extensions;

-- ── Boards ────────────────────────────────────────────────────────────────────
-- Un board par projet, opt-in. enabled=false = collecte sans publication
-- (la page publique 404) ; les canaux API/interne ne dépendent PAS du board.
create table if not exists public.feedback_boards (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id) on delete cascade,
  token      text not null unique,
  enabled    boolean not null default true,
  -- Secret HS256 partagé pour le SSO signé par le backend du client (distinct
  -- des clés mdy_). En clair : le owner doit pouvoir le réafficher.
  sso_secret text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.feedback_boards enable row level security;
-- Deny-all: no policies. Service-role only.

drop trigger if exists feedback_boards_set_updated_at on public.feedback_boards;
create trigger feedback_boards_set_updated_at
  before update on public.feedback_boards
  for each row execute function public.set_updated_at();

-- ── Identités des utilisateurs finaux ────────────────────────────────────────
-- Jamais d'anonyme : email (OTP), external_id (SSO/API) ou les deux. Le
-- pseudonyme public est généré une fois et stocké (stable, cherchable en SQL).
create table if not exists public.feedback_users (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  external_id  text,
  email        text,
  name         text,
  pseudonym    text not null,
  verified_via text not null check (verified_via in ('email', 'sso', 'api')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint feedback_users_identity check (external_id is not null or email is not null)
);

create unique index if not exists feedback_users_project_external
  on public.feedback_users (project_id, external_id) where external_id is not null;
create unique index if not exists feedback_users_project_email
  on public.feedback_users (project_id, lower(email)) where email is not null;

alter table public.feedback_users enable row level security;

drop trigger if exists feedback_users_set_updated_at on public.feedback_users;
create trigger feedback_users_set_updated_at
  before update on public.feedback_users
  for each row execute function public.set_updated_at();

-- ── Posts (racines) ───────────────────────────────────────────────────────────
-- Double couche : title/body = canonique éditable équipe ; submitted_* = brut
-- sacré, écrit une fois à la soumission, jamais modifié.
create table if not exists public.feedback_posts (
  id                      uuid primary key default gen_random_uuid(),
  project_id              uuid not null references public.projects(id) on delete cascade,
  author_id               uuid references public.feedback_users(id) on delete set null,
  -- Provenance du canal interne (membre qui a saisi au nom d'un user).
  created_by_member       uuid references auth.users(id) on delete set null,
  title                   text not null,
  body                    text not null default '',
  submitted_title         text not null,
  submitted_body          text not null default '',
  status                  text not null default 'open'
                          check (status in ('open', 'planned', 'in_progress', 'shipped', 'declined')),
  vote_count              integer not null default 0,
  issue_id                uuid references public.issues(id) on delete set null,
  -- Tombstone de merge. Profondeur ≤ 1 garantie par aplatissement à l'écriture.
  merged_into_id          uuid references public.feedback_posts(id) on delete set null,
  suggested_merge_into_id uuid references public.feedback_posts(id) on delete set null,
  suggested_confidence    real,
  source                  text not null check (source in ('board', 'api', 'internal')),
  embedding               extensions.vector(1536),
  analyzed_at             timestamptz,
  analysis_claimed_at     timestamptz,
  analysis_failures       integer not null default 0,
  team_response           text,
  team_response_at        timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists feedback_posts_project_status
  on public.feedback_posts (project_id, status);
create index if not exists feedback_posts_merged_into
  on public.feedback_posts (merged_into_id) where merged_into_id is not null;
create index if not exists feedback_posts_issue
  on public.feedback_posts (issue_id) where issue_id is not null;
create index if not exists feedback_posts_author
  on public.feedback_posts (author_id) where author_id is not null;
-- Scan de l'analyseur horaire.
create index if not exists feedback_posts_to_analyze
  on public.feedback_posts (project_id) where analyzed_at is null and merged_into_id is null;

alter table public.feedback_posts enable row level security;

drop trigger if exists feedback_posts_set_updated_at on public.feedback_posts;
create trigger feedback_posts_set_updated_at
  before update on public.feedback_posts
  for each row execute function public.set_updated_at();

-- ── Facettes ──────────────────────────────────────────────────────────────────
create table if not exists public.feedback_facets (
  id                  uuid primary key default gen_random_uuid(),
  post_id             uuid not null references public.feedback_posts(id) on delete cascade,
  text                text not null,
  -- Formulation brute de l'utilisateur quand source='user' (sacrée) ; null sinon.
  submitted_text      text,
  vote_count          integer not null default 0,
  source              text not null check (source in ('ai', 'user', 'team')),
  merged_into_id      uuid references public.feedback_facets(id) on delete set null,
  review_flag         text check (review_flag in ('root_disguised')),
  embedding           extensions.vector(1536),
  created_by          uuid references public.feedback_users(id) on delete set null,
  analyzed_at         timestamptz,
  analysis_claimed_at timestamptz,
  analysis_failures   integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists feedback_facets_post on public.feedback_facets (post_id);

alter table public.feedback_facets enable row level security;

drop trigger if exists feedback_facets_set_updated_at on public.feedback_facets;
create trigger feedback_facets_set_updated_at
  before update on public.feedback_facets
  for each row execute function public.set_updated_at();

-- ── Votes (1 identité = 1 voix) ───────────────────────────────────────────────
create table if not exists public.feedback_votes (
  post_id    uuid not null references public.feedback_posts(id) on delete cascade,
  user_id    uuid not null references public.feedback_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists feedback_votes_user on public.feedback_votes (user_id);

alter table public.feedback_votes enable row level security;

create table if not exists public.feedback_facet_votes (
  facet_id   uuid not null references public.feedback_facets(id) on delete cascade,
  user_id    uuid not null references public.feedback_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (facet_id, user_id)
);

create index if not exists feedback_facet_votes_user on public.feedback_facet_votes (user_id);

alter table public.feedback_facet_votes enable row level security;

-- Provenance : quels posts (bruts) soutiennent cette facette.
create table if not exists public.feedback_facet_sources (
  facet_id   uuid not null references public.feedback_facets(id) on delete cascade,
  post_id    uuid not null references public.feedback_posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (facet_id, post_id)
);

alter table public.feedback_facet_sources enable row level security;

-- ── Compteurs dénormalisés (triggers, y compris UPDATE : le merge déplace les
--    votes par update de post_id/facet_id) ───────────────────────────────────
create or replace function public.feedback_votes_maintain_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.feedback_posts set vote_count = vote_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.feedback_posts set vote_count = greatest(vote_count - 1, 0) where id = old.post_id;
  elsif tg_op = 'UPDATE' and new.post_id is distinct from old.post_id then
    update public.feedback_posts set vote_count = greatest(vote_count - 1, 0) where id = old.post_id;
    update public.feedback_posts set vote_count = vote_count + 1 where id = new.post_id;
  end if;
  return null;
end;
$$;

drop trigger if exists feedback_votes_count on public.feedback_votes;
create trigger feedback_votes_count
  after insert or delete or update of post_id on public.feedback_votes
  for each row execute function public.feedback_votes_maintain_count();

create or replace function public.feedback_facet_votes_maintain_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.feedback_facets set vote_count = vote_count + 1 where id = new.facet_id;
  elsif tg_op = 'DELETE' then
    update public.feedback_facets set vote_count = greatest(vote_count - 1, 0) where id = old.facet_id;
  elsif tg_op = 'UPDATE' and new.facet_id is distinct from old.facet_id then
    update public.feedback_facets set vote_count = greatest(vote_count - 1, 0) where id = old.facet_id;
    update public.feedback_facets set vote_count = vote_count + 1 where id = new.facet_id;
  end if;
  return null;
end;
$$;

drop trigger if exists feedback_facet_votes_count on public.feedback_facet_votes;
create trigger feedback_facet_votes_count
  after insert or delete or update of facet_id on public.feedback_facet_votes
  for each row execute function public.feedback_facet_votes_maintain_count();

-- ── Sessions des utilisateurs finaux (cookie → row, révocable) ────────────────
create table if not exists public.feedback_sessions (
  id           uuid primary key default gen_random_uuid(),
  token_hash   text not null unique,
  board_id     uuid not null references public.feedback_boards(id) on delete cascade,
  user_id      uuid not null references public.feedback_users(id) on delete cascade,
  expires_at   timestamptz not null,
  last_seen_at timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

create index if not exists feedback_sessions_user on public.feedback_sessions (user_id);
create index if not exists feedback_sessions_expiry on public.feedback_sessions (expires_at);

alter table public.feedback_sessions enable row level security;

-- ── Codes OTP (hashés, salés par row id, 10 min) ─────────────────────────────
create table if not exists public.feedback_otp_codes (
  id          uuid primary key default gen_random_uuid(),
  board_id    uuid not null references public.feedback_boards(id) on delete cascade,
  email       text not null,
  code_hash   text not null,
  expires_at  timestamptz not null,
  attempts    integer not null default 0,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists feedback_otp_board_email on public.feedback_otp_codes (board_id, email);
create index if not exists feedback_otp_expiry on public.feedback_otp_codes (expires_at);

alter table public.feedback_otp_codes enable row level security;

-- ── Journal des merges (état exact pour l'undo) ──────────────────────────────
-- payload (kind='post')  : {moved_vote_user_ids, dropped_vote_user_ids,
--                           moved_facet_ids, repointed_chain_ids}
-- payload (kind='facet') : {moved_vote_user_ids, dropped_vote_user_ids,
--                           copied_source_post_ids, repointed_facet_ids}
create table if not exists public.feedback_merge_events (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  kind         text not null check (kind in ('post', 'facet')),
  dup_id       uuid not null,
  canonical_id uuid not null,
  performed_by text not null check (performed_by in ('ai', 'team')),
  actor_id     uuid references auth.users(id) on delete set null,
  confidence   real,
  payload      jsonb not null,
  undone_at    timestamptz,
  undone_by    uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists feedback_merge_events_project
  on public.feedback_merge_events (project_id, created_at desc);
create index if not exists feedback_merge_events_dup on public.feedback_merge_events (dup_id);

alter table public.feedback_merge_events enable row level security;

-- Mémoire anti-récidive : une paire undo-isée ou rejetée ne doit plus jamais
-- être re-mergée ni même re-suggérée par l'IA (filtrée dans les deux sens).
create table if not exists public.feedback_merge_rejections (
  dup_id       uuid not null,
  canonical_id uuid not null,
  project_id   uuid not null references public.projects(id) on delete cascade,
  kind         text not null default 'post' check (kind in ('post', 'facet')),
  rejected_by  uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  primary key (dup_id, canonical_id)
);

create index if not exists feedback_merge_rejections_project
  on public.feedback_merge_rejections (project_id);

alter table public.feedback_merge_rejections enable row level security;

-- ── kNN (cosine, exact — pas d'index vectoriel : volumes par projet faibles,
--    recall parfait ; HNSW seulement si un projet dépasse ~50k posts) ─────────
create or replace function public.match_feedback_posts(
  p_project_id uuid,
  p_embedding  extensions.vector(1536),
  p_exclude    uuid default null,
  p_limit      integer default 8
)
returns table (id uuid, title text, body text, status text, vote_count integer, issue_id uuid, similarity real)
language sql stable security definer set search_path = public, extensions as $$
  select p.id, p.title, p.body, p.status, p.vote_count, p.issue_id,
         (1 - (p.embedding <=> p_embedding))::real as similarity
    from public.feedback_posts p
   where p.project_id = p_project_id
     and p.embedding is not null
     and p.merged_into_id is null
     and (p_exclude is null or p.id <> p_exclude)
   order by p.embedding <=> p_embedding
   limit p_limit;
$$;

revoke all on function public.match_feedback_posts(uuid, extensions.vector, uuid, integer) from public, anon, authenticated;
grant execute on function public.match_feedback_posts(uuid, extensions.vector, uuid, integer) to service_role;

create or replace function public.match_feedback_facets(
  p_post_id   uuid,
  p_embedding extensions.vector(1536),
  p_exclude   uuid default null,
  p_limit     integer default 5
)
returns table (id uuid, facet_text text, vote_count integer, similarity real)
language sql stable security definer set search_path = public, extensions as $$
  select f.id, f.text as facet_text, f.vote_count,
         (1 - (f.embedding <=> p_embedding))::real as similarity
    from public.feedback_facets f
   where f.post_id = p_post_id
     and f.embedding is not null
     and f.merged_into_id is null
     and (p_exclude is null or f.id <> p_exclude)
   order by f.embedding <=> p_embedding
   limit p_limit;
$$;

revoke all on function public.match_feedback_facets(uuid, extensions.vector, uuid, integer) from public, anon, authenticated;
grant execute on function public.match_feedback_facets(uuid, extensions.vector, uuid, integer) to service_role;

-- ── Claim pour la passe horaire (skip locked + lease 15 min auto-guérissant,
--    abandon après 3 échecs) ──────────────────────────────────────────────────
create or replace function public.claim_feedback_posts_for_analysis(p_limit integer)
returns setof public.feedback_posts
language sql security definer set search_path = public, extensions as $$
  update public.feedback_posts p
     set analysis_claimed_at = now()
   where p.id in (
     select id from public.feedback_posts
      where analyzed_at is null
        and merged_into_id is null
        and analysis_failures < 3
        and (analysis_claimed_at is null or analysis_claimed_at < now() - interval '15 minutes')
      order by created_at
      limit p_limit
      for update skip locked
   )
  returning p.*;
$$;

revoke all on function public.claim_feedback_posts_for_analysis(integer) from public, anon, authenticated;
grant execute on function public.claim_feedback_posts_for_analysis(integer) to service_role;

create or replace function public.claim_feedback_facets_for_analysis(p_limit integer)
returns setof public.feedback_facets
language sql security definer set search_path = public, extensions as $$
  update public.feedback_facets f
     set analysis_claimed_at = now()
   where f.id in (
     select id from public.feedback_facets
      where source = 'user'
        and analyzed_at is null
        and merged_into_id is null
        and analysis_failures < 3
        and (analysis_claimed_at is null or analysis_claimed_at < now() - interval '15 minutes')
      order by created_at
      limit p_limit
      for update skip locked
   )
  returning f.*;
$$;

revoke all on function public.claim_feedback_facets_for_analysis(integer) from public, anon, authenticated;
grant execute on function public.claim_feedback_facets_for_analysis(integer) to service_role;

-- ── Merge complet d'un post (à la Canny) ─────────────────────────────────────
-- Union des votes par identité (1 identité = 1 voix), transfert des facettes en
-- bloc (la dédup facette est le travail de la passe horaire), aplatissement des
-- chaînes à l'écriture (redirect toujours en un saut), tombstone, event d'undo.
create or replace function public.merge_feedback_posts(
  p_dup          uuid,
  p_canonical    uuid,
  p_performed_by text,
  p_actor        uuid default null,
  p_confidence   real default null
)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_dup          public.feedback_posts%rowtype;
  v_can          public.feedback_posts%rowtype;
  v_target       uuid;
  v_dropped      uuid[];
  v_moved        uuid[];
  v_moved_facets uuid[];
  v_repointed    uuid[];
  v_event        uuid;
begin
  if p_performed_by not in ('ai', 'team') then
    raise exception 'feedback_merge_invalid_performer';
  end if;

  -- Résolution un saut vers le haut si la cible est elle-même tombstonée
  -- (l'aplatissement garantit une profondeur ≤ 1).
  select coalesce(merged_into_id, id) into v_target
    from public.feedback_posts where id = p_canonical;
  if v_target is null then raise exception 'feedback_merge_target_not_found'; end if;
  if v_target = p_dup then raise exception 'feedback_merge_self'; end if;

  -- Locks ordonnés par id (anti-deadlock).
  if p_dup < v_target then
    select * into v_dup from public.feedback_posts where id = p_dup for update;
    select * into v_can from public.feedback_posts where id = v_target for update;
  else
    select * into v_can from public.feedback_posts where id = v_target for update;
    select * into v_dup from public.feedback_posts where id = p_dup for update;
  end if;

  if v_dup.id is null then raise exception 'feedback_merge_dup_not_found'; end if;
  if v_can.id is null then raise exception 'feedback_merge_target_not_found'; end if;
  if v_dup.project_id <> v_can.project_id then raise exception 'feedback_merge_cross_project'; end if;
  if v_dup.merged_into_id is not null then raise exception 'feedback_merge_dup_already_merged'; end if;
  if v_can.merged_into_id is not null then raise exception 'feedback_merge_target_merged'; end if;
  -- Un post promu en issue ne peut pas être absorbé (il reste cible valide).
  if v_dup.issue_id is not null then raise exception 'feedback_merge_dup_promoted'; end if;

  -- Votes présents des deux côtés : dédupliqués (supprimés côté doublon).
  select coalesce(array_agg(v.user_id), '{}') into v_dropped
    from public.feedback_votes v
   where v.post_id = p_dup
     and exists (
       select 1 from public.feedback_votes c
        where c.post_id = v_target and c.user_id = v.user_id
     );

  delete from public.feedback_votes
   where post_id = p_dup and user_id = any(v_dropped);

  -- Le reste migre (le trigger maintient les deux compteurs).
  with moved as (
    update public.feedback_votes set post_id = v_target
     where post_id = p_dup
    returning user_id
  )
  select coalesce(array_agg(user_id), '{}') into v_moved from moved;

  -- Facettes : transfert en bloc, votes de facettes intacts.
  with mf as (
    update public.feedback_facets set post_id = v_target
     where post_id = p_dup
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_moved_facets from mf;

  -- Aplatissement : tout ce qui pointait vers le doublon repointe la cible.
  with rp as (
    update public.feedback_posts set merged_into_id = v_target
     where merged_into_id = p_dup
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_repointed from rp;

  -- Les suggestions visant le doublon deviennent caduques (non restaurées à
  -- l'undo : l'analyseur les régénère).
  update public.feedback_posts
     set suggested_merge_into_id = null, suggested_confidence = null
   where suggested_merge_into_id = p_dup;

  -- Tombstone.
  update public.feedback_posts
     set merged_into_id = v_target,
         suggested_merge_into_id = null,
         suggested_confidence = null
   where id = p_dup;

  insert into public.feedback_merge_events
    (project_id, kind, dup_id, canonical_id, performed_by, actor_id, confidence, payload)
  values
    (v_dup.project_id, 'post', p_dup, v_target, p_performed_by, p_actor, p_confidence,
     jsonb_build_object(
       'moved_vote_user_ids',   to_jsonb(v_moved),
       'dropped_vote_user_ids', to_jsonb(v_dropped),
       'moved_facet_ids',       to_jsonb(v_moved_facets),
       'repointed_chain_ids',   to_jsonb(v_repointed)
     ))
  returning id into v_event;

  return v_event;
end;
$$;

revoke all on function public.merge_feedback_posts(uuid, uuid, text, uuid, real) from public, anon, authenticated;
grant execute on function public.merge_feedback_posts(uuid, uuid, text, uuid, real) to service_role;

-- ── Merge d'une facette (dédup intra-post) ───────────────────────────────────
create or replace function public.merge_feedback_facets(
  p_dup          uuid,
  p_canonical    uuid,
  p_performed_by text,
  p_actor        uuid default null,
  p_confidence   real default null
)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_dup            public.feedback_facets%rowtype;
  v_can            public.feedback_facets%rowtype;
  v_project        uuid;
  v_dropped        uuid[];
  v_moved          uuid[];
  v_copied_sources uuid[];
  v_repointed      uuid[];
  v_event          uuid;
begin
  if p_performed_by not in ('ai', 'team') then
    raise exception 'feedback_merge_invalid_performer';
  end if;
  if p_dup = p_canonical then raise exception 'feedback_merge_self'; end if;

  if p_dup < p_canonical then
    select * into v_dup from public.feedback_facets where id = p_dup for update;
    select * into v_can from public.feedback_facets where id = p_canonical for update;
  else
    select * into v_can from public.feedback_facets where id = p_canonical for update;
    select * into v_dup from public.feedback_facets where id = p_dup for update;
  end if;

  if v_dup.id is null or v_can.id is null then raise exception 'feedback_merge_facet_not_found'; end if;
  if v_dup.post_id <> v_can.post_id then raise exception 'feedback_merge_facet_cross_post'; end if;
  if v_dup.merged_into_id is not null then raise exception 'feedback_merge_dup_already_merged'; end if;
  if v_can.merged_into_id is not null then raise exception 'feedback_merge_target_merged'; end if;

  select project_id into v_project from public.feedback_posts where id = v_dup.post_id;

  select coalesce(array_agg(v.user_id), '{}') into v_dropped
    from public.feedback_facet_votes v
   where v.facet_id = p_dup
     and exists (
       select 1 from public.feedback_facet_votes c
        where c.facet_id = p_canonical and c.user_id = v.user_id
     );

  delete from public.feedback_facet_votes
   where facet_id = p_dup and user_id = any(v_dropped);

  with moved as (
    update public.feedback_facet_votes set facet_id = p_canonical
     where facet_id = p_dup
    returning user_id
  )
  select coalesce(array_agg(user_id), '{}') into v_moved from moved;

  -- Provenance : copie vers la canonique (le doublon garde ses lignes pour
  -- l'undo) ; on n'enregistre que ce qui a réellement été ajouté.
  with cs as (
    insert into public.feedback_facet_sources (facet_id, post_id)
    select p_canonical, s.post_id
      from public.feedback_facet_sources s
     where s.facet_id = p_dup
    on conflict do nothing
    returning post_id
  )
  select coalesce(array_agg(post_id), '{}') into v_copied_sources from cs;

  with rp as (
    update public.feedback_facets set merged_into_id = p_canonical
     where merged_into_id = p_dup
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_repointed from rp;

  update public.feedback_facets
     set merged_into_id = p_canonical
   where id = p_dup;

  insert into public.feedback_merge_events
    (project_id, kind, dup_id, canonical_id, performed_by, actor_id, confidence, payload)
  values
    (v_project, 'facet', p_dup, p_canonical, p_performed_by, p_actor, p_confidence,
     jsonb_build_object(
       'moved_vote_user_ids',    to_jsonb(v_moved),
       'dropped_vote_user_ids',  to_jsonb(v_dropped),
       'copied_source_post_ids', to_jsonb(v_copied_sources),
       'repointed_facet_ids',    to_jsonb(v_repointed)
     ))
  returning id into v_event;

  return v_event;
end;
$$;

revoke all on function public.merge_feedback_facets(uuid, uuid, text, uuid, real) from public, anon, authenticated;
grant execute on function public.merge_feedback_facets(uuid, uuid, text, uuid, real) to service_role;

-- ── Undo d'un merge (LIFO : refuse si l'état a bougé de façon incompatible) ──
-- Les votes ajoutés sur la canonique APRÈS le merge y restent : seules les
-- identités enregistrées dans le payload sont touchées.
create or replace function public.undo_feedback_merge(p_event uuid, p_actor uuid default null)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_ev             public.feedback_merge_events%rowtype;
  v_state          uuid;
  v_moved          uuid[];
  v_dropped        uuid[];
  v_moved_facets   uuid[];
  v_repointed      uuid[];
  v_copied_sources uuid[];
begin
  select * into v_ev from public.feedback_merge_events where id = p_event for update;
  if v_ev.id is null then raise exception 'feedback_undo_not_found'; end if;
  if v_ev.undone_at is not null then raise exception 'feedback_undo_already_undone'; end if;

  v_moved   := array(select jsonb_array_elements_text(v_ev.payload->'moved_vote_user_ids'))::uuid[];
  v_dropped := array(select jsonb_array_elements_text(v_ev.payload->'dropped_vote_user_ids'))::uuid[];

  if v_ev.kind = 'post' then
    v_moved_facets := array(select jsonb_array_elements_text(v_ev.payload->'moved_facet_ids'))::uuid[];
    v_repointed    := array(select jsonb_array_elements_text(v_ev.payload->'repointed_chain_ids'))::uuid[];

    -- Lock des deux posts, ordonnés par id.
    if v_ev.dup_id < v_ev.canonical_id then
      perform 1 from public.feedback_posts where id = v_ev.dup_id for update;
      perform 1 from public.feedback_posts where id = v_ev.canonical_id for update;
    else
      perform 1 from public.feedback_posts where id = v_ev.canonical_id for update;
      perform 1 from public.feedback_posts where id = v_ev.dup_id for update;
    end if;

    select merged_into_id into v_state from public.feedback_posts where id = v_ev.dup_id;
    if v_state is distinct from v_ev.canonical_id then
      -- La canonique a été mergée depuis (le doublon a été repointé) : undo
      -- LIFO uniquement — défaire d'abord le merge le plus récent.
      raise exception 'feedback_undo_stale';
    end if;

    -- Votes déplacés : reviennent s'ils existent encore (un unvote post-merge
    -- vaut pour le concept fusionné et n'est pas ressuscité).
    update public.feedback_votes set post_id = v_ev.dup_id
     where post_id = v_ev.canonical_id and user_id = any(v_moved);

    -- Votes dédupliqués : leur voix sur le doublon était indépendante.
    insert into public.feedback_votes (post_id, user_id)
    select v_ev.dup_id, u from unnest(v_dropped) as u
    on conflict do nothing;

    -- Facettes : reviennent si l'équipe ne les a pas déplacées/supprimées.
    update public.feedback_facets set post_id = v_ev.dup_id
     where id = any(v_moved_facets) and post_id = v_ev.canonical_id;

    -- Ré-établit l'invariant voteurs-facette ⊆ voteurs-post pour les votes de
    -- facettes arrivés après le merge.
    insert into public.feedback_votes (post_id, user_id)
    select distinct f.post_id, fv.user_id
      from public.feedback_facets f
      join public.feedback_facet_votes fv on fv.facet_id = f.id
     where f.post_id = v_ev.dup_id
    on conflict do nothing;

    -- Dé-tombstone sans re-rentrer dans la file d'analyse.
    update public.feedback_posts
       set merged_into_id = null,
           analyzed_at = coalesce(analyzed_at, now())
     where id = v_ev.dup_id;

    update public.feedback_posts set merged_into_id = v_ev.dup_id
     where id = any(v_repointed) and merged_into_id = v_ev.canonical_id;

  else -- kind = 'facet'
    v_copied_sources := array(select jsonb_array_elements_text(v_ev.payload->'copied_source_post_ids'))::uuid[];
    v_repointed      := array(select jsonb_array_elements_text(v_ev.payload->'repointed_facet_ids'))::uuid[];

    if v_ev.dup_id < v_ev.canonical_id then
      perform 1 from public.feedback_facets where id = v_ev.dup_id for update;
      perform 1 from public.feedback_facets where id = v_ev.canonical_id for update;
    else
      perform 1 from public.feedback_facets where id = v_ev.canonical_id for update;
      perform 1 from public.feedback_facets where id = v_ev.dup_id for update;
    end if;

    select merged_into_id into v_state from public.feedback_facets where id = v_ev.dup_id;
    if v_state is distinct from v_ev.canonical_id then
      raise exception 'feedback_undo_stale';
    end if;

    update public.feedback_facet_votes set facet_id = v_ev.dup_id
     where facet_id = v_ev.canonical_id and user_id = any(v_moved);

    insert into public.feedback_facet_votes (facet_id, user_id)
    select v_ev.dup_id, u from unnest(v_dropped) as u
    on conflict do nothing;

    delete from public.feedback_facet_sources
     where facet_id = v_ev.canonical_id and post_id = any(v_copied_sources);

    update public.feedback_facets
       set merged_into_id = null,
           analyzed_at = coalesce(analyzed_at, now())
     where id = v_ev.dup_id;

    update public.feedback_facets set merged_into_id = v_ev.dup_id
     where id = any(v_repointed) and merged_into_id = v_ev.canonical_id;
  end if;

  -- Mémoire anti-récidive : la paire ne sera plus re-mergée ni re-suggérée.
  insert into public.feedback_merge_rejections (dup_id, canonical_id, project_id, kind, rejected_by)
  values (v_ev.dup_id, v_ev.canonical_id, v_ev.project_id, v_ev.kind, p_actor)
  on conflict do nothing;

  update public.feedback_merge_events
     set undone_at = now(), undone_by = p_actor
   where id = p_event;
end;
$$;

revoke all on function public.undo_feedback_merge(uuid, uuid) from public, anon, authenticated;
grant execute on function public.undo_feedback_merge(uuid, uuid) to service_role;

-- ── Config IA (surchargeable en base, pattern smart_assign_model) ────────────
insert into public.app_config (key, value) values
  ('feedback_analysis_model', 'deepseek/deepseek-v4-flash'),
  ('feedback_embedding_model', 'openai/text-embedding-3-small'),
  ('feedback_merge_auto_threshold', '0.92'),
  ('feedback_merge_suggest_floor', '0.6'),
  ('feedback_analysis_batch_size', '50')
on conflict (key) do nothing;

-- Pas de publication realtime : la page publique est un rendu serveur one-shot
-- et l'onglet équipe refetch à l'ouverture (même note que view_shares).
