-- minddy — MIN-72 : l'onglet admin « Quotas » passe au budget unifié du plan.
--
-- L'ancien plafond global `agent_monthly_cap_usd` (10 $ fixes, feature
-- agent_code seule) est remplacé par le budget mensuel du PLAN de chaque
-- utilisateur, toutes features confondues. La RPC ne filtre donc plus sur
-- agent_code : elle liste TOUT utilisateur ayant consommé de l'IA sur la
-- fenêtre, avec sa dépense réelle (analyses, jamais altérée) et sa dépense
-- comptée (depuis le filigrane admin `agent_quota_resets`). Le plan et le
-- budget sont résolus côté route (lib/server/usage.ts — vraie fenêtre Stripe).

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
  left join public.agent_quota_resets r on r.user_id = u.user_id
  where u.user_id is not null
    and u.created_at >= p_month_start
  group by u.user_id, r.reset_at
  order by spent_month desc
$$;
