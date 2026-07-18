-- minddy — MIN-72 (retours) : historique d'usage typé de la page billing.
--
-- Une entrée = un RUN du ledger `ai_usage` (les appels d'une même action
-- partagent run_id — une réponse Numo, une dictée… ; les lignes LLM et
-- `sandbox_compute` d'un même run agent fusionnent d'elles-mêmes ici, l'UI ne
-- montre qu'UN « agent de code »). Pagination offset + filtre par features.
-- SECURITY DEFINER + service_role uniquement : appelée par
-- GET /api/billing/usage-history après authentification.

create or replace function public.get_user_usage_history(
  p_user_id uuid,
  p_since   timestamptz,
  p_features text[] default null,
  p_limit   integer default 25,
  p_offset  integer default 0
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with runs as (
    select
      u.run_id,
      -- min() : dans un run mixte agent, 'agent_code' < 'sandbox_compute' —
      -- le run garde le type que l'utilisateur reconnaît.
      min(u.feature)             as feature,
      sum(coalesce(u.cost, 0))   as cost,
      count(*)                   as calls,
      min(u.created_at)          as first_at,
      max(u.project_id::text)::uuid as project_id
    from public.ai_usage u
    where u.user_id = p_user_id
      and u.created_at >= p_since
      and (p_features is null or u.feature = any(p_features))
    group by u.run_id
  )
  select jsonb_build_object(
    'total', (select count(*) from runs),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
               'run_id', r.run_id,
               'feature', r.feature,
               'cost', r.cost,
               'calls', r.calls,
               'first_at', r.first_at,
               'project_id', r.project_id,
               'project_name', p.name
             ) order by r.first_at desc)
      from (
        select * from runs order by first_at desc limit p_limit offset p_offset
      ) r
      left join public.projects p on p.id = r.project_id
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.get_user_usage_history(uuid, timestamptz, text[], integer, integer) from public;
grant execute on function public.get_user_usage_history(uuid, timestamptz, text[], integer, integer) to service_role;
