-- minddy — codes de récupération du second facteur (MIN-132)
--
-- Supabase couvre l'enrôlement TOTP et le challenge, mais PAS la récupération.
-- Sans elle, un téléphone perdu vaut un compte perdu : il n'y a pas d'équipe
-- support pour rattraper, et une 2FA sans porte de sortie transforme une mesure
-- de sécurité en risque de perte de données. D'où cette table.
--
-- Un code consommé ne délivre pas d'`aal2` — seul GoTrue peut en frapper un. Il
-- DÉSACTIVE la 2FA : les facteurs sont supprimés côté GoTrue et le drapeau
-- `app_metadata.mfa_enabled` retombe à false, ce qui rend le compte à nouveau
-- utilisable en `aal1`. La personne réactive ensuite depuis ses réglages.
--
-- Même pattern de secret que `api_keys` et le serveur OAuth : seul le sha256 hex
-- est persisté, le clair n'existe qu'une fois, à l'écran, au moment de l'envoi.
-- Les codes tirent ~50 bits d'entropie, donc sha256 nu suffit — il n'y a rien à
-- deviner par force brute hors ligne, contrairement à un mot de passe.
--
-- RLS activée SANS AUCUNE POLICY : ces lignes ne se lisent et ne s'écrivent que
-- par la clé de service. Un client authentifié n'a aucune raison de voir ne
-- serait-ce que le hash de ses propres codes — il les a déjà reçus en clair.
--
-- Idempotent — safe to re-run.

create table if not exists public.mfa_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- Le seul accès est « les codes non utilisés de cette personne ».
create index if not exists mfa_recovery_codes_user_idx
  on public.mfa_recovery_codes (user_id)
  where used_at is null;

-- Deux codes identiques sur un même compte n'auraient aucun sens : la
-- consommation en marquerait un seul et l'autre resterait valide.
create unique index if not exists mfa_recovery_codes_user_hash_key
  on public.mfa_recovery_codes (user_id, code_hash);

alter table public.mfa_recovery_codes enable row level security;

comment on table public.mfa_recovery_codes is
  'Codes de récupération 2FA (MIN-132). sha256 hex uniquement ; service role only (RLS sans policy). Un code consommé désactive la 2FA du compte.';
