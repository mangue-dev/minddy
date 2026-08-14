-- minddy — MIN-345 : un jeton SSO de board ne vaut qu'UNE fois
--
-- Le JWT SSO voyage dans une URL (`/f/<token>/sso?jwt=…`). Une URL se recopie,
-- se journalise chez un proxy, part en `Referer` et reste dans l'historique du
-- navigateur — et jusqu'ici, la rejouer rouvrait une session de board sous
-- l'identité de sa victime, pendant toute la fenêtre du jeton.
--
-- Cette table est la trace de consommation : une ligne par jeton présenté, la
-- clé primaire fait le refus du second passage. `token_id` dérive de la
-- SIGNATURE du jeton (sha256 hex, cf. lib/feedback/sso-jwt.ts) — rien à exiger
-- du backend qui signe, et rien de falsifiable sans le secret du board.
--
-- Rétention : `expires_at` recopie l'`exp` du jeton. Passé cet instant le jeton
-- est refusé par le vérificateur lui-même, donc sa trace ne sert plus à rien —
-- la purge opportuniste (lib/server/feedback/sso-replay.ts) la retire. La table
-- ne garde jamais plus que la fenêtre SSO en cours, soit dix minutes.
-- Idempotent — safe to re-run.

create table if not exists public.feedback_sso_replays (
  board_id   uuid not null references public.feedback_boards(id) on delete cascade,
  token_id   text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (board_id, token_id)
);

comment on table public.feedback_sso_replays is
  'Jetons SSO de board déjà consommés (MIN-345). La clé primaire refuse le rejeu ; les lignes sont purgées passé expires_at.';

create index if not exists feedback_sso_replays_expiry
  on public.feedback_sso_replays (expires_at);

-- Aucune policy, à dessein : seule la clé service écrit et lit ici. RLS activée
-- refuse donc tout à `anon` comme à `authenticated` — un visiteur de board n'a
-- rien à y voir, et rien à y effacer.
alter table public.feedback_sso_replays enable row level security;
