-- minddy — MIN-46 / MIN-10 : clés IA « BYOK » (Bring Your Own Key)
--
-- Une clé provider (OpenRouter) que l'utilisateur fournit pour un usage
-- ILLIMITÉ de l'agent de code (sinon plafond mensuel sur la clé plateforme).
-- Niveau COMPTE (auth.users), réutilisable sur tous ses projets — pattern
-- api_keys / git_connections. La clé est chiffrée au repos (enveloppe
-- AES-256-GCM via AI_KEY_ENCRYPTION_SECRET) ; l'API ne renvoie JAMAIS la clé,
-- seulement provider + key_prefix. RLS : lecture propriétaire, écritures
-- service client. Idempotent — safe to re-run.

create table if not exists public.user_ai_keys (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  -- 'openrouter' pour l'instant. Pas de CHECK : le code fait autorité.
  provider       text not null default 'openrouter',
  key_encrypted  text not null,      -- enveloppe AES-256-GCM (jamais renvoyée)
  key_prefix     text,               -- affichage seul (ex. 'sk-or-v1-abc…')
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  last_used_at   timestamptz
);

-- Une clé par (compte, provider) → reconnexion = upsert.
create unique index if not exists idx_user_ai_keys_user_provider
  on public.user_ai_keys(user_id, provider);

alter table public.user_ai_keys enable row level security;

-- Lecture = le propriétaire (la colonne key_encrypted n'est jamais sélectionnée
-- côté API). Écritures = service client seulement.
drop policy if exists user_ai_keys_select on public.user_ai_keys;
create policy user_ai_keys_select on public.user_ai_keys for select
  using (user_id = (select auth.uid()));

drop trigger if exists user_ai_keys_set_updated_at on public.user_ai_keys;
create trigger user_ai_keys_set_updated_at
  before update on public.user_ai_keys
  for each row execute function public.set_updated_at();
