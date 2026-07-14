-- minddy — Suivi des coûts LLM
-- Ledger append-only : UNE ligne par appel LLM/IA (modèle, tokens, coût USD
-- rapporté par OpenRouter). Les appels d'une même action agentique (ex. une
-- réponse Numo = jusqu'à 6 appels, une dictée = jusqu'à 3) partagent le même
-- `run_id` — ce qui permet d'agréger à trois niveaux : par APPEL (une ligne),
-- par RUN (un run_id) et par TYPE (`feature`). Un appel unique = un run d'un
-- seul appel. Aucun contenu de message n'est stocké (pas de PII).
--
-- Écrit côté serveur via le service client (RLS deny-all), calqué sur
-- `stat_events` (20260714090000). `on delete set null` sur les parents pour que
-- l'attribution du coût survive à la suppression d'un projet / d'un compte.

-- ── table ────────────────────────────────────────────────────────────────────
create table if not exists public.ai_usage (
  id                uuid primary key default gen_random_uuid(),
  run_id            uuid not null,                       -- regroupe les appels d'une action agentique
  seq               integer not null default 0,          -- ordre de l'appel dans le run (index de round)
  feature           text not null check (feature in (
                      'numo_chat', 'numo_comment', 'dictation', 'transcription',
                      'smart_assign', 'feedback_classify', 'feedback_analyze', 'embedding')),
  model             text,                                 -- modèle réellement utilisé (rapporté par OpenRouter)
  provider          text not null default 'openrouter',
  generation_id     text,                                 -- id de génération OpenRouter (nullable)
  prompt_tokens     integer,
  completion_tokens integer,
  total_tokens      integer,
  cost              numeric(12, 6),                       -- USD rapporté par OpenRouter (nullable si non fourni)
  user_id           uuid references auth.users(id) on delete set null,   -- null pour les jobs de fond / board public
  project_id        uuid references public.projects(id) on delete set null,
  conversation_id   uuid,                                 -- drill-down Numo chat (plain uuid, pas de FK)
  created_at        timestamptz not null default now()
);

create index if not exists idx_ai_usage_feature_time on public.ai_usage(feature, created_at desc);
create index if not exists idx_ai_usage_run          on public.ai_usage(run_id);
create index if not exists idx_ai_usage_project      on public.ai_usage(project_id);
create index if not exists idx_ai_usage_user         on public.ai_usage(user_id);
create index if not exists idx_ai_usage_created      on public.ai_usage(created_at desc);

-- Deny-all : aucune policy. Inserts et lectures passent par le service client
-- (route admin gatée par isAdminUser côté TS) → RLS jamais franchie autrement.
alter table public.ai_usage enable row level security;

-- ── agrégats (lecture admin uniquement) ──────────────────────────────────────
-- Retourne, sur une fenêtre `p_since` : les totaux, un breakdown par TYPE d'IA
-- (avec moyenne par run ET par appel) et la liste des runs récents. SECURITY
-- DEFINER car il n'y a pas de restriction par ligne — l'admin voit tout, et la
-- fonction n'est appelable que par le service_role (grants ci-dessous).
create or replace function public.get_ai_usage_stats(
  p_since timestamptz default (now() - interval '30 days')
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with evts as (
    select * from public.ai_usage where created_at >= p_since
  ),
  -- un enregistrement par run (un run_id appartient toujours à une seule feature)
  runs as (
    select
      run_id,
      max(feature)                       as feature,
      sum(coalesce(cost, 0))             as run_cost,
      count(*)                           as run_calls,
      sum(coalesce(total_tokens, 0))     as run_tokens,
      min(created_at)                    as first_at,
      max(model)                         as model
    from evts
    group by run_id
  ),
  totals as (
    select
      coalesce(sum(coalesce(cost, 0)), 0)         as cost,
      count(*)                                    as calls,
      count(distinct run_id)                      as runs,
      coalesce(sum(coalesce(total_tokens, 0)), 0) as tokens
    from evts
  ),
  by_feature as (
    select
      f.feature,
      f.cost,
      f.calls,
      f.tokens,
      rr.runs,
      case when rr.runs > 0  then f.cost / rr.runs  else 0 end as avg_cost_per_run,
      case when f.calls > 0  then f.cost / f.calls  else 0 end as avg_cost_per_call
    from (
      select
        feature,
        coalesce(sum(coalesce(cost, 0)), 0)         as cost,
        count(*)                                    as calls,
        coalesce(sum(coalesce(total_tokens, 0)), 0) as tokens
      from evts
      group by feature
    ) f
    join (
      select feature, count(*) as runs from runs group by feature
    ) rr on rr.feature = f.feature
  )
  select jsonb_build_object(
    'since', p_since,
    'totals', (select to_jsonb(t) from totals t),
    'by_feature', coalesce(
      (select jsonb_agg(to_jsonb(bf) order by bf.cost desc) from by_feature bf),
      '[]'::jsonb
    ),
    'recent_runs', coalesce(
      (select jsonb_agg(
                jsonb_build_object(
                  'run_id', run_id, 'feature', feature, 'cost', run_cost,
                  'calls', run_calls, 'tokens', run_tokens,
                  'first_at', first_at, 'model', model
                ) order by first_at desc
              )
       from (select * from runs order by first_at desc limit 50) r),
      '[]'::jsonb
    )
  );
$$;

-- Détail d'un run : les appels individuels (le « regroupés mais visibles un à un »).
create or replace function public.get_ai_run_calls(p_run_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id, 'seq', seq, 'feature', feature, 'model', model,
        'generation_id', generation_id, 'prompt_tokens', prompt_tokens,
        'completion_tokens', completion_tokens, 'total_tokens', total_tokens,
        'cost', cost, 'created_at', created_at
      ) order by seq asc, created_at asc
    ),
    '[]'::jsonb
  )
  from public.ai_usage
  where run_id = p_run_id;
$$;

-- Réservé au service_role (jamais anon/authenticated) : la route admin l'appelle
-- via le service client après le gate isAdminUser.
revoke all on function public.get_ai_usage_stats(timestamptz) from public;
revoke all on function public.get_ai_run_calls(uuid)          from public;
grant execute on function public.get_ai_usage_stats(timestamptz) to service_role;
grant execute on function public.get_ai_run_calls(uuid)          to service_role;
