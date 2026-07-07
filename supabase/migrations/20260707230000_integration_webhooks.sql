-- minddy — Webhooks sortants par intégration
-- Une intégration peut déclarer une URL de webhook, les événements suivis
-- (issue.created / issue.status_changed / issue.updated) et un scope :
-- 'integration' = seulement les tickets créés par elle, 'all' = tout le projet.
-- Livraison best-effort ; la dernière tentative est mémorisée pour l'UI.
-- La signature HMAC des payloads utilise key_hash comme secret (dérivé de la
-- clé API que le récepteur détient déjà) — aucune colonne supplémentaire.
-- Idempotent — safe to re-run.

alter table public.integrations
  add column if not exists webhook_url text,
  add column if not exists webhook_events text[] not null default '{}',
  add column if not exists webhook_scope text not null default 'integration',
  add column if not exists webhook_last_status text,
  add column if not exists webhook_last_at timestamptz;

alter table public.integrations
  drop constraint if exists integrations_webhook_scope_check;
alter table public.integrations
  add constraint integrations_webhook_scope_check
  check (webhook_scope in ('integration', 'all'));
