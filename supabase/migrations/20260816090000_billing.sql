-- minddy — MIN-72 : plans & billing (Stripe + budget d'usage).
--
-- Le métering existe déjà (`ai_usage`, une ligne typée par appel IA avec son
-- coût USD réel). Cette migration ajoute l'état d'abonnement et l'idempotence
-- webhook, calqués sur AutoKap (billing_accounts / stripe_webhook_events) :
--   - `billing_accounts`   : une ligne par user — état Stripe + override admin.
--     Le plan effectif n'est PAS stocké : il est résolu côté serveur
--     (admin_override → abonnement Stripe actif → free) dans
--     lib/server/billing-accounts.ts.
--   - `stripe_webhook_events` : journal des events Stripe ; le PK sur
--     stripe_event_id sert de garde d'idempotence (insert en conflit = déjà vu).
--   - feature `sandbox_compute` : le compute Vercel Sandbox des agents entre au
--     ledger (wall-clock × $/min, provider 'vercel') — seul le LLM était compté.
--   - RPC `get_user_usage_since` : agrégat par feature de la fenêtre courante,
--     consommé par le résumé d'usage (header + page billing).

-- ── billing_accounts ─────────────────────────────────────────────────────────
create table if not exists public.billing_accounts (
  user_id                     uuid primary key references auth.users(id) on delete cascade,
  email                       text,
  -- Override manuel (admin) : prioritaire sur Stripe. Ex. offrir Pro à un testeur.
  admin_override_plan_id      text,
  admin_override_note         text,
  stripe_customer_id          text unique,
  stripe_subscription_id      text unique,
  stripe_price_id             text,
  -- Plan résolu depuis le price au moment du sync ('go' | 'pro').
  stripe_plan_id              text,
  -- Statut brut Stripe : active | trialing | past_due | canceled | unpaid | paused…
  stripe_subscription_status  text,
  stripe_current_period_start timestamptz,
  stripe_current_period_end   timestamptz,
  stripe_cancel_at_period_end boolean not null default false,
  stripe_checkout_session_id  text,
  -- Bookkeeping du dernier event webhook appliqué (anti-régression out-of-order).
  stripe_last_event_id        text,
  stripe_last_event_created   timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index if not exists idx_billing_accounts_stripe_customer
  on public.billing_accounts(stripe_customer_id) where stripe_customer_id is not null;
create index if not exists idx_billing_accounts_stripe_subscription
  on public.billing_accounts(stripe_subscription_id) where stripe_subscription_id is not null;

-- L'utilisateur lit sa propre ligne ; toutes les écritures passent par le
-- service client (webhook, checkout, sync) — aucune policy INSERT/UPDATE.
alter table public.billing_accounts enable row level security;

drop policy if exists "billing_accounts_select_own" on public.billing_accounts;
create policy "billing_accounts_select_own" on public.billing_accounts
  for select using (auth.uid() = user_id);

-- ── stripe_webhook_events ────────────────────────────────────────────────────
create table if not exists public.stripe_webhook_events (
  stripe_event_id text primary key,
  type            text not null,
  livemode        boolean not null default false,
  payload         jsonb,
  processed_at    timestamptz,
  created_at      timestamptz not null default now()
);

-- Deny-all : service client uniquement (le handler webhook).
alter table public.stripe_webhook_events enable row level security;

-- ── feature 'sandbox_compute' ────────────────────────────────────────────────
-- Étend le CHECK inline (même mécanique que 20260806091000). Idempotent.
alter table public.ai_usage drop constraint if exists ai_usage_feature_check;

alter table public.ai_usage add constraint ai_usage_feature_check
  check (feature in (
    'numo_chat', 'numo_comment', 'dictation', 'transcription',
    'smart_assign', 'feedback_classify', 'feedback_analyze', 'embedding',
    'agent_code', 'sandbox_compute'));

-- ── agrégat d'usage de la fenêtre ────────────────────────────────────────────
-- Somme des coûts d'UN utilisateur depuis p_since, ventilée par feature.
-- SECURITY DEFINER + service_role uniquement : appelée par les routes billing
-- après authentification (le user_id vient de la session, jamais du client).
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
    where user_id = p_user_id and created_at >= p_since
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

revoke all on function public.get_user_usage_since(uuid, timestamptz) from public;
grant execute on function public.get_user_usage_since(uuid, timestamptz) to service_role;
