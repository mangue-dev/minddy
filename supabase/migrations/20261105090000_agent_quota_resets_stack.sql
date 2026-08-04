-- minddy — empiler les remises à zéro du budget d'usage IA.
--
-- Le filigrane était UNIQUE par compte (`user_id` en clé primaire) : une
-- deuxième remise à zéro dans la même période de facturation écrasait la trace
-- de la première. On ne pouvait donc ni les cumuler, ni dire combien on avait
-- déjà offert à quelqu'un — alors que c'est exactement la question qu'on se
-- pose avant d'en offrir une de plus.
--
-- La table devient un REGISTRE : une ligne par geste, et la fenêtre comptée
-- part de la PLUS RÉCENTE. Les lignes existantes deviennent la première entrée
-- du registre de leur compte, sans rien changer à ce qu'elles disaient.
--
-- Conséquence à ne pas manquer : toute jointure `on r.user_id = …` multipliait
-- la ligne du compte par le nombre de gestes. Les deux fonctions qui joignaient
-- cette table sont donc reprises ici, en `max(reset_at)`.

-- ── le registre ──────────────────────────────────────────────────────────────
alter table public.agent_quota_resets
  add column if not exists id uuid not null default gen_random_uuid();

-- La clé primaire passe de `user_id` à `id`. Le nom de la contrainte est LU,
-- jamais supposé, et l'état visé est vérifié avant chaque geste : rejouée sur
-- une base déjà migrée, cette migration ne fait rien.
do $$
declare
  pk_name text;
  pk_col  text;
begin
  select c.conname, a.attname
    into pk_name, pk_col
    from pg_constraint c
    join lateral unnest(c.conkey) k(attnum) on true
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
   where c.conrelid = 'public.agent_quota_resets'::regclass
     and c.contype = 'p'
   limit 1;

  if pk_col = 'user_id' then
    execute format(
      'alter table public.agent_quota_resets drop constraint %I', pk_name
    );
  end if;

  if pk_col is distinct from 'id' then
    alter table public.agent_quota_resets
      add constraint agent_quota_resets_pkey primary key (id);
  end if;
end $$;

-- La lecture qui compte : le dernier geste d'un compte, et la liste de ceux de
-- sa période de facturation.
create index if not exists idx_agent_quota_resets_user_at
  on public.agent_quota_resets(user_id, reset_at desc);

-- Deny-all inchangé (aucune policy) : seul le service client écrit ici. Une
-- policy d'écriture laisserait n'importe qui s'offrir des remises à zéro à
-- volonté — et un registre les empilerait sans même l'ombre d'une trace unique.

-- ── une ligne par compte, avec sa DERNIÈRE remise à zéro ─────────────────────
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
  -- La table est un REGISTRE depuis 20261105 : une ligne par remise à zéro.
  -- Une jointure directe multiplierait donc la ligne du compte par le nombre de
  -- gestes posés — la page se mettrait à répéter les comptes et à mentir sur
  -- son total. Ce qui compte ici est la PLUS RÉCENTE, et elle seule.
  left join lateral (
    select max(q.reset_at) as reset_at
      from public.agent_quota_resets q
     where q.user_id = p.id
  ) r on true
  order by p.created_at desc;
$$;


revoke all on function public.get_admin_users_overview(text, integer, integer) from public;
grant execute on function public.get_admin_users_overview(text, integer, integer) to service_role;

-- ── dépense agent par compte (legacy) ────────────────────────────────────────
-- Plus appelée par l'app depuis que l'onglet « Quotas » a fondu dans la fiche
-- d'un compte, mais elle joignait le filigrane de la même façon : la corriger
-- coûte trois lignes, la laisser fausse coûte une enquête le jour où quelqu'un
-- la rappelle.
create or replace function public.get_agent_quota_usage(
  p_month_start timestamptz
)
returns table (
  user_id       uuid,
  spent_month   numeric,
  spent_counted numeric,
  calls         bigint,
  last_used_at  timestamptz,
  reset_at      timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    u.user_id,
    coalesce(sum(u.cost), 0)::numeric as spent_month,
    coalesce(
      sum(u.cost) filter (
        where u.created_at >= greatest(p_month_start, coalesce(r.reset_at, p_month_start))
      ),
      0
    )::numeric as spent_counted,
    count(*)::bigint as calls,
    max(u.created_at) as last_used_at,
    r.reset_at
  from public.ai_usage u
  left join lateral (
    select max(q.reset_at) as reset_at
      from public.agent_quota_resets q
     where q.user_id = u.user_id
  ) r on true
  where u.user_id is not null
    and u.created_at >= p_month_start
  group by u.user_id, r.reset_at
  order by spent_month desc
$$;

revoke all on function public.get_agent_quota_usage(timestamptz) from public;
grant execute on function public.get_agent_quota_usage(timestamptz) to service_role;
