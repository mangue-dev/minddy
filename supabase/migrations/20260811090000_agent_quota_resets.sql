-- minddy — Remise à zéro ADMIN du quota agent, par utilisateur.
--
-- Le plafond mensuel de l'agent (MIN-46) se calcule en sommant `ai_usage.cost`
-- (feature 'agent_code') depuis le 1er du mois. Un admin doit pouvoir redonner du
-- souffle à un utilisateur SANS perdre la donnée de coût : `ai_usage` est un ledger
-- append-only, c'est la source de vérité des analyses (elle garde même l'attribution
-- d'un compte supprimé, via `on delete set null`). Supprimer des lignes pour
-- « débloquer » quelqu'un fausserait les analyses pour toujours.
--
-- D'où un FILIGRANE plutôt qu'une suppression : `reset_at` marque le début de la
-- fenêtre que le quota compte. Le calcul devient
--     somme des coûts depuis max(début du mois, reset_at)
-- Aucune ligne d'`ai_usage` n'est touchée : la dépense réelle du mois reste
-- intégralement lisible côté analyses, à côté de ce que le quota compte réellement.
-- Annuler une remise à zéro = supprimer la ligne (le quota reprend le mois entier).

create table if not exists public.agent_quota_resets (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  -- Début de la fenêtre comptée par le quota. Toute dépense ANTÉRIEURE reste dans
  -- ai_usage (analyses) mais ne compte plus vers le plafond.
  reset_at   timestamptz not null default now(),
  -- Qui a remis à zéro (traçabilité) ; on garde la ligne si l'admin est supprimé.
  reset_by   uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_agent_quota_resets_reset_at
  on public.agent_quota_resets(reset_at desc);

-- Deny-all : AUCUNE policy. Capital — une policy en lecture/écriture pour
-- `authenticated` laisserait n'importe qui remettre SON propre quota à zéro et le
-- plafond ne vaudrait plus rien. Seul le service client (route admin, gatée par
-- isAdminUser côté TS) y touche.
alter table public.agent_quota_resets enable row level security;

-- ── agrégat admin : dépense agent par utilisateur ────────────────────────────
-- Renvoie, pour le mois en cours, une ligne par utilisateur ayant consommé
-- l'agent, avec DEUX montants distincts — c'est tout l'intérêt :
--   • spent_month   : la dépense RÉELLE du mois (analyses, jamais altérée) ;
--   • spent_counted : ce que le plafond compte VRAIMENT (depuis le filigrane).
-- Après une remise à zéro, spent_counted retombe à 0 pendant que spent_month
-- continue d'afficher la vérité comptable.
-- SECURITY DEFINER (la table est en deny-all) + n'est exécutable que par le
-- service_role, comme get_ai_usage_stats.
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
  where u.feature = 'agent_code'
    and u.user_id is not null
    and u.created_at >= p_month_start
  group by u.user_id, r.reset_at
  order by spent_month desc;
$$;

revoke all on function public.get_agent_quota_usage(timestamptz) from public;
grant execute on function public.get_agent_quota_usage(timestamptz) to service_role;
