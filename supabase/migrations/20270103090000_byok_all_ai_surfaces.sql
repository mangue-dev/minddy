-- minddy — MIN-366 : le BYOK couvre toutes les surfaces IA, au choix du compte.
--
-- Les lignes existantes prennent le défaut de la colonne : tout est activé,
-- conformément à la promesse produit. `feature_models` ne contient que les
-- choix explicites de l'user ; un objet vide suit les défauts admin/provider.

alter table public.user_ai_keys
  add column if not exists enabled_surfaces text[] not null default
    array['agent', 'assistant', 'automations', 'voice', 'feedback']::text[],
  add column if not exists feature_models jsonb not null default '{}'::jsonb;

alter table public.user_ai_keys
  drop constraint if exists user_ai_keys_enabled_surfaces_check,
  add constraint user_ai_keys_enabled_surfaces_check check (
    enabled_surfaces <@ array['agent', 'assistant', 'automations', 'voice', 'feedback']::text[]
  ),
  drop constraint if exists user_ai_keys_feature_models_object_check,
  add constraint user_ai_keys_feature_models_object_check
    check (jsonb_typeof(feature_models) = 'object');

-- Le ledger garde le coût réel (utile aux finances) mais le quota ne somme que
-- ce que Minddy a payé. Sans ce mode, OpenRouter rapporterait le coût d'une clé
-- utilisateur et le ferait malgré tout sortir de son budget inclus.
alter table public.ai_usage
  add column if not exists key_mode text not null default 'platform';

alter table public.ai_usage
  drop constraint if exists ai_usage_key_mode_check,
  add constraint ai_usage_key_mode_check check (key_mode in ('platform', 'byok'));

create or replace function public.get_user_usage_since(
  p_user_id uuid,
  p_since   timestamptz
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with evts as (
    select feature, coalesce(cost, 0) as cost, run_id
    from public.ai_usage
    where user_id = p_user_id
      and created_at >= p_since
      and key_mode = 'platform'
  ),
  by_feature as (
    select feature,
           sum(cost)               as cost,
           count(*)                as calls,
           count(distinct run_id)  as runs
    from evts
    group by feature
  )
  select jsonb_build_object(
    'since', p_since,
    'total_cost', coalesce((select sum(cost) from evts), 0),
    'by_feature', coalesce(
      (select jsonb_agg(to_jsonb(bf) order by bf.cost desc) from by_feature bf),
      '[]'::jsonb
    )
  );
$$;

revoke all on function public.get_user_usage_since(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.get_user_usage_since(uuid, timestamptz) to service_role;
