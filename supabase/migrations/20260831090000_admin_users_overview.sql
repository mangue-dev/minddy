-- minddy — MIN-90 : vue admin des UTILISATEURS + statistiques globales.
--
-- Deux agrégats réservés au service client, sur le patron exact de
-- `get_agent_quota_usage` (20260811090000) : `security definer` (elles lisent
-- `auth.users` et des tables en deny-all), `revoke ... from public`, puis
-- `grant execute` au seul `service_role`. Le gate métier reste `isAdminUser`
-- côté TypeScript (`lib/server/admin.ts`), comme les autres routes `/api/admin`.
--
-- Aucune logique produit n'est dupliquée ici : les fonctions renvoient les
-- INGRÉDIENTS BRUTS (métadonnées auth, compteurs, horodatages) et les routes
-- les composent avec les résolveurs partagés déjà en place
-- (`resolveOnboardingState`, `resolveCyclePrefs`, `resolvePlanFromBillingAccount`,
-- `getUserUsage`). Dupliquer l'onboarding ou la résolution de plan en SQL
-- garantirait la dérive dès la première évolution du produit.

-- Les agrégats balayent des colonnes non indexées (créateur d'un ticket, auteur
-- d'un commentaire, consommateur d'IA) : trois index, idempotents.
create index if not exists idx_issues_created_by
  on public.issues(created_by);
create index if not exists idx_comments_author
  on public.comments(author_id, created_at desc);
create index if not exists idx_ai_usage_user_created
  on public.ai_usage(user_id, created_at desc);

-- ── une ligne par compte ─────────────────────────────────────────────────────
-- `p_search` filtre sur l'email OU le nom d'affichage (insensible à la casse) ;
-- `total_count` est le nombre de comptes correspondant AVANT pagination (window
-- function, donc évaluée avant le LIMIT) — de quoi afficher « x sur y ».
create or replace function public.get_admin_users_overview(
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
      u.email_confirmed_at
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

-- ── totaux et activité de l'app ──────────────────────────────────────────────
-- « Actif » n'est PAS « connecté » : `last_sign_in_at` ne bouge pas au
-- rafraîchissement de jeton, un utilisateur quotidien peut n'avoir signé
-- qu'une fois il y a six mois. On prend donc l'union des traces attribuées —
-- ticket créé/terminé (`stat_events`), commentaire, appel IA, ticket créé — ET
-- la dernière connexion. Le libellé de l'écran explicite cette définition.
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
  ),
  activity as (
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
  series as (
    select d::date as day
    from bounds b,
         generate_series(b.today - 29, b.today, interval '1 day') d
  )
  select jsonb_build_object(
    'total_users',    (select count(*) from accounts),
    'new_7d',         (select count(*) from accounts a, bounds b where a.created_at >= b.since_7),
    'new_30d',        (select count(*) from accounts a, bounds b where a.created_at >= b.since_30),
    'active_today',   (select count(distinct a.user_id) from activity a, bounds b where a.day = b.today),
    'active_7d',      (select count(distinct a.user_id) from activity a, bounds b where a.day > b.today - 7),
    'active_30d',     (select count(distinct a.user_id) from activity a),
    'total_projects', (select count(*) from public.projects where deleted_at is null),
    'total_issues',   (select count(*)
                         from public.issues i
                         join public.projects p on p.id = i.project_id and p.deleted_at is null),
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
