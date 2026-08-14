-- MIN-347 — le bruteforce d'un partage protégé n'était freiné que par un
-- compteur EN MÉMOIRE.
--
-- Même défaut que le relais d'e-mail de MIN-342 : un compteur en mémoire ne voit
-- qu'une instance sur N et repart à zéro à chaque déploiement. Sur une porte
-- ANONYME dont le seul secret est un mot de passe choisi par le propriétaire,
-- c'est le seul frein qui existe — et il suffisait de déployer, ou d'attendre un
-- recyclage de lambda, pour le remettre à zéro.
--
-- On range donc les ÉCHECS. Une tentative réussie efface les échecs de son
-- origine : quelqu'un qui se trompe deux fois puis entre le bon mot de passe ne
-- traîne pas de dette.
--
-- Un HASH d'IP, pas l'IP : la table sert à COMPTER, pas à identifier — même
-- règle et même sel applicatif que `feedback_otp_codes.ip_hash`.
--
-- Idempotent — safe to re-run.

create table if not exists public.share_unlock_attempts (
  id uuid primary key default gen_random_uuid(),
  share_id uuid not null references public.view_shares(id) on delete cascade,
  ip_hash text not null,
  created_at timestamptz not null default now()
);

-- Les deux seules lectures : « les échecs de cette origine sur ce partage » et
-- « les échecs de ce partage, toutes origines » (le balayage distribué).
create index if not exists share_unlock_attempts_share_ip_idx
  on public.share_unlock_attempts (share_id, ip_hash, created_at desc);
create index if not exists share_unlock_attempts_share_idx
  on public.share_unlock_attempts (share_id, created_at desc);

-- RLS activée SANS AUCUNE POLICY : ces lignes ne se lisent et ne s'écrivent que
-- par la clé de service, depuis la porte publique elle-même.
alter table public.share_unlock_attempts enable row level security;

comment on table public.share_unlock_attempts is
  'Échecs de déverrouillage d''un partage protégé (MIN-347). Compteur persistant — le compteur en mémoire repartait à zéro à chaque déploiement. Purge opportuniste au-delà de la fenêtre. Service role only (RLS sans policy).';
