-- minddy — MIN-90 : comptes INTERNES, exclus des statistiques.
--
-- L'équipe, les comptes de démo (captures), les bots de vérification : ils
-- existent, ils utilisent l'app, mais les compter fausse chaque chiffre qu'on
-- regarde pour piloter le produit — « 5 comptes » dont 4 à nous ne dit rien de
-- l'adoption. Un compte marqué interne reste donc PARFAITEMENT visible dans la
-- vue « Utilisateurs » (et administrable), mais il ne compte nulle part dans la
-- vue d'ensemble : ni comptes, ni actifs, ni inscriptions, ni plans, ni
-- onboarding, ni les projets et tickets qu'il a créés.
--
-- Le drapeau vit dans `auth.users.raw_app_meta_data->>'internal'`, comme le rôle
-- admin (`app_metadata.role`) : app_metadata n'est PAS modifiable par
-- l'utilisateur — seul le service client y écrit (route `PATCH /api/admin/users`,
-- elle-même gatée par `isAdminUser`). Pas de table, pas de jointure de plus.

-- ── une ligne par compte (+ son drapeau interne) ─────────────────────────────
-- `drop` obligatoire : ajouter une colonne de sortie change le type de retour,
-- ce qu'un `create or replace` refuse.
drop function if exists public.get_admin_users_overview(text, integer, integer);

create function public.get_admin_users_overview(
  p_search text default null,
  p_limit  integer default 25,
  p_offset integer default 0
)
returns table (
  user_id            uuid,
  email              text,
  meta               jsonb,
  created_at         timestamptz,
  last_sign_in_at    timestamptz,
  email_confirmed_at timestamptz,
  is_internal        boolean,
  projects_owned     bigint,
  projects_member    bigint,
  issues_accessible  bigint,
  issues_created     bigint,
  last_activity_at   timestamptz,
  spent_month        numeric,
  ai_calls           bigint,
  reset_at           timestamptz,
  total_count        bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with matched as (
    select
      u.id,
      u.email::text as email,
      coalesce(u.raw_user_meta_data, '{}'::jsonb) as meta,
      u.created_at,
      u.last_sign_in_at,
      u.email_confirmed_at,
      coalesce(u.raw_app_meta_data->>'internal', '') = 'true' as is_internal
    from auth.users u
    where u.deleted_at is null
      and (
        nullif(btrim(coalesce(p_search, '')), '') is null
        or u.email ilike '%' || btrim(p_search) || '%'
        or coalesce(
             u.raw_user_meta_data->>'display_name',
             u.raw_user_meta_data->>'full_name',
             u.raw_user_meta_data->>'name',
             ''
           ) ilike '%' || btrim(p_search) || '%'
      )
  ),
  page as (
    select m.*, count(*) over () as total_count
    from matched m
    order by m.created_at desc
    limit greatest(coalesce(p_limit, 25), 0)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select
    p.id,
    p.email,
    p.meta,
    p.created_at,
    p.last_sign_in_at,
    p.email_confirmed_at,
    p.is_internal,
    counts.projects_owned,
    counts.projects_member,
    counts.issues_accessible,
    counts.issues_created,
    -- GREATEST ignore les NULL en Postgres : un compte sans activité renvoie
    -- simplement sa dernière connexion (ou NULL s'il ne s'est jamais connecté).
    greatest(p.last_sign_in_at, activity.last_at) as last_activity_at,
    spend.spent_month,
    spend.ai_calls,
    r.reset_at,
    p.total_count
  from page p
  left join lateral (
    select
      -- Projets VIVANTS : un projet soft-supprimé ne compte plus, ni pour la
      -- vue admin ni pour le signal d'onboarding « créer son premier projet ».
      (select count(*)
         from public.projects pr
        where pr.owner_id = p.id and pr.deleted_at is null) as projects_owned,
      (select count(*)
         from public.project_members pm
         join public.projects pr on pr.id = pm.project_id and pr.deleted_at is null
        where pm.user_id = p.id) as projects_member,
      -- Tickets ACCESSIBLES (projets possédés + projets rejoints) : c'est le
      -- signal que lit l'onboarding, et le « nombre de tickets » que l'admin
      -- attend en face d'un compte.
      (select count(*)
         from public.issues i
         join public.projects pr on pr.id = i.project_id and pr.deleted_at is null
        where pr.owner_id = p.id
           or exists (
                select 1 from public.project_members pm
                 where pm.project_id = pr.id and pm.user_id = p.id
              )) as issues_accessible,
      -- Tickets écrits de sa main, où qu'ils soient : sa contribution réelle.
      (select count(*)
         from public.issues i
        where i.created_by = p.id) as issues_created
  ) counts on true
  left join lateral (
    select greatest(
      (select max(se.occurred_at) from public.stat_events se where se.user_id  = p.id),
      (select max(c.created_at)   from public.comments    c  where c.author_id = p.id),
      (select max(a.created_at)   from public.ai_usage    a  where a.user_id   = p.id),
      (select max(i.created_at)   from public.issues      i  where i.created_by = p.id)
    ) as last_at
  ) activity on true
  left join lateral (
    -- Dépense du MOIS CALENDAIRE, brute. La dépense réellement comptée par le
    -- budget (fenêtre Stripe + filigrane de remise à zéro) est résolue côté
    -- route par `getUserUsage` — elle dépend du cycle de facturation.
    select
      coalesce(sum(a.cost), 0)::numeric as spent_month,
      count(*)::bigint                  as ai_calls
    from public.ai_usage a
    where a.user_id = p.id
      and a.created_at >= date_trunc('month', now())
  ) spend on true
  left join public.agent_quota_resets r on r.user_id = p.id
  order by p.created_at desc;
$$;

revoke all on function public.get_admin_users_overview(text, integer, integer) from public;
grant execute on function public.get_admin_users_overview(text, integer, integer) to service_role;

-- ── totaux et activité de l'app, comptes internes exclus ─────────────────────
-- « Actif » n'est PAS « connecté » : `last_sign_in_at` ne bouge pas au
-- rafraîchissement de jeton, un utilisateur quotidien peut n'avoir signé
-- qu'une fois il y a six mois. On prend donc l'union des traces attribuées —
-- ticket créé/terminé (`stat_events`), commentaire, appel IA, ticket créé — ET
-- la dernière connexion. Le libellé de l'écran explicite cette définition.
--
-- `accounts` est LE filtre : il exclut les comptes supprimés et les comptes
-- internes, et tout le reste (activité, inscriptions, projets, tickets) s'y
-- rattache. `internal_users` est renvoyé à part pour que l'écran puisse dire
-- combien de comptes il ne montre pas — un chiffre qui baisse sans explication
-- est pire que pas de chiffre.
create or replace function public.get_admin_user_totals(
  p_tz text default 'UTC'
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select
      (now() at time zone p_tz)::date as today,
      now() - interval '7 days'       as since_7,
      now() - interval '30 days'      as since_30
  ),
  accounts as (
    select u.id, u.created_at, u.last_sign_in_at
    from auth.users u
    where u.deleted_at is null
      and coalesce(u.raw_app_meta_data->>'internal', '') <> 'true'
  ),
  raw_activity as (
    select se.user_id, (se.occurred_at at time zone p_tz)::date as day
      from public.stat_events se, bounds b
     where se.occurred_at >= b.since_30
    union
    select c.author_id, (c.created_at at time zone p_tz)::date
      from public.comments c, bounds b
     where c.author_id is not null and c.created_at >= b.since_30
    union
    select a.user_id, (a.created_at at time zone p_tz)::date
      from public.ai_usage a, bounds b
     where a.user_id is not null and a.created_at >= b.since_30
    union
    select i.created_by, (i.created_at at time zone p_tz)::date
      from public.issues i, bounds b
     where i.created_by is not null and i.created_at >= b.since_30
    union
    select acc.id, (acc.last_sign_in_at at time zone p_tz)::date
      from accounts acc, bounds b
     where acc.last_sign_in_at >= b.since_30
  ),
  -- La jointure sur `accounts` retire d'un coup les traces des comptes internes
  -- ET celles des comptes supprimés (le ledger `ai_usage` garde l'attribution).
  activity as (
    select ra.user_id, ra.day
    from raw_activity ra
    join accounts acc on acc.id = ra.user_id
  ),
  -- Projets « publics » : ceux d'un compte compté. Les tickets suivent.
  live_projects as (
    select p.id
    from public.projects p
    join accounts acc on acc.id = p.owner_id
    where p.deleted_at is null
  ),
  series as (
    select d::date as day
    from bounds b,
         generate_series(b.today - 29, b.today, interval '1 day') d
  )
  select jsonb_build_object(
    'total_users',    (select count(*) from accounts),
    'internal_users', (select count(*)
                         from auth.users u
                        where u.deleted_at is null
                          and coalesce(u.raw_app_meta_data->>'internal', '') = 'true'),
    'new_7d',         (select count(*) from accounts a, bounds b where a.created_at >= b.since_7),
    'new_30d',        (select count(*) from accounts a, bounds b where a.created_at >= b.since_30),
    'active_today',   (select count(distinct a.user_id) from activity a, bounds b where a.day = b.today),
    'active_7d',      (select count(distinct a.user_id) from activity a, bounds b where a.day > b.today - 7),
    'active_30d',     (select count(distinct a.user_id) from activity a),
    'total_projects', (select count(*) from live_projects),
    'total_issues',   (select count(*)
                         from public.issues i
                         join live_projects lp on lp.id = i.project_id),
    'days', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'day',     s.day,
            'signups', (select count(*)
                          from accounts a
                         where (a.created_at at time zone p_tz)::date = s.day),
            'active',  (select count(distinct a.user_id) from activity a where a.day = s.day)
          )
          order by s.day
        ),
        '[]'::jsonb
      )
      from series s
    )
  );
$$;

revoke all on function public.get_admin_user_totals(text) from public;
grant execute on function public.get_admin_user_totals(text) to service_role;
