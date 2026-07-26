-- minddy — MIN-92 : page Finances (coûts ET entrées).
--
-- Deux briques ici :
--   1. `fx_rates` — le taux USD→EUR, UNE LIGNE PAR JOUR CALENDAIRE. Les coûts
--      arrivent en USD (OpenRouter), le revenu est déjà en EUR (devise de
--      règlement du compte Stripe) : seule la colonne coûts se convertit.
--      Historiser plutôt qu'appliquer « le taux du jour partout » rend
--      l'historique DÉFINITIF — un graphique de mars ne se réécrit plus quand
--      l'euro bouge en juillet.
--   2. `get_ai_cost_daily` — la série quotidienne des coûts, densifiée par
--      `generate_series` (même traitement que les bandes de la vue d'ensemble,
--      `get_admin_user_totals`) et jointe au taux de CHAQUE journée. Une journée
--      sans appel IA est une barre à zéro, pas un trou.
--
-- Réservé au service client, comme `ai_usage` : RLS deny-all sur la table,
-- `security definer` + grant au seul `service_role` sur la fonction. Le gate
-- métier reste `isAdminUser` côté TypeScript (`lib/server/admin.ts`).

-- ── taux de change ───────────────────────────────────────────────────────────
-- Source : Frankfurter (taux de référence BCE), rafraîchi par le cron quotidien
-- `app/api/cron/fx-rate/route.ts`. La BCE ne publie que les jours ouvrés : le
-- cron reporte le dernier taux connu sur les week-ends et fériés pour qu'AUCUNE
-- journée ne manque à la jointure ci-dessous.
create table if not exists public.fx_rates (
  day        date primary key,
  usd_eur    numeric(12, 6) not null,
  fetched_at timestamptz not null default now()
);

-- Deny-all : aucune policy. Lectures et écritures passent par le service client.
alter table public.fx_rates enable row level security;

-- ── série quotidienne des coûts ──────────────────────────────────────────────
-- Renvoie un tableau d'objets `{ day, cost_usd, cost_eur, usd_eur, calls, runs }`,
-- un par jour de la fenêtre, ordonné.
--
-- Les COMPTES INTERNES ne sont volontairement pas exclus : ils ne paient pas
-- (donc hors revenus), mais l'argent dépensé pour eux sort vraiment de la poche
-- — un coût est un coût, quel que soit le compte qui l'a déclenché.
--
-- Le taux appliqué à une journée est le dernier taux connu à cette date
-- (report), et à défaut le plus ancien taux connu — sans ce second repli, tout
-- l'historique déjà présent dans `ai_usage` s'afficherait non converti tant que
-- le cron n'aurait pas tourné assez de fois pour couvrir la fenêtre.
create or replace function public.get_ai_cost_daily(
  p_days integer default 30,
  p_tz   text    default 'UTC'
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select
      (now() at time zone p_tz)::date                       as today,
      greatest(least(coalesce(p_days, 30), 365), 1)         as span
  ),
  series as (
    select d::date as day
    from bounds b,
         generate_series(b.today - (b.span - 1), b.today, interval '1 day') d
  ),
  daily as (
    select
      (a.created_at at time zone p_tz)::date as day,
      sum(coalesce(a.cost, 0))               as cost_usd,
      count(*)                               as calls,
      count(distinct a.run_id)               as runs
    from public.ai_usage a, bounds b
    where (a.created_at at time zone p_tz)::date >= b.today - (b.span - 1)
    group by 1
  ),
  rated as (
    select
      s.day,
      coalesce(d.cost_usd, 0) as cost_usd,
      coalesce(d.calls, 0)    as calls,
      coalesce(d.runs, 0)     as runs,
      coalesce(
        (select f.usd_eur from public.fx_rates f
          where f.day <= s.day order by f.day desc limit 1),
        (select f.usd_eur from public.fx_rates f
          where f.day >  s.day order by f.day asc  limit 1)
      ) as usd_eur
    from series s
    left join daily d on d.day = s.day
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'day',      r.day,
        'cost_usd', round(r.cost_usd, 6),
        -- null (et pas 0) quand aucun taux n'est connu : « pas encore
        -- convertible » et « zéro euro » ne se confondent pas à l'écran.
        'cost_eur', case when r.usd_eur is null then null
                         else round(r.cost_usd * r.usd_eur, 6) end,
        'usd_eur',  r.usd_eur,
        'calls',    r.calls,
        'runs',     r.runs
      ) order by r.day
    ),
    '[]'::jsonb
  )
  from rated r;
$$;

revoke all on function public.get_ai_cost_daily(integer, text) from public;
grant execute on function public.get_ai_cost_daily(integer, text) to service_role;
